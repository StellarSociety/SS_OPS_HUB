"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { listUsers } from "@/lib/access/store";
import { sendAppEmail } from "@/lib/email/transport";
import { joinAppUrl } from "@/lib/public-app-url";
import {
  canAccessPayroll,
  canAdminLookups,
  canEditPayroll,
  canViewSalary,
} from "@/lib/hr/permissions";
import {
  formatPayrollMonthLabel,
  isPayrollLocked,
  type PayrollStatus,
} from "@/lib/hr/payroll";
import {
  loadPayrollApprovalsSettingsForVenue,
  mergePayrollApprovalsSettings,
} from "@/lib/hr/payroll/approvals-settings";
import { loadPayrollFinalApprovalEmailSettingsForVenue } from "@/lib/hr/payroll/final-approval-email-settings";
import { buildPayrollExportPackage } from "@/lib/hr/payroll/export-artifacts";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import { acknowledgementCtaForSend } from "@/lib/hr/acknowledgement-store";
import {
  DEFAULT_HR_PAYROLL_APPROVALS_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  resolveFinalApprovalEmailTemplate,
  resolvePayrollEmailTemplate,
  type HrPayrollApprovalsSettings,
  type PayrollApprovalRequest,
  type PayrollApprovalStep,
  type PayrollEmailTemplate,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toScopedHref } from "@/lib/venue/scope-routing";
import {
  exportPayrollGl,
  generateWpsFile,
  transitionPayrollRun,
  type PayrollActionResult,
} from "@/lib/actions/hr-payroll";

export type PayrollApproverCandidate = {
  id: string;
  fullName: string;
  email: string;
};

function parseIdList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\n]+/)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

function parseEmailList(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\n;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    ),
  ];
}

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

async function getAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error } as const;
  return ctx;
}

function revalidateApprovals(runId?: string) {
  revalidatePath("/hr/settings/pay/approvals", "page");
  revalidatePath("/hr/settings/emails/pay/payroll", "page");
  revalidatePath("/hr/settings/emails/pay/final-approval", "page");
  revalidatePath("/hr/settings/emails", "layout");
  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/payroll", "page");
  if (runId) revalidatePath(`/hr/payroll/${runId}`, "page");
}

export async function getPayrollApprovalsSettings(): Promise<HrPayrollApprovalsSettings> {
  const auth = await getAuth();
  if ("error" in auth) return DEFAULT_HR_PAYROLL_APPROVALS_SETTINGS;
  const { supabase, venue } = auth;
  return loadPayrollApprovalsSettingsForVenue(supabase, venue.id);
}

export async function listPayrollApproverCandidates(): Promise<{
  candidates?: PayrollApproverCandidate[];
  error?: string;
}> {
  const auth = await getAuth();
  if ("error" in auth) return { error: auth.error };
  const { supabase, venue, permissions } = auth;

  if (
    !canAdminLookups(permissions, venue.id) &&
    !canAccessPayroll(permissions, venue.id)
  ) {
    return { error: "You do not have permission to list approvers." };
  }

  try {
    const users = await listUsers(supabase);
    // All active hub users — settings picks who can approve each step.
    const candidates = users
      .filter((u) => !u.status || u.status === "active")
      .map((u) => ({
        id: u.id,
        fullName: u.full_name?.trim() || u.email,
        email: u.email,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    return { candidates };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not load approvers.",
    };
  }
}

export async function savePayrollApprovalsSettings(
  formData: FormData,
): Promise<void> {
  const auth = await getAuth();
  if ("error" in auth) throw new Error(auth.error);
  const { user, venue, permissions } = auth;

  if (
    !canAdminLookups(permissions, venue.id) &&
    !canEditPayroll(permissions, venue.id)
  ) {
    throw new Error("No permission to save payroll approvals settings.");
  }

  let templatesRaw: unknown = [];
  try {
    templatesRaw = JSON.parse(String(formData.get("templates_json") ?? "[]"));
  } catch {
    throw new Error("Invalid templates payload.");
  }

  const value = mergePayrollApprovalsSettings({
    hrReviewApproverUserIds: parseIdList(
      String(formData.get("hr_review_approver_user_ids") ?? ""),
    ),
    finalApprovalApproverUserIds: parseIdList(
      String(formData.get("final_approval_approver_user_ids") ?? ""),
    ),
    reopenUserIds: parseIdList(String(formData.get("reopen_user_ids") ?? "")),
    email: {
      fromEmail: String(formData.get("from_email") ?? "").trim(),
      toEmails: parseEmailList(String(formData.get("to_emails") ?? "")),
      templates: templatesRaw as PayrollEmailTemplate[],
      defaultTemplateId: String(
        formData.get("default_template_id") ?? "",
      ).trim(),
      attachPayrollExport: flagTrue(formData.get("attach_payroll_export")),
      attachGlExport: flagTrue(formData.get("attach_gl_export")),
      attachOther: flagTrue(formData.get("attach_other")),
      autoSendOnFinalApproval: flagTrue(
        formData.get("auto_send_on_final_approval"),
      ),
    },
  });

  if (value.email.templates.length === 0) {
    throw new Error("At least one email template is required.");
  }

  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venue.id,
      key: HR_SETTINGS_KEYS.payrollApprovals,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) {
    throw new Error(error.message);
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: HR_SETTINGS_KEYS.payrollApprovals,
    venue_id: venue.id,
    after: value,
  });

  revalidateApprovals();
}

function poolForStep(
  settings: HrPayrollApprovalsSettings,
  step: PayrollApprovalStep,
): string[] {
  return step === "hr_review"
    ? settings.hrReviewApproverUserIds
    : settings.finalApprovalApproverUserIds;
}

function targetStatusForStep(step: PayrollApprovalStep): PayrollStatus {
  return step === "hr_review" ? "hr_review" : "final_approval";
}

export async function requestPayrollApproval(params: {
  runId: string;
  step: PayrollApprovalStep;
  approverUserIds: string[];
  sendEmail?: boolean;
  attachPdf?: boolean;
  attachExcel?: boolean;
}): Promise<PayrollActionResult> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission to request payroll approval." };
  }

  const step = params.step;
  if (step !== "hr_review" && step !== "final_approval") {
    return { ok: false, error: "Invalid approval step." };
  }

  const selected = [
    ...new Set(params.approverUserIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (selected.length === 0) {
    return { ok: false, error: "Select at least one approver." };
  }

  const sendEmail = params.sendEmail === true && step === "final_approval";
  const attachPdf = sendEmail && params.attachPdf === true;
  const attachExcel = sendEmail && params.attachExcel === true;

  if ((attachPdf || attachExcel) && !canViewSalary(permissions, venue.id)) {
    return {
      ok: false,
      error: "Salary view is required to attach payroll PDF or Excel.",
    };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select(
      "id, status, payroll_month, period_start, period_end, payment_date, totals",
    )
    .eq("id", params.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();
  if (!run) return { ok: false, error: "Payroll run not found." };
  if (isPayrollLocked(run.status as string)) {
    return { ok: false, error: "Payroll is locked." };
  }

  if (step === "hr_review") {
    const okFrom = ["draft", "attendance_validated"].includes(
      run.status as string,
    );
    if (!okFrom) {
      return {
        ok: false,
        error: "HR Review can only be requested from draft.",
      };
    }
  } else {
    const okFrom = ["hr_review", "finance_review"].includes(
      run.status as string,
    );
    if (!okFrom) {
      return {
        ok: false,
        error: "Final Approval can only be requested after HR Review.",
      };
    }
  }

  const { count } = await supabase
    .from("hr_payroll_exceptions")
    .select("id", { count: "exact", head: true })
    .eq("run_id", params.runId)
    .eq("severity", "blocking")
    .eq("waived", false);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `${count} blocking exception(s) must be resolved or waived first.`,
    };
  }

  const settings = await getPayrollApprovalsSettings();
  const pool = new Set(poolForStep(settings, step));
  if (pool.size === 0) {
    return {
      ok: false,
      error:
        "No approvers configured. Set them in HR Settings → Pay → Payroll Approvals.",
    };
  }
  if (selected.some((id) => !pool.has(id))) {
    return {
      ok: false,
      error: "One or more selected users are not configured approvers.",
    };
  }

  let attachments: {
    filename: string;
    content: string;
    content_type?: string;
  }[] = [];
  if (attachPdf || attachExcel) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const senderName =
      String(profile?.full_name ?? "").trim() ||
      String(profile?.email ?? user.email ?? "").trim() ||
      "User";
    const built = await buildPayrollExportPackage({
      supabase,
      venueId: venue.id,
      venueName: venue.name ?? "Venue",
      runId: params.runId,
      userDisplayName: senderName,
    });
    if (!built.ok) return built;
    if (attachPdf) {
      attachments.push({
        filename: built.package.pdf.filename,
        content: built.package.pdf.base64,
        content_type: built.package.pdf.mimeType,
      });
    }
    if (attachExcel) {
      attachments.push({
        filename: built.package.xlsx.filename,
        content: built.package.xlsx.base64,
        content_type: built.package.xlsx.mimeType,
      });
    }
  }

  const service = createServiceClient();

  await service
    .from("hr_payroll_approval_requests")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", params.runId)
    .eq("step", step)
    .eq("status", "pending");

  const { data, error } = await service
    .from("hr_payroll_approval_requests")
    .insert({
      venue_id: venue.id,
      run_id: params.runId,
      step,
      status: "pending",
      requested_by: user.id,
      approver_user_ids: selected,
    })
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Could not create approval request.",
    };
  }

  const monthLabel = formatPayrollMonthLabel(String(run.payroll_month));
  const stepLabel = step === "hr_review" ? "HR Review" : "Final Approval";
  const notifyType =
    step === "hr_review"
      ? "payroll_hr_review_requested"
      : "payroll_final_approval_requested";

  const rows = selected.map((approverId) => ({
    user_id: approverId,
    venue_id: venue.id,
    module_key: "hr",
    type: notifyType,
    title: `${stepLabel} requested — ${monthLabel}`,
    body: `Please approve the ${stepLabel.toLowerCase()} for the ${monthLabel} payroll run.`,
    entity: "payroll_run",
    entity_id: params.runId,
    severity: "warning" as const,
    dedupe_key: `payroll-approval:${venue.id}:${params.runId}:${step}:${approverId}`,
    read_at: null,
  }));

  const { error: notifyError } = await service
    .from("notifications")
    .upsert(rows, { onConflict: "dedupe_key" });
  if (notifyError) {
    console.error("[payroll] approval notify failed:", notifyError.message);
  }

  let emailWarning: string | undefined;
  if (sendEmail) {
    const emailed = await sendFinalApprovalRequestEmails({
      supabase,
      venue,
      user,
      run: {
        id: String(run.id),
        payroll_month: String(run.payroll_month),
        period_start: String(run.period_start),
        period_end: String(run.period_end),
        payment_date: run.payment_date ? String(run.payment_date) : null,
        totals: run.totals,
      },
      selectedUserIds: selected,
      attachments,
    });
    if (!emailed.ok) {
      emailWarning = `Request created, but email failed: ${emailed.error}`;
    }
  }

  await service.from("hr_payroll_run_events").insert({
    venue_id: venue.id,
    run_id: params.runId,
    actor_id: user.id,
    from_status: run.status,
    to_status: run.status,
    comment: emailWarning
      ? `${stepLabel} requested (email failed)`
      : sendEmail
        ? `${stepLabel} requested (email sent)`
        : `${stepLabel} requested`,
  });

  await writeAuditLog({
    actor_id: user.id,
    action: "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_payroll_approval_requests",
    entity_id: data.id,
    venue_id: venue.id,
    after: data,
  });

  revalidateApprovals(params.runId);
  return emailWarning ? { ok: true, warning: emailWarning } : { ok: true };
}

export async function approvePayrollStep(params: {
  runId: string;
  step: PayrollApprovalStep;
}): Promise<PayrollActionResult> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canAccessPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const step = params.step;
  const { data: pending } = await supabase
    .from("hr_payroll_approval_requests")
    .select("*")
    .eq("run_id", params.runId)
    .eq("venue_id", venue.id)
    .eq("step", step)
    .eq("status", "pending")
    .maybeSingle();

  if (!pending) {
    return { ok: false, error: "No pending approval request for this step." };
  }

  const approvers = (pending.approver_user_ids as string[]) ?? [];
  if (!approvers.includes(user.id) && !canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "You are not an approver for this request." };
  }
  if (!approvers.includes(user.id)) {
    return { ok: false, error: "You are not named on this approval request." };
  }

  const service = createServiceClient();
  const { error: updateError } = await service
    .from("hr_payroll_approval_requests")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pending.id);

  if (updateError) return { ok: false, error: updateError.message };

  const target = targetStatusForStep(step);
  const stepLabel = step === "hr_review" ? "HR Review" : "Final Approval";
  const transitioned = await transitionPayrollRun(
    params.runId,
    target,
    `${stepLabel} approved`,
  );
  if (!transitioned.ok) return transitioned;

  if (pending.requested_by && pending.requested_by !== user.id) {
    await service.from("notifications").upsert(
      {
        user_id: pending.requested_by,
        venue_id: venue.id,
        module_key: "hr",
        type:
          step === "hr_review"
            ? "payroll_hr_review_approved"
            : "payroll_final_approval_approved",
        title: `${stepLabel} approved`,
        body: `Your ${stepLabel.toLowerCase()} request was approved.`,
        entity: "payroll_run",
        entity_id: params.runId,
        severity: "info",
        dedupe_key: `payroll-approval-done:${venue.id}:${params.runId}:${step}:${pending.id}`,
        read_at: null,
      },
      { onConflict: "dedupe_key" },
    );
  }

  if (step === "final_approval") {
    const approvalsSettings = await getPayrollApprovalsSettings();
    if (approvalsSettings.email.autoSendOnFinalApproval) {
      const emailed = await emailPayrollExport(params.runId);
      revalidateApprovals(params.runId);
      if (!emailed.ok) {
        return {
          ok: true,
          warning: `Final Approval complete, but email failed: ${emailed.error}`,
        };
      }
      return { ok: true };
    }
  }

  revalidateApprovals(params.runId);
  return { ok: true };
}

export async function reopenPayrollRun(
  runId: string,
): Promise<PayrollActionResult> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission to reopen payroll." };
  }

  const settings = await getPayrollApprovalsSettings();
  if (!settings.reopenUserIds.includes(user.id)) {
    return {
      ok: false,
      error: "You are not allowed to reopen locked payroll runs.",
    };
  }

  return transitionPayrollRun(runId, "final_approval", "Reopened for alterations", {
    allowReopen: true,
  });
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

function payrollRunPublicUrl(venue: { is_global: boolean; slug: string }, runId: string): string {
  const path = toScopedHref(
    `/hr/payroll/${runId}`,
    venue.is_global ? "global" : "venue",
    venue.slug,
  );
  return joinAppUrl(path);
}

async function sendFinalApprovalRequestEmails(opts: {
  supabase: SupabaseClient;
  venue: {
    id: string;
    name: string;
    slug: string;
    is_global: boolean;
  };
  user: { id: string; email?: string | null };
  run: {
    id: string;
    payroll_month: string;
    period_start: string;
    period_end: string;
    payment_date: string | null;
    totals: unknown;
  };
  selectedUserIds: string[];
  attachments: {
    filename: string;
    content: string;
    content_type?: string;
  }[];
}): Promise<PayrollActionResult> {
  const emailSettings = await loadPayrollFinalApprovalEmailSettingsForVenue(
    opts.supabase,
    opts.venue.id,
  );
  const activeTemplate = resolveFinalApprovalEmailTemplate(emailSettings);

  const users = await listUsers(opts.supabase);
  const recipients = opts.selectedUserIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u?.email?.trim()));
  if (recipients.length === 0) {
    return {
      ok: false,
      error: "Selected approvers have no email address.",
    };
  }

  const monthRaw = String(opts.run.payroll_month);
  const monthLabel = formatPayrollMonthLabel(monthRaw);
  const monthParts = monthLabel.split(" ");
  const payrollMonthName =
    monthParts.length > 1 ? monthParts.slice(0, -1).join(" ") : monthLabel;
  const payrollYear =
    monthParts.length > 1
      ? monthParts[monthParts.length - 1]!
      : monthRaw.slice(0, 4);
  const periodStart = String(opts.run.period_start).slice(0, 10);
  const periodEnd = String(opts.run.period_end).slice(0, 10);
  const paymentDate = opts.run.payment_date
    ? String(opts.run.payment_date).slice(0, 10)
    : periodEnd;
  const totals = (opts.run.totals ?? {}) as Record<string, unknown>;
  const includedCount = Number(
    totals.includedCount ?? totals.employeeCount ?? 0,
  );
  const netPayroll = Number(totals.netPayroll ?? 0);

  const { data: profile } = await opts.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", opts.user.id)
    .maybeSingle();
  const userName =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? opts.user.email ?? "").trim() ||
    "User";

  const runUrl = payrollRunPublicUrl(opts.venue, opts.run.id);
  const errors: string[] = [];

  for (const recipient of recipients) {
    const vars: Record<string, string> = {
      USER_NAME: userName,
      APPROVER_NAME: recipient.full_name?.trim() || recipient.email,
      APPROVER_EMAIL: recipient.email,
      PAYROLL_MONTH: payrollMonthName,
      PAYROLL_YEAR: payrollYear,
      PAYROLL_PERIOD: `${periodStart} → ${periodEnd}`,
      TOTAL_EMPLOYEES: String(
        Number.isFinite(includedCount) ? includedCount : 0,
      ),
      TOTAL_NET_PAYROLL: formatEmailMoney(
        Number.isFinite(netPayroll) ? netPayroll : 0,
      ),
      PAYMENT_DATE: paymentDate,
      VENUE_NAME: opts.venue.name ?? "Venue",
      PERIOD_START: periodStart,
      PERIOD_END: periodEnd,
      PAYROLL_RUN_URL: runUrl,
      payroll_month: monthLabel,
      venue_name: opts.venue.name ?? "Venue",
      period_start: periodStart,
      period_end: periodEnd,
    };

    const subject = applyEmailPlaceholders(activeTemplate.subject, vars);
    const bodyText = applyEmailPlaceholders(activeTemplate.message, vars);
    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body: bodyText,
      venue: opts.venue,
    });

    try {
      await sendAppEmail(
        {
          to: recipient.email,
          fromOverride: emailSettings.fromEmail,
          subject,
          html,
          attachments: [...inlineAttachments, ...opts.attachments],
        },
        { venueId: opts.venue.id, supabase: opts.supabase },
      );
    } catch (e) {
      errors.push(
        `${recipient.email}: ${e instanceof Error ? e.message : "send failed"}`,
      );
    }
  }

  if (errors.length === recipients.length) {
    return { ok: false, error: errors.join("; ") };
  }
  if (errors.length > 0) {
    return {
      ok: false,
      error: `Sent to some recipients. Failed: ${errors.join("; ")}`,
    };
  }
  return { ok: true };
}

export async function emailPayrollExport(
  runId: string,
  otherFile?: { filename: string; base64: string; contentType?: string } | null,
): Promise<PayrollActionResult> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id) || !canViewSalary(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select(
      "id, status, payroll_month, period_start, period_end, payment_date, totals",
    )
    .eq("id", runId)
    .eq("venue_id", venue.id)
    .maybeSingle();
  if (!run) return { ok: false, error: "Run not found." };

  const settings = await getPayrollApprovalsSettings();
  const emailCfg = settings.email;
  const activeTemplate = resolvePayrollEmailTemplate(emailCfg);
  if (emailCfg.toEmails.length === 0) {
    return {
      ok: false,
      error: "No email recipients configured in Payroll Approvals.",
    };
  }

  const monthRaw = String(run.payroll_month);
  const monthLabel = formatPayrollMonthLabel(monthRaw);
  const monthParts = monthLabel.split(" ");
  const payrollMonthName =
    monthParts.length > 1
      ? monthParts.slice(0, -1).join(" ")
      : monthLabel;
  const payrollYear =
    monthParts.length > 1
      ? monthParts[monthParts.length - 1]!
      : monthRaw.slice(0, 4);
  const periodStart = String(run.period_start).slice(0, 10);
  const periodEnd = String(run.period_end).slice(0, 10);
  const paymentDate = run.payment_date
    ? String(run.payment_date).slice(0, 10)
    : periodEnd;
  const totals = (run.totals ?? {}) as Record<string, unknown>;
  const includedCount = Number(totals.includedCount ?? totals.employeeCount ?? 0);
  const netPayroll = Number(totals.netPayroll ?? 0);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const userName =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? user.email ?? "").trim() ||
    "User";

  const vars: Record<string, string> = {
    USER_NAME: userName,
    PAYROLL_MONTH: payrollMonthName,
    PAYROLL_YEAR: payrollYear,
    PAYROLL_PERIOD: `${periodStart} → ${periodEnd}`,
    TOTAL_EMPLOYEES: String(Number.isFinite(includedCount) ? includedCount : 0),
    TOTAL_NET_PAYROLL: formatEmailMoney(
      Number.isFinite(netPayroll) ? netPayroll : 0,
    ),
    PAYMENT_DATE: paymentDate,
    VENUE_NAME: venue.name ?? "Venue",
    PERIOD_START: periodStart,
    PERIOD_END: periodEnd,
    // Legacy aliases
    payroll_month: monthLabel,
    venue_name: venue.name ?? "Venue",
    period_start: periodStart,
    period_end: periodEnd,
  };

  const attachments: {
    filename: string;
    content: string;
    content_type?: string;
  }[] = [];

  if (emailCfg.attachPayrollExport) {
    const wps = await generateWpsFile(runId);
    if (!wps.ok) return { ok: false, error: wps.error };
    if (wps.base64) {
      attachments.push({
        filename: wps.filename,
        content: wps.base64,
        content_type:
          wps.mimeType ??
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    }
  }

  if (emailCfg.attachGlExport) {
    const gl = await exportPayrollGl(runId);
    if (!gl.ok) return { ok: false, error: gl.error };
    if (gl.base64) {
      attachments.push({
        filename: gl.filename,
        content: gl.base64,
        content_type: gl.mimeType ?? "text/csv",
      });
    } else if (gl.csv != null) {
      attachments.push({
        filename: gl.filename,
        content: Buffer.from(gl.csv, "utf8").toString("base64"),
        content_type: gl.mimeType ?? "text/csv",
      });
    }
  }

  if (emailCfg.attachOther && otherFile?.base64 && otherFile.filename) {
    attachments.push({
      filename: otherFile.filename,
      content: otherFile.base64,
      content_type: otherFile.contentType,
    });
  }

  if (attachments.length === 0) {
    return {
      ok: false,
      error:
        "No attachments selected. Enable payroll export, GL, or other in settings.",
    };
  }

  const subject = applyEmailPlaceholders(activeTemplate.subject, vars);
  const bodyText = applyEmailPlaceholders(activeTemplate.message, vars);
  const acknowledgement = await acknowledgementCtaForSend({
    requiresAcknowledgement: activeTemplate.requiresAcknowledgement === true,
    venueId: venue.id,
    staffName: "Payroll package",
    recipientEmail: emailCfg.toEmails[0] ?? null,
    emailKind: "payroll_package",
    emailKindLabel: "Payroll package",
    subject,
  });
  const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
    body: bodyText,
    venue,
    acknowledgement,
  });

  try {
    await sendAppEmail(
      {
        to: emailCfg.toEmails,
        fromOverride: emailCfg.fromEmail,
        subject,
        html,
        attachments: [...inlineAttachments, ...attachments],
      },
      { venueId: venue.id, supabase },
    );
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send email.",
    };
  }

  const status = run.status as PayrollStatus;
  if (status === "final_approval") {
    const moved = await transitionPayrollRun(
      runId,
      "payment_processing",
      "Email sent",
    );
    if (!moved.ok) return moved;
  } else {
    const service = createServiceClient();
    await service.from("hr_payroll_run_events").insert({
      venue_id: venue.id,
      run_id: runId,
      actor_id: user.id,
      from_status: status,
      to_status: status,
      comment: "Email sent",
    });
  }

  revalidateApprovals(runId);
  return { ok: true };
}

export async function enterPaymentProcessing(
  runId: string,
): Promise<PayrollActionResult> {
  return transitionPayrollRun(
    runId,
    "payment_processing",
    "Entered payment processing",
  );
}

export type PendingPayrollApproval = Pick<
  PayrollApprovalRequest,
  | "id"
  | "run_id"
  | "step"
  | "status"
  | "requested_by"
  | "requested_at"
  | "approver_user_ids"
  | "approved_by"
  | "approved_at"
>;

export async function listPendingPayrollApprovalsForRun(
  runId: string,
): Promise<PendingPayrollApproval[]> {
  const auth = await getAuth();
  if ("error" in auth) return [];
  const { supabase, venue, permissions } = auth;
  if (!canAccessPayroll(permissions, venue.id)) return [];

  const { data, error } = await supabase
    .from("hr_payroll_approval_requests")
    .select(
      "id, run_id, step, status, requested_by, requested_at, approver_user_ids, approved_by, approved_at",
    )
    .eq("run_id", runId)
    .eq("venue_id", venue.id)
    .in("status", ["pending", "approved"])
    .order("requested_at", { ascending: false });

  if (error) {
    console.error("[payroll] list approvals:", error.message);
    return [];
  }

  return (data ?? []) as PendingPayrollApproval[];
}
