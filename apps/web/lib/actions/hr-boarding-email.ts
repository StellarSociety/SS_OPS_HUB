"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import {
  getActionAuthContext,
  type ActionAuthContext,
} from "@/lib/auth/action-context";
import { sendAppEmail } from "@/lib/email/transport";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  BOARDING_EMAIL_ACTIONS,
  boardingEmailUsesFixedRecipients,
  createBoardingEmailTemplate,
  DEFAULT_HR_BOARDING_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  parseBoardingEmailAction,
  parseBoardingTemplateToEmails,
  resolveBoardingEmailTemplate,
  type BoardingEmailAction,
  type BoardingEmailTemplate,
  type HrBoardingEmailSettings,
  type PayslipEmailRecipientField,
} from "@/lib/hr/types";
import type { OffboardingNoticeEmailDelivery } from "@/lib/hr/offboarding-process";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import { acknowledgementCtaForSend } from "@/lib/hr/acknowledgement-store";
import { createServiceClient } from "@/lib/supabase/service";
import { formatDateOnly } from "@/lib/hr/derived";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuidOrNull(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

/** Only return a process id that already exists — new forms mint a UUID before save. */
async function resolveExistingOffboardingProcessId(
  service: ReturnType<typeof createServiceClient>,
  venueId: string,
  processId: string | null | undefined,
): Promise<string | null> {
  const id = asUuidOrNull(processId);
  if (!id) return null;
  const { data } = await service
    .from("hr_offboarding_processes")
    .select("id")
    .eq("venue_id", venueId)
    .eq("id", id)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

type BoardingEmailRow = {
  id: string;
  venue_id?: string;
  staff_id?: string;
  process_id?: string | null;
  action: string;
  status: string;
  to_email: string;
  from_email: string | null;
  subject: string;
  message: string;
  template_id: string;
  template_name: string;
  provider: string;
  recorded_at: string;
  sent_at: string | null;
  scheduled_at: string | null;
};

const BOARDING_EMAIL_SELECT =
  "id, action, status, to_email, from_email, subject, message, template_id, template_name, provider, recorded_at, sent_at, scheduled_at";

function mapDeliveryStatus(
  status: string,
): OffboardingNoticeEmailDelivery["status"] {
  if (status === "draft") return "draft";
  if (status === "scheduled") return "scheduled";
  return "sent";
}

function rowToDelivery(row: BoardingEmailRow): OffboardingNoticeEmailDelivery {
  return {
    id: row.id,
    action: parseBoardingEmailAction(row.action),
    status: mapDeliveryStatus(row.status),
    sentAt: row.sent_at ?? row.recorded_at,
    scheduledAt: row.scheduled_at ?? null,
    to: row.to_email ?? "",
    fromEmail: row.from_email ?? null,
    subject: row.subject ?? "",
    message: row.message ?? "",
    templateId: row.template_id ?? "",
    templateName: row.template_name ?? "",
    provider: row.provider ?? "draft",
  };
}

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

function isBoardingAction(value: string): value is BoardingEmailAction {
  return BOARDING_EMAIL_ACTIONS.some((row) => row.value === value);
}

function normalizeTemplates(raw: unknown): BoardingEmailTemplate[] {
  const list = Array.isArray(raw) ? raw : [];
  const templates: BoardingEmailTemplate[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const actionRaw = String(row.action ?? "resignation_confirm");
    templates.push(
      createBoardingEmailTemplate({
        id,
        name: String(row.name ?? "Template"),
        action: isBoardingAction(actionRaw)
          ? actionRaw
          : "resignation_confirm",
        subject: String(row.subject ?? ""),
        message: String(row.message ?? ""),
        toEmails: String(row.toEmails ?? ""),
        requiresAcknowledgement: row.requiresAcknowledgement === true,
      }),
    );
  }

  if (templates.length === 0) {
    return DEFAULT_HR_BOARDING_EMAIL_SETTINGS.templates.map((t) => ({
      ...t,
    }));
  }

  // Ensure each action has at least the stock default (e.g. venues without handover yet).
  for (const def of DEFAULT_HR_BOARDING_EMAIL_SETTINGS.templates) {
    if (!templates.some((t) => t.action === def.action)) {
      templates.push({ ...def });
      seen.add(def.id);
    }
  }

  return templates;
}

function mergeBoardingEmailSettings(
  partial: Partial<HrBoardingEmailSettings> | null | undefined,
): HrBoardingEmailSettings {
  const base = DEFAULT_HR_BOARDING_EMAIL_SETTINGS;
  const recipientField = (partial?.recipientField ??
    base.recipientField) as PayslipEmailRecipientField;
  const allowed: PayslipEmailRecipientField[] = [
    "work",
    "personal",
    "work_then_personal",
  ];
  const templates = normalizeTemplates(partial?.templates);
  const defaultsRaw = partial?.defaultTemplateByAction ?? {};
  const defaultTemplateByAction = {} as Record<BoardingEmailAction, string>;

  for (const action of BOARDING_EMAIL_ACTIONS.map((a) => a.value)) {
    const requested = String(
      (defaultsRaw as Record<string, string>)[action] ??
        base.defaultTemplateByAction[action],
    ).trim();
    const forAction = templates.filter((t) => t.action === action);
    const fallbackId =
      base.defaultTemplateByAction[action] || forAction[0]?.id || "";
    defaultTemplateByAction[action] = forAction.some((t) => t.id === requested)
      ? requested
      : (forAction[0]?.id ?? fallbackId);
  }

  return {
    enabled:
      typeof partial?.enabled === "boolean" ? partial.enabled : base.enabled,
    recipientField: allowed.includes(recipientField)
      ? recipientField
      : base.recipientField,
    fromEmail: String(partial?.fromEmail ?? base.fromEmail).trim(),
    templates,
    defaultTemplateByAction,
  };
}

async function getAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error } as const;
  return ctx;
}

export async function getBoardingEmailSettings(): Promise<HrBoardingEmailSettings> {
  const auth = await getAuth();
  if ("error" in auth) return DEFAULT_HR_BOARDING_EMAIL_SETTINGS;
  const stored = await getHrVenueSetting<Partial<HrBoardingEmailSettings>>(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.boardingEmail,
    {},
  );
  return mergeBoardingEmailSettings(stored);
}

export async function saveBoardingEmailSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions } = auth;

    if (
      !canAdminLookups(permissions, venue.id) &&
      !canEditStaff(permissions, venue.id)
    ) {
      return {
        ok: false,
        error: "No permission to save boarding email settings.",
      };
    }

    let templatesRaw: unknown = [];
    let defaultsRaw: unknown = {};
    try {
      templatesRaw = JSON.parse(String(formData.get("templates_json") ?? "[]"));
      defaultsRaw = JSON.parse(
        String(formData.get("default_template_by_action_json") ?? "{}"),
      );
    } catch {
      return { ok: false, error: "Invalid templates payload." };
    }

    const value = mergeBoardingEmailSettings({
      enabled: flagTrue(formData.get("enabled")),
      recipientField: String(
        formData.get("recipient_field") ?? "work_then_personal",
      ) as PayslipEmailRecipientField,
      fromEmail: String(formData.get("from_email") ?? "").trim(),
      templates: templatesRaw as BoardingEmailTemplate[],
      defaultTemplateByAction:
        defaultsRaw as HrBoardingEmailSettings["defaultTemplateByAction"],
    });

    if (value.templates.length === 0) {
      return { ok: false, error: "At least one email template is required." };
    }

    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: venue.id,
        key: HR_SETTINGS_KEYS.boardingEmail,
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
      entity_id: HR_SETTINGS_KEYS.boardingEmail,
      venue_id: venue.id,
      after: value,
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/boarding", "page");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save settings.",
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

function resolveRecipient(
  field: PayslipEmailRecipientField,
  staff: { work_email: string | null; personal_email: string | null },
): string | null {
  const work = staff.work_email?.trim() || null;
  const personal = staff.personal_email?.trim() || null;
  if (field === "work") return work;
  if (field === "personal") return personal;
  return work ?? personal;
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

export type BoardingNoticeEmailPreview = {
  enabled: boolean;
  to: string | null;
  fromEmail: string;
  templateId: string;
  templateName: string;
  templates: Array<{ id: string; name: string }>;
  subject: string;
  message: string;
  employeeName: string;
  venueName: string;
};

export type BoardingNoticeEmailSendResult =
  | { ok: true; delivery: OffboardingNoticeEmailDelivery }
  | { ok: false; error: string };

export async function listBoardingNoticeEmails(input: {
  staffId: string;
  processId?: string | null;
}): Promise<
  | { ok: true; records: OffboardingNoticeEmailDelivery[] }
  | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    if (
      !canEditStaff(auth.permissions, auth.venue.id) &&
      !canAdminLookups(auth.permissions, auth.venue.id)
    ) {
      return { ok: false, error: "No permission to view boarding emails." };
    }

    // Hobby cron is daily — also flush due schedules whenever the UI reloads.
    const { processDueScheduledBoardingEmails } = await import(
      "@/lib/hr/process-scheduled-boarding-emails"
    );
    await processDueScheduledBoardingEmails({ limit: 25 });

    const service = createServiceClient();
    const { data, error } = await service
      .from("hr_boarding_emails")
      .select(BOARDING_EMAIL_SELECT)
      .eq("venue_id", auth.venue.id)
      .eq("staff_id", input.staffId)
      .order("recorded_at", { ascending: true });
    if (error) return { ok: false, error: error.message };

    const rows = (data ?? []) as BoardingEmailRow[];
    return { ok: true, records: rows.map(rowToDelivery) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load emails.",
    };
  }
}

/** Sent-email counts keyed by staff id (for offboarding list badges). */
export async function countSentBoardingNoticeEmailsByStaff(input: {
  staffIds: string[];
}): Promise<
  | { ok: true; counts: Record<string, number> }
  | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    if (
      !canEditStaff(auth.permissions, auth.venue.id) &&
      !canAdminLookups(auth.permissions, auth.venue.id)
    ) {
      return { ok: false, error: "No permission to view boarding emails." };
    }

    const ids = [
      ...new Set(
        input.staffIds
          .map((id) => asUuidOrNull(id))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 0) return { ok: true, counts: {} };

    const service = createServiceClient();
    const { data, error } = await service
      .from("hr_boarding_emails")
      .select("staff_id")
      .eq("venue_id", auth.venue.id)
      .eq("status", "sent")
      .in("staff_id", ids);
    if (error) return { ok: false, error: error.message };

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const staffId = String(row.staff_id ?? "");
      if (!staffId) continue;
      counts[staffId] = (counts[staffId] ?? 0) + 1;
    }
    return { ok: true, counts };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load email counts.",
    };
  }
}

export async function saveBoardingNoticeEmailDraft(input: {
  id?: string | null;
  staffId: string;
  processId?: string | null;
  action: BoardingEmailAction;
  templateId?: string | null;
  notificationDate: string;
  terminationDate: string;
  subject?: string | null;
  message?: string | null;
  to?: string | null;
}): Promise<
  | { ok: true; draft: OffboardingNoticeEmailDelivery }
  | { ok: false; error: string }
> {
  try {
    const ctx = await loadNoticeContext({
      staffId: input.staffId,
      action: input.action,
      templateId: input.templateId,
      notificationDate: input.notificationDate,
      terminationDate: input.terminationDate,
      subjectOverride: input.subject,
      messageOverride: input.message,
    });
    if ("error" in ctx) {
      return { ok: false, error: ctx.error || "Failed to save draft." };
    }

    const recordedAt = new Date().toISOString();
    const existingId = asUuidOrNull(input.id);
    const rowId = existingId ?? crypto.randomUUID();
    const toEmail = (input.to?.trim() || ctx.to || "").trim();
    const fromEmail = ctx.settings.fromEmail.trim() || null;
    const service = createServiceClient();
    const processId = await resolveExistingOffboardingProcessId(
      service,
      ctx.auth.venue.id,
      input.processId,
    );

    const shared = {
      venue_id: ctx.auth.venue.id,
      staff_id: input.staffId,
      process_id: processId,
      action: input.action,
      status: "draft" as const,
      to_email: toEmail,
      from_email: fromEmail,
      subject: ctx.subject,
      message: ctx.message,
      template_id: ctx.template.id,
      template_name: ctx.template.name,
      provider: "draft",
      recorded_at: recordedAt,
      sent_at: null,
      scheduled_at: null,
      updated_by: ctx.auth.user.id,
      updated_at: recordedAt,
    };

    const { data, error } = existingId
      ? await service
          .from("hr_boarding_emails")
          .update(shared)
          .eq("id", existingId)
          .eq("venue_id", ctx.auth.venue.id)
          .select(BOARDING_EMAIL_SELECT)
          .single()
      : await service
          .from("hr_boarding_emails")
          .insert({
            id: rowId,
            ...shared,
            created_by: ctx.auth.user.id,
          })
          .select(BOARDING_EMAIL_SELECT)
          .single();

    if (error) return { ok: false, error: error.message };

    return { ok: true, draft: rowToDelivery(data as BoardingEmailRow) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save draft.",
    };
  }
}

async function loadNoticeContext(input: {
  staffId: string;
  action: BoardingEmailAction;
  templateId?: string | null;
  notificationDate: string;
  terminationDate: string;
  accommodationClearanceDate?: string | null;
  subjectOverride?: string | null;
  messageOverride?: string | null;
}) {
  const auth = await getAuth();
  if ("error" in auth) return { error: auth.error } as const;

  if (!canEditStaff(auth.permissions, auth.venue.id)) {
    return { error: "No permission to send boarding emails." } as const;
  }

  const settings = await getBoardingEmailSettings();
  const { data: staff, error: staffError } = await auth.supabase
    .from("staff")
    .select(
      "id, full_name, emp_no, work_email, personal_email, department:departments(name), position:positions(name)",
    )
    .eq("id", input.staffId)
    .eq("home_venue_id", auth.venue.id)
    .maybeSingle();

  if (staffError) return { error: staffError.message } as const;
  if (!staff) return { error: "Employee not found." } as const;

  const departmentName = Array.isArray(staff.department)
    ? (staff.department[0] as { name?: string } | undefined)?.name ?? ""
    : ((staff.department as { name?: string } | null)?.name ?? "");
  const positionName = Array.isArray(staff.position)
    ? (staff.position[0] as { name?: string } | undefined)?.name ?? ""
    : ((staff.position as { name?: string } | null)?.name ?? "");

  const template = resolveBoardingEmailTemplate(
    settings,
    input.action,
    input.templateId,
  );
  const templatesForAction = settings.templates
    .filter((t) => t.action === input.action)
    .map((t) => ({ id: t.id, name: t.name }));

  const senderName = await resolveSignedInUserName(auth.supabase, auth.user);

  const vars: Record<string, string> = {
    EMPLOYEE_NAME: staff.full_name ?? "",
    USER_NAME: senderName,
    EMP_NO: staff.emp_no ?? "",
    DEPARTMENT: departmentName,
    POSITION: positionName,
    NOTIFICATION_DATE: formatDateOnly(input.notificationDate || null),
    LAST_WORKING_DAY: formatDateOnly(input.terminationDate || null),
    ACCOMMODATION_CLEARANCE_DATE: formatDateOnly(
      input.accommodationClearanceDate ||
        input.terminationDate ||
        null,
    ),
    VENUE_NAME: auth.venue.name ?? "",
  };

  const subject = applyEmailPlaceholders(
    input.subjectOverride?.trim() || template.subject,
    vars,
  );
  const message = applyEmailPlaceholders(
    input.messageOverride ?? template.message,
    vars,
  );
  const employeeTo = resolveRecipient(settings.recipientField, {
    work_email: staff.work_email,
    personal_email: staff.personal_email,
  });
  const fixedRecipients = boardingEmailUsesFixedRecipients(template.action)
    ? parseBoardingTemplateToEmails(template.toEmails)
    : [];
  const to =
    fixedRecipients.length > 0
      ? fixedRecipients.join(", ")
      : boardingEmailUsesFixedRecipients(template.action)
        ? null
        : employeeTo;
  const toList =
    fixedRecipients.length > 0
      ? fixedRecipients
      : employeeTo
        ? [employeeTo]
        : [];

  return {
    auth,
    settings,
    staff,
    template,
    templatesForAction,
    subject,
    message,
    to,
    toList,
    vars,
  } as const;
}

export async function previewBoardingNoticeEmail(input: {
  staffId: string;
  action: BoardingEmailAction;
  templateId?: string | null;
  notificationDate: string;
  terminationDate: string;
}): Promise<
  { ok: true; preview: BoardingNoticeEmailPreview } | { ok: false; error: string }
> {
  try {
    const ctx = await loadNoticeContext(input);
    if ("error" in ctx) {
      return { ok: false, error: ctx.error || "Failed to load preview." };
    }

    return {
      ok: true,
      preview: {
        enabled: ctx.settings.enabled,
        to: ctx.to,
        fromEmail: ctx.settings.fromEmail,
        templateId: ctx.template.id,
        templateName: ctx.template.name,
        templates: ctx.templatesForAction,
        subject: ctx.subject,
        message: ctx.message,
        employeeName: ctx.staff.full_name ?? "",
        venueName: ctx.auth.venue.name ?? "",
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to load preview.",
    };
  }
}

export async function sendBoardingNoticeEmail(input: {
  id?: string | null;
  staffId: string;
  processId?: string | null;
  action: BoardingEmailAction;
  templateId?: string | null;
  notificationDate: string;
  terminationDate: string;
  subject?: string | null;
  message?: string | null;
  to?: string | null;
}): Promise<BoardingNoticeEmailSendResult> {
  try {
    const ctx = await loadNoticeContext({
      staffId: input.staffId,
      action: input.action,
      templateId: input.templateId,
      notificationDate: input.notificationDate,
      terminationDate: input.terminationDate,
      subjectOverride: input.subject,
      messageOverride: input.message,
    });
    if ("error" in ctx) {
      return { ok: false, error: ctx.error || "Failed to send email." };
    }

    if (!ctx.settings.enabled) {
      return {
        ok: false,
        error:
          "Boarding emails are disabled. Enable them in Settings → Emails → Off-Boarding email.",
      };
    }
    const toList = parseBoardingTemplateToEmails(
      input.to?.trim() || ctx.to || "",
    );
    if (toList.length === 0) {
      return {
        ok: false,
        error: boardingEmailUsesFixedRecipients(input.action)
          ? "No recipient emails configured on this template. Set them in Settings → Emails → Off-Boarding email."
          : "No recipient email address. Enter a To address or add a work/personal email on the staff record.",
      };
    }
    const toEmail = toList.join(", ");

    const acknowledgement = await acknowledgementCtaForSend({
      requiresAcknowledgement: ctx.template.requiresAcknowledgement === true,
      venueId: ctx.auth.venue.id,
      staffId: ctx.staff.id as string,
      staffName: String(ctx.staff.full_name ?? "Unknown"),
      empNo: (ctx.staff.emp_no as string | null) ?? null,
      recipientEmail: toEmail,
      emailKind: `boarding_${ctx.template.action}`,
      emailKindLabel: ctx.template.name || "Off-boarding",
      subject: ctx.subject,
    });
    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body: ctx.message,
      venue: ctx.auth.venue,
      acknowledgement,
    });

    const result = await sendAppEmail(
      {
        to: toList.length === 1 ? toList[0]! : toList,
        subject: ctx.subject,
        html,
        attachments: inlineAttachments,
        fromOverride: ctx.settings.fromEmail || undefined,
      },
      { venueId: ctx.auth.venue.id, supabase: ctx.auth.supabase },
    );

    const sentAt = new Date().toISOString();
    const fromEmail = ctx.settings.fromEmail.trim() || null;
    const existingId = asUuidOrNull(input.id);
    const rowId = existingId ?? crypto.randomUUID();
    const service = createServiceClient();
    const processId = await resolveExistingOffboardingProcessId(
      service,
      ctx.auth.venue.id,
      input.processId,
    );

    const shared = {
      venue_id: ctx.auth.venue.id,
      staff_id: input.staffId,
      process_id: processId,
      action: input.action,
      status: "sent" as const,
      to_email: toEmail,
      from_email: fromEmail,
      subject: ctx.subject,
      message: ctx.message,
      template_id: ctx.template.id,
      template_name: ctx.template.name,
      provider: result.provider,
      recorded_at: sentAt,
      sent_at: sentAt,
      scheduled_at: null,
      updated_by: ctx.auth.user.id,
      updated_at: sentAt,
    };

    const { data, error: persistError } = existingId
      ? await service
          .from("hr_boarding_emails")
          .update(shared)
          .eq("id", existingId)
          .eq("venue_id", ctx.auth.venue.id)
          .select(BOARDING_EMAIL_SELECT)
          .single()
      : await service
          .from("hr_boarding_emails")
          .insert({
            id: rowId,
            ...shared,
            created_by: ctx.auth.user.id,
          })
          .select(BOARDING_EMAIL_SELECT)
          .single();

    if (persistError) {
      return {
        ok: false,
        error: `Email sent but failed to save record: ${persistError.message}`,
      };
    }

    if (result.messageId) {
      await recordOutboundStaffEmail({
        supabase: service,
        venueId: ctx.auth.venue.id,
        staffId: input.staffId,
        rfcMessageId: result.messageId,
        subject: ctx.subject,
        fromEmail,
        toEmail,
        bodyHtml: html,
        bodyText: ctx.message,
        sourceKind: "boarding",
        sourceId: (data as BoardingEmailRow).id,
        occurredAt: sentAt,
      });
    }

    await writeAuditLog({
      actor_id: ctx.auth.user.id,
      action: "create",
      module_key: HR_MODULE_KEY,
      entity: "boarding_notice_email",
      entity_id: (data as BoardingEmailRow).id,
      venue_id: ctx.auth.venue.id,
      after: {
        action: input.action,
        to: ctx.to,
        subject: ctx.subject,
        templateId: ctx.template.id,
        provider: result.provider,
        status: "sent",
      },
    });

    return {
      ok: true,
      delivery: rowToDelivery(data as BoardingEmailRow),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send email.",
    };
  }
}

const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

function parseFutureScheduleAt(
  value: string | null | undefined,
): { ok: true; iso: string } | { ok: false; error: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false, error: "Choose a date and time to schedule." };
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, error: "Invalid schedule date/time." };
  }
  const now = Date.now();
  if (when.getTime() < now + 60_000) {
    return {
      ok: false,
      error: "Schedule time must be at least 1 minute in the future.",
    };
  }
  if (when.getTime() > now + MAX_SCHEDULE_AHEAD_MS) {
    return {
      ok: false,
      error: "Schedule time cannot be more than 30 days ahead.",
    };
  }
  return { ok: true, iso: when.toISOString() };
}

export async function scheduleBoardingNoticeEmail(input: {
  id?: string | null;
  staffId: string;
  processId?: string | null;
  action: BoardingEmailAction;
  templateId?: string | null;
  notificationDate: string;
  terminationDate: string;
  subject?: string | null;
  message?: string | null;
  to?: string | null;
  scheduledAt: string;
}): Promise<
  | { ok: true; delivery: OffboardingNoticeEmailDelivery }
  | { ok: false; error: string }
> {
  try {
    const when = parseFutureScheduleAt(input.scheduledAt);
    if (!when.ok) return when;

    const ctx = await loadNoticeContext({
      staffId: input.staffId,
      action: input.action,
      templateId: input.templateId,
      notificationDate: input.notificationDate,
      terminationDate: input.terminationDate,
      subjectOverride: input.subject,
      messageOverride: input.message,
    });
    if ("error" in ctx) {
      return { ok: false, error: ctx.error || "Failed to schedule email." };
    }

    if (!ctx.settings.enabled) {
      return {
        ok: false,
        error:
          "Boarding emails are disabled. Enable them in Settings → Emails → Off-Boarding email.",
      };
    }

    const toList = parseBoardingTemplateToEmails(
      input.to?.trim() || ctx.to || "",
    );
    if (toList.length === 0) {
      return {
        ok: false,
        error: boardingEmailUsesFixedRecipients(input.action)
          ? "No recipient emails configured on this template. Set them in Settings → Emails → Off-Boarding email."
          : "No recipient email address. Enter a To address or add a work/personal email on the staff record.",
      };
    }
    const toEmail = toList.join(", ");

    const recordedAt = new Date().toISOString();
    const existingId = asUuidOrNull(input.id);
    const rowId = existingId ?? crypto.randomUUID();
    const fromEmail = ctx.settings.fromEmail.trim() || null;
    const service = createServiceClient();
    const processId = await resolveExistingOffboardingProcessId(
      service,
      ctx.auth.venue.id,
      input.processId,
    );

    const shared = {
      venue_id: ctx.auth.venue.id,
      staff_id: input.staffId,
      process_id: processId,
      action: input.action,
      status: "scheduled" as const,
      to_email: toEmail,
      from_email: fromEmail,
      subject: ctx.subject,
      message: ctx.message,
      template_id: ctx.template.id,
      template_name: ctx.template.name,
      provider: "scheduled",
      recorded_at: recordedAt,
      sent_at: null,
      scheduled_at: when.iso,
      updated_by: ctx.auth.user.id,
      updated_at: recordedAt,
    };

    const { data, error } = existingId
      ? await service
          .from("hr_boarding_emails")
          .update(shared)
          .eq("id", existingId)
          .eq("venue_id", ctx.auth.venue.id)
          .in("status", ["draft", "scheduled"])
          .select(BOARDING_EMAIL_SELECT)
          .single()
      : await service
          .from("hr_boarding_emails")
          .insert({
            id: rowId,
            ...shared,
            created_by: ctx.auth.user.id,
          })
          .select(BOARDING_EMAIL_SELECT)
          .single();

    if (error) return { ok: false, error: error.message };

    await writeAuditLog({
      actor_id: ctx.auth.user.id,
      action: "create",
      module_key: HR_MODULE_KEY,
      entity: "boarding_notice_email",
      entity_id: (data as BoardingEmailRow).id,
      venue_id: ctx.auth.venue.id,
      after: {
        action: input.action,
        to: toEmail,
        subject: ctx.subject,
        templateId: ctx.template.id,
        status: "scheduled",
        scheduledAt: when.iso,
      },
    });

    return { ok: true, delivery: rowToDelivery(data as BoardingEmailRow) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to schedule email.",
    };
  }
}

export async function cancelScheduledBoardingNoticeEmail(input: {
  id: string;
  staffId: string;
}): Promise<
  | { ok: true; draft: OffboardingNoticeEmailDelivery }
  | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    if (!canEditStaff(auth.permissions, auth.venue.id)) {
      return { ok: false, error: "No permission to edit boarding emails." };
    }

    const id = asUuidOrNull(input.id);
    if (!id) return { ok: false, error: "Invalid email record." };

    const recordedAt = new Date().toISOString();
    const service = createServiceClient();
    const { data, error } = await service
      .from("hr_boarding_emails")
      .update({
        status: "draft",
        provider: "draft",
        scheduled_at: null,
        recorded_at: recordedAt,
        updated_by: auth.user.id,
        updated_at: recordedAt,
      })
      .eq("id", id)
      .eq("venue_id", auth.venue.id)
      .eq("staff_id", input.staffId)
      .eq("status", "scheduled")
      .select(BOARDING_EMAIL_SELECT)
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, draft: rowToDelivery(data as BoardingEmailRow) };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Failed to cancel schedule.",
    };
  }
}

export async function deleteBoardingNoticeEmailDraft(input: {
  id: string;
  staffId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    if (!canEditStaff(auth.permissions, auth.venue.id)) {
      return { ok: false, error: "No permission to edit boarding emails." };
    }

    const id = asUuidOrNull(input.id);
    if (!id) return { ok: false, error: "Invalid email record." };

    const service = createServiceClient();
    const { data, error } = await service
      .from("hr_boarding_emails")
      .delete()
      .eq("id", id)
      .eq("venue_id", auth.venue.id)
      .eq("staff_id", input.staffId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) {
      return { ok: false, error: "Draft not found or already removed." };
    }

    await writeAuditLog({
      actor_id: auth.user.id,
      action: "delete",
      module_key: HR_MODULE_KEY,
      entity: "boarding_notice_email",
      entity_id: id,
      venue_id: auth.venue.id,
      after: { status: "deleted_draft" },
    });

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete draft.",
    };
  }
}
