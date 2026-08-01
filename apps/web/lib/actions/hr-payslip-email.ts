"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import {
  getActionAuthContext,
  type ActionAuthContext,
} from "@/lib/auth/action-context";
import { sendAppEmail } from "@/lib/email/transport";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";
import { formatPayrollMonthLabel, summarizePayrollLeave } from "@/lib/hr/payroll";
import {
  loadPayrollSettings,
  resolveEmployeePaymentMethod,
} from "@/lib/hr/payroll/persist-run";
import {
  buildPayslipPdfBase64,
  buildPayslipPdfFilename,
  derivePayslipLineDiscountFields,
  type PayslipPdfInput,
} from "@/lib/hr/payslip-pdf";
import { sortPayslipLines } from "@/lib/hr/payslip-line-order";
import { loadPayslipLetterheadForVenue } from "@/lib/hr/payslip-letterhead";
import { loadPayslipPdfLogoServer } from "@/lib/hr/payslip-pdf-logo-server";
import { dayFractionsFromSnapshot } from "@/lib/hr/payroll/wps";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  createPayslipEmailTemplate,
  DEFAULT_HR_PAYSLIP_EMAIL_SETTINGS,
  DEFAULT_PAYSLIP_EMAIL_SUBJECT,
  DEFAULT_PAYSLIP_EMAIL_TEMPLATE,
  DEFAULT_PAYSLIP_EMAIL_TEMPLATE_ID,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  resolvePayslipEmailTemplate,
  type HrPayslipEmailSettings,
  type PayslipEmailRecipientField,
  type PayslipEmailTemplate,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import { getVenueLogoUrl } from "@/lib/venue/branding";

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

function normalizeTemplates(
  raw: unknown,
  legacy?: { subject?: string; message?: string },
): PayslipEmailTemplate[] {
  const list = Array.isArray(raw) ? raw : [];
  const templates: PayslipEmailTemplate[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    templates.push(
      createPayslipEmailTemplate({
        id,
        name: String(row.name ?? "Template"),
        subject: String(row.subject ?? DEFAULT_PAYSLIP_EMAIL_SUBJECT),
        message: String(row.message ?? ""),
      }),
    );
  }

  if (templates.length === 0) {
    const legacySubject = String(legacy?.subject ?? "").trim();
    const legacyMessage = String(legacy?.message ?? "");
    templates.push(
      createPayslipEmailTemplate({
        id: DEFAULT_PAYSLIP_EMAIL_TEMPLATE_ID,
        name: "Default",
        subject: legacySubject || DEFAULT_PAYSLIP_EMAIL_SUBJECT,
        message:
          legacyMessage || DEFAULT_PAYSLIP_EMAIL_TEMPLATE.message,
      }),
    );
  }

  return templates;
}

function mergePayslipEmailSettings(
  partial:
    | (Partial<HrPayslipEmailSettings> & {
        subject?: string;
        message?: string;
      })
    | null
    | undefined,
): HrPayslipEmailSettings {
  const base = DEFAULT_HR_PAYSLIP_EMAIL_SETTINGS;
  const recipientField = (partial?.recipientField ??
    base.recipientField) as PayslipEmailRecipientField;
  const allowed: PayslipEmailRecipientField[] = [
    "work",
    "personal",
    "work_then_personal",
  ];
  const templates = normalizeTemplates(partial?.templates, {
    subject: partial?.subject,
    message: partial?.message,
  });
  const requestedDefault = String(
    partial?.defaultTemplateId ?? base.defaultTemplateId,
  ).trim();
  const defaultTemplateId = templates.some((t) => t.id === requestedDefault)
    ? requestedDefault
    : templates[0]!.id;

  return {
    enabled:
      typeof partial?.enabled === "boolean" ? partial.enabled : base.enabled,
    recipientField: allowed.includes(recipientField)
      ? recipientField
      : base.recipientField,
    fromEmail: String(partial?.fromEmail ?? base.fromEmail).trim(),
    attachPdf:
      typeof partial?.attachPdf === "boolean"
        ? partial.attachPdf
        : base.attachPdf,
    autoSendOnPaid:
      typeof partial?.autoSendOnPaid === "boolean"
        ? partial.autoSendOnPaid
        : base.autoSendOnPaid,
    templates,
    defaultTemplateId,
  };
}

async function getAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error } as const;
  return ctx;
}

export async function getPayslipEmailSettings(): Promise<HrPayslipEmailSettings> {
  const auth = await getAuth();
  if ("error" in auth) return DEFAULT_HR_PAYSLIP_EMAIL_SETTINGS;
  const stored = await getHrVenueSetting<
    Partial<HrPayslipEmailSettings> & { subject?: string; message?: string }
  >(auth.supabase, auth.venue.id, HR_SETTINGS_KEYS.payslipEmail, {});
  return mergePayslipEmailSettings(stored);
}

export async function savePayslipEmailSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions } = auth;

    if (
      !canAdminLookups(permissions, venue.id) &&
      !canEditPayroll(permissions, venue.id)
    ) {
      return { ok: false, error: "No permission to save payslip email settings." };
    }

    let templatesRaw: unknown = [];
    try {
      templatesRaw = JSON.parse(String(formData.get("templates_json") ?? "[]"));
    } catch {
      return { ok: false, error: "Invalid templates payload." };
    }

    const value = mergePayslipEmailSettings({
      enabled: flagTrue(formData.get("enabled")),
      recipientField: String(
        formData.get("recipient_field") ?? "work_then_personal",
      ) as PayslipEmailRecipientField,
      fromEmail: String(formData.get("from_email") ?? "").trim(),
      attachPdf: flagTrue(formData.get("attach_pdf")),
      autoSendOnPaid: flagTrue(formData.get("auto_send_on_paid")),
      templates: templatesRaw as PayslipEmailTemplate[],
      defaultTemplateId: String(formData.get("default_template_id") ?? "").trim(),
    });

    if (value.templates.length === 0) {
      return { ok: false, error: "At least one email template is required." };
    }

    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: venue.id,
        key: HR_SETTINGS_KEYS.payslipEmail,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,key" },
    );
    if (error) return { ok: false, error: error.message };

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "hr_venue_settings",
      entity_id: HR_SETTINGS_KEYS.payslipEmail,
      venue_id: venue.id,
      after: value,
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/payslips", "page");
    revalidatePath("/hr/payslips", "page");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Failed to save payslip email settings.",
    };
  }
}

function applyEmailPlaceholders(
  template: string,
  vars: Record<string, string>,
): string {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    normalized[key.toLowerCase()] = value;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return normalized[key.toLowerCase()] ?? "";
  });
}

function formatEmailMoney(amount: number): string {
  return amount.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function resolvePayslipRecipient(
  field: PayslipEmailRecipientField,
  staff: { work_email: string | null; personal_email: string | null },
): string | null {
  const work = staff.work_email?.trim() || null;
  const personal = staff.personal_email?.trim() || null;
  if (field === "work") return work;
  if (field === "personal") return personal;
  return work || personal;
}

async function resolveSignedInUserName(
  supabase: ActionAuthContext["supabase"],
  user: ActionAuthContext["user"],
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  return (
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? user.email ?? "").trim() ||
    "User"
  );
}

type PayslipSnapshotRow = {
  payrollMonth?: string;
  periodStart?: string;
  periodEnd?: string;
  paymentDate?: string | null;
  employer?: {
    venueId?: string;
    venueName?: string;
    legalName?: string | null;
    companyAddress?: string | null;
    footerDisclaimer?: string | null;
  };
  employee?: {
    empNo?: string;
    fullName?: string;
    department?: string | null;
    position?: string | null;
    joiningDate?: string | null;
  };
  paidDays?: number;
  unpaidDays?: number;
  leave?: {
    kinds?: Array<{
      code?: string;
      name?: string;
      days?: number;
      bucket?: string;
      explanation?: string;
    }>;
  };
  paymentMethod?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  version?: number;
  fixed?: Array<{
    code?: string | null;
    label?: string;
    amount?: number;
    sortOrder?: number | null;
    meta?: { rateDiscountPercent?: number | null } | null;
  }>;
  variables?: Array<{
    code?: string | null;
    label?: string;
    amount?: number;
    sortOrder?: number | null;
    meta?: { rateDiscountPercent?: number | null } | null;
  }>;
  deductions?: Array<{
    code?: string | null;
    label?: string;
    amount?: number;
    sortOrder?: number | null;
    meta?: { rateDiscountPercent?: number | null } | null;
  }>;
  grossEarnings?: number;
  totalDeductions?: number;
  netSalary?: number;
};

function snapshotToPdfInput(
  snapshot: PayslipSnapshotRow,
  version: number,
  venueName: string,
  runEmployee?: {
    snapshot?: unknown;
    iban?: string | null;
    bank_name?: string | null;
  } | null,
  logo?: PayslipPdfInput["logo"],
  paymentMethodFallback?: string | null,
  stamp?: PayslipPdfInput["stamp"],
  letterhead?: {
    companyName?: string;
    companyAddress?: string;
    footerDisclaimer?: string;
  } | null,
): PayslipPdfInput {
  const month = String(snapshot.payrollMonth ?? "");
  let leaveKinds = (snapshot.leave?.kinds ?? [])
    .map((k) => ({
      code: String(k.code ?? ""),
      name: String(k.name ?? ""),
      days: Number(k.days ?? 0),
      bucket: String(k.bucket ?? "paid"),
      explanation: String(k.explanation ?? ""),
    }))
    .filter((k) => k.days > 0);

  if (leaveKinds.length === 0 && runEmployee?.snapshot) {
    leaveKinds = summarizePayrollLeave(
      dayFractionsFromSnapshot(runEmployee.snapshot),
    ).kinds;
  }

  const accountNumber =
    snapshot.accountNumber ?? runEmployee?.iban ?? null;
  const bankName = snapshot.bankName ?? runEmployee?.bank_name ?? null;
  const paymentMethod =
    snapshot.paymentMethod ?? paymentMethodFallback ?? null;
  const joiningDate =
    snapshot.employee?.joiningDate ??
    (runEmployee?.snapshot as { joiningDate?: string | null } | undefined)
      ?.joiningDate ??
    null;

  return {
    venueName: snapshot.employer?.venueName || venueName,
    employerLegalName:
      snapshot.employer?.legalName ??
      letterhead?.companyName ??
      venueName,
    companyAddress:
      snapshot.employer?.companyAddress ??
      letterhead?.companyAddress ??
      null,
    footerDisclaimer:
      snapshot.employer?.footerDisclaimer ??
      letterhead?.footerDisclaimer ??
      null,
    payrollMonthLabel: month ? formatPayrollMonthLabel(month) : month,
    periodStart: String(snapshot.periodStart ?? "").slice(0, 10),
    periodEnd: String(snapshot.periodEnd ?? "").slice(0, 10),
    paymentDate: snapshot.paymentDate
      ? String(snapshot.paymentDate).slice(0, 10)
      : null,
    empNo: String(snapshot.employee?.empNo ?? ""),
    fullName: String(snapshot.employee?.fullName ?? ""),
    joiningDate,
    departmentName: snapshot.employee?.department ?? null,
    positionName: snapshot.employee?.position ?? null,
    paidDays: Number(snapshot.paidDays ?? 0),
    unpaidDays: Number(snapshot.unpaidDays ?? 0),
    version,
    leaveKinds,
    logo: logo ?? null,
    stamp: stamp ?? null,
    paymentMethod,
    bankName,
    accountNumber,
    lines: sortPayslipLines([
      ...(snapshot.fixed ?? []).map((l) => {
        const amount = Number(l.amount ?? 0);
        const discount = derivePayslipLineDiscountFields({
          amount,
          meta: l.meta ?? null,
        });
        return {
          category: "Fixed",
          code: l.code ?? null,
          label: String(l.label ?? ""),
          amount,
          baseAmount: discount.baseAmount ?? amount,
          deductionPercent: discount.deductionPercent,
          deductionValue: discount.deductionValue,
          sortOrder: l.sortOrder ?? null,
        };
      }),
      ...(snapshot.variables ?? []).map((l) => {
        const amount = Number(l.amount ?? 0);
        const discount = derivePayslipLineDiscountFields({
          amount,
          meta: l.meta ?? null,
        });
        return {
          category: "Variable",
          code: l.code ?? null,
          label: String(l.label ?? ""),
          amount,
          baseAmount: discount.baseAmount ?? amount,
          deductionPercent: discount.deductionPercent,
          deductionValue: discount.deductionValue,
          sortOrder: l.sortOrder ?? null,
        };
      }),
      ...(snapshot.deductions ?? []).map((l) => {
        const amount = Number(l.amount ?? 0);
        const discount = derivePayslipLineDiscountFields({
          amount,
          meta: l.meta ?? null,
        });
        return {
          category: "Deduction",
          code: l.code ?? null,
          label: String(l.label ?? ""),
          amount,
          baseAmount: discount.baseAmount,
          deductionPercent: discount.deductionPercent,
          deductionValue: discount.deductionValue,
          sortOrder: l.sortOrder ?? null,
        };
      }),
    ]).map(({ code: _c, sortOrder: _s, ...line }) => line),
    grossEarnings: Number(snapshot.grossEarnings ?? 0),
    totalDeductions: Number(snapshot.totalDeductions ?? 0),
    netSalary: Number(snapshot.netSalary ?? 0),
  };
}

export type SendPayslipsResult =
  | {
      ok: true;
      sent: number;
      failed: number;
      skipped: number;
      errors: string[];
    }
  | { ok: false; error: string };

export type PayslipEmailPreview = {
  employeeName: string;
  empNo: string;
  to: string;
  subject: string;
  body: string;
  attachmentFilename: string | null;
  version: number;
  payrollMonthLabel: string;
};

/** Build a read-only preview of the payslip email that would be sent. */
export async function previewPayslipEmail(
  payslipId: string,
): Promise<
  { ok: true; preview: PayslipEmailPreview } | { ok: false; error: string }
> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission to send payslips." };
  }

  const id = payslipId.trim();
  if (!id) return { ok: false, error: "Missing payslip." };

  const settings = await getPayslipEmailSettings();
  if (!settings.enabled) {
    return {
      ok: false,
      error:
        "Payslip emails are disabled. Enable them under HR → Settings → Emails → Payslips.",
    };
  }

  const template = resolvePayslipEmailTemplate(settings);
  const senderName = await resolveSignedInUserName(supabase, user);
  const service = createServiceClient();

  const { data: row, error } = await service
    .from("hr_payslips")
    .select(
      "id, staff_id, version, snapshot, run:hr_payroll_runs(payroll_month, period_start, period_end, payment_date)",
    )
    .eq("venue_id", venue.id)
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payslip not found." };

  const { data: staff } = await service
    .from("staff")
    .select("id, work_email, personal_email, full_name")
    .eq("id", row.staff_id as string)
    .maybeSingle();

  const snapshot = (row.snapshot ?? {}) as PayslipSnapshotRow;
  const run = row.run as
    | {
        payroll_month?: string;
        period_start?: string;
        period_end?: string;
        payment_date?: string | null;
      }
    | null;

  const fullName =
    String(snapshot.employee?.fullName ?? "").trim() ||
    staff?.full_name?.trim() ||
    "Employee";
  const empNo = String(snapshot.employee?.empNo ?? "").trim() || "—";

  const to = resolvePayslipRecipient(settings.recipientField, {
    work_email: (staff?.work_email as string | null) ?? null,
    personal_email: (staff?.personal_email as string | null) ?? null,
  });
  if (!to) {
    return {
      ok: false,
      error: `${empNo} — ${fullName}: no email address on file.`,
    };
  }

  const monthRaw =
    String(snapshot.payrollMonth ?? run?.payroll_month ?? "").trim() || "";
  const monthLabel = monthRaw ? formatPayrollMonthLabel(monthRaw) : "";
  const monthParts = monthLabel.split(" ");
  const payrollMonthName =
    monthParts.length > 1 ? monthParts.slice(0, -1).join(" ") : monthLabel;
  const payrollYear =
    monthParts.length > 1
      ? monthParts[monthParts.length - 1]!
      : monthRaw.slice(0, 4);

  const periodStart = String(
    snapshot.periodStart ?? run?.period_start ?? "",
  ).slice(0, 10);
  const periodEnd = String(snapshot.periodEnd ?? run?.period_end ?? "").slice(
    0,
    10,
  );
  const paymentDate = snapshot.paymentDate
    ? String(snapshot.paymentDate).slice(0, 10)
    : run?.payment_date
      ? String(run.payment_date).slice(0, 10)
      : periodEnd;

  const vars: Record<string, string> = {
    EMPLOYEE_NAME: fullName,
    USER_NAME: senderName,
    PAYROLL_MONTH: payrollMonthName,
    PAYROLL_YEAR: payrollYear,
    PAYROLL_PERIOD:
      periodStart && periodEnd ? `${periodStart} → ${periodEnd}` : "",
    NET_PAY: formatEmailMoney(Number(snapshot.netSalary ?? 0)),
    PAYMENT_DATE: paymentDate || "—",
    VENUE_NAME: venue.name ?? "Venue",
  };

  const version = Number(row.version) || 1;
  const attachmentFilename = settings.attachPdf
    ? buildPayslipPdfFilename({
        fullName,
        empNo,
        version,
      })
    : null;

  return {
    ok: true,
    preview: {
      employeeName: fullName,
      empNo,
      to,
      subject: applyEmailPlaceholders(template.subject, vars),
      body: applyEmailPlaceholders(template.message, vars),
      attachmentFilename,
      version,
      payrollMonthLabel: monthLabel,
    },
  };
}

/** Email selected payslip versions to employees using venue payslip settings. */
export async function sendPayslipsEmail(
  payslipIds: string[],
  options?: {
    /** When sending a single payslip, use these edited fields instead of template defaults. */
    draft?: { to: string; subject: string; body: string };
  },
): Promise<SendPayslipsResult> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission to send payslips." };
  }

  const ids = [...new Set(payslipIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, error: "Select at least one employee payslip." };
  }

  const draft =
    options?.draft && ids.length === 1
      ? {
          to: options.draft.to.trim(),
          subject: options.draft.subject.trim(),
          body: options.draft.body,
        }
      : null;
  if (draft && !draft.to) {
    return { ok: false, error: "Enter a destination email address." };
  }
  if (draft && !draft.subject) {
    return { ok: false, error: "Enter an email subject." };
  }

  const settings = await getPayslipEmailSettings();
  if (!settings.enabled) {
    return {
      ok: false,
      error:
        "Payslip emails are disabled. Enable them under HR → Settings → Emails → Payslips.",
    };
  }

  const template = resolvePayslipEmailTemplate(settings);
  const senderName = await resolveSignedInUserName(supabase, user);
  const service = createServiceClient();
  const venueLogo = await loadPayslipPdfLogoServer(
    getVenueLogoUrl({
      slug: venue.slug,
      logo_url: venue.logo_url,
      icon_url: venue.icon_url,
      favicon_url: venue.favicon_url,
    }),
  );
  const letterhead = await loadPayslipLetterheadForVenue(supabase, venue);
  const venueStamp = await loadPayslipPdfLogoServer(letterhead.stampUrl);
  const payrollSettings = await loadPayrollSettings(supabase, venue.id);

  const { data: rows, error } = await service
    .from("hr_payslips")
    .select(
      "id, staff_id, version, snapshot, email_status, run:hr_payroll_runs(payroll_month, period_start, period_end, payment_date), employee:hr_payroll_run_employees(snapshot, iban, bank_name)",
    )
    .eq("venue_id", venue.id)
    .in("id", ids);

  if (error) return { ok: false, error: error.message };
  if (!rows?.length) return { ok: false, error: "No matching payslips found." };

  const staffIds = [
    ...new Set(
      rows
        .map((r) => r.staff_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const staffById = new Map<
    string,
    { work_email: string | null; personal_email: string | null; full_name: string | null }
  >();
  if (staffIds.length > 0) {
    const { data: staffRows } = await service
      .from("staff")
      .select("id, work_email, personal_email, full_name")
      .in("id", staffIds);
    for (const s of staffRows ?? []) {
      staffById.set(s.id as string, {
        work_email: (s.work_email as string | null) ?? null,
        personal_email: (s.personal_email as string | null) ?? null,
        full_name: (s.full_name as string | null) ?? null,
      });
    }
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const snapshot = (row.snapshot ?? {}) as PayslipSnapshotRow;
    const run = row.run as
      | {
          payroll_month?: string;
          period_start?: string;
          period_end?: string;
          payment_date?: string | null;
        }
      | null;

    const fullName =
      String(snapshot.employee?.fullName ?? "").trim() ||
      staffById.get(row.staff_id as string)?.full_name?.trim() ||
      "Employee";
    const empNo = String(snapshot.employee?.empNo ?? "").trim() || "—";
    const label = `${empNo} — ${fullName}`;

    const staff = staffById.get(row.staff_id as string) ?? {
      work_email: null,
      personal_email: null,
      full_name: null,
    };
    const to =
      draft?.to ||
      resolvePayslipRecipient(settings.recipientField, staff);
    if (!to) {
      skipped += 1;
      errors.push(`${label}: no email address`);
      await service
        .from("hr_payslips")
        .update({
          email_status: "failed",
          email_error: "No email address",
        })
        .eq("id", row.id)
        .eq("venue_id", venue.id);
      continue;
    }

    const monthRaw =
      String(snapshot.payrollMonth ?? run?.payroll_month ?? "").trim() || "";
    const monthLabel = monthRaw ? formatPayrollMonthLabel(monthRaw) : "";
    const monthParts = monthLabel.split(" ");
    const payrollMonthName =
      monthParts.length > 1
        ? monthParts.slice(0, -1).join(" ")
        : monthLabel;
    const payrollYear =
      monthParts.length > 1
        ? monthParts[monthParts.length - 1]!
        : monthRaw.slice(0, 4);

    const periodStart = String(
      snapshot.periodStart ?? run?.period_start ?? "",
    ).slice(0, 10);
    const periodEnd = String(snapshot.periodEnd ?? run?.period_end ?? "").slice(
      0,
      10,
    );
    const paymentDate = snapshot.paymentDate
      ? String(snapshot.paymentDate).slice(0, 10)
      : run?.payment_date
        ? String(run.payment_date).slice(0, 10)
        : periodEnd;

    const vars: Record<string, string> = {
      EMPLOYEE_NAME: fullName,
      USER_NAME: senderName,
      PAYROLL_MONTH: payrollMonthName,
      PAYROLL_YEAR: payrollYear,
      PAYROLL_PERIOD:
        periodStart && periodEnd ? `${periodStart} → ${periodEnd}` : "",
      NET_PAY: formatEmailMoney(Number(snapshot.netSalary ?? 0)),
      PAYMENT_DATE: paymentDate || "—",
      VENUE_NAME: venue.name ?? "Venue",
    };

    const subject =
      draft?.subject ?? applyEmailPlaceholders(template.subject, vars);
    const bodyText =
      draft?.body ?? applyEmailPlaceholders(template.message, vars);
    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body: bodyText,
      venue,
    });

    const attachments: {
      filename: string;
      content: string;
      content_type?: string;
      content_id?: string;
    }[] = [...inlineAttachments];

    if (settings.attachPdf) {
      try {
        const runEmployee = (
          row as {
            employee?: {
              snapshot?: unknown;
              iban?: string | null;
              bank_name?: string | null;
            } | null;
          }
        ).employee;
        const paymentFallback = resolveEmployeePaymentMethod(
          runEmployee?.iban ?? snapshot.accountNumber,
          payrollSettings,
        );
        const pdf = buildPayslipPdfBase64(
          snapshotToPdfInput(
            {
              ...snapshot,
              employer: {
                ...snapshot.employer,
                legalName:
                  snapshot.employer?.legalName ?? letterhead.companyName,
                companyAddress:
                  snapshot.employer?.companyAddress ??
                  letterhead.companyAddress,
                footerDisclaimer:
                  snapshot.employer?.footerDisclaimer ??
                  letterhead.footerDisclaimer,
              },
            },
            Number(row.version),
            venue.name ?? "Venue",
            runEmployee,
            venueLogo,
            paymentFallback,
            venueStamp,
            letterhead,
          ),
        );
        attachments.push({
          filename: pdf.filename,
          content: pdf.base64,
          content_type: "application/pdf",
        });
      } catch (e) {
        failed += 1;
        errors.push(
          `${label}: PDF failed — ${e instanceof Error ? e.message : "unknown error"}`,
        );
        await service
          .from("hr_payslips")
          .update({
            email_status: "failed",
            email_error:
              e instanceof Error ? e.message : "PDF generation failed",
          })
          .eq("id", row.id)
          .eq("venue_id", venue.id);
        continue;
      }
    }

    try {
      await sendAppEmail(
        {
          to,
          fromOverride: settings.fromEmail || undefined,
          subject,
          html,
          attachments: attachments.length > 0 ? attachments : undefined,
        },
        { venueId: venue.id, supabase },
      );

      await service
        .from("hr_payslips")
        .update({
          email_status: "sent",
          email_sent_at: new Date().toISOString(),
          email_error: null,
        })
        .eq("id", row.id)
        .eq("venue_id", venue.id);

      sent += 1;
    } catch (e) {
      failed += 1;
      errors.push(
        `${label}: ${e instanceof Error ? e.message : "Failed to send"}`,
      );
      await service
        .from("hr_payslips")
        .update({
          email_status: "failed",
          email_error: e instanceof Error ? e.message : "Failed to send",
        })
        .eq("id", row.id)
        .eq("venue_id", venue.id);
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.payslips_emailed",
    module_key: HR_MODULE_KEY,
    entity: "hr_payslips",
    after: { requested: ids.length, sent, failed, skipped },
  });

  revalidatePath("/hr/payslips", "page");
  return { ok: true, sent, failed, skipped, errors };
}
