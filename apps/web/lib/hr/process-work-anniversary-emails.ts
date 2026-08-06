import "server-only";

import { writeAuditLog } from "@/lib/audit";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { sendAppEmail } from "@/lib/email/transport";
import { formatDateOnly } from "@/lib/hr/derived";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import { listWorkAnniversaryItems } from "@/lib/hr/work-anniversaries";
import {
  DEFAULT_HR_WORK_ANNIVERSARY_EMAIL_SETTINGS,
  DEFAULT_WORK_ANNIVERSARY_EMAIL_MESSAGE,
  DEFAULT_WORK_ANNIVERSARY_EMAIL_SUBJECT,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrWorkAnniversaryEmailSettings,
  type PayslipEmailRecipientField,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

const SENT_LOG_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

export type WorkAnniversaryEmailSentLog = {
  entries: Record<string, string>;
};

export function mergeWorkAnniversaryEmailSettings(
  partial: Partial<HrWorkAnniversaryEmailSettings> | null | undefined,
): HrWorkAnniversaryEmailSettings {
  const base = DEFAULT_HR_WORK_ANNIVERSARY_EMAIL_SETTINGS;
  const recipientField = (partial?.recipientField ??
    base.recipientField) as PayslipEmailRecipientField;
  const allowed: PayslipEmailRecipientField[] = [
    "work",
    "personal",
    "work_then_personal",
  ];
  return {
    enabled:
      typeof partial?.enabled === "boolean" ? partial.enabled : base.enabled,
    autoSendOnAnniversary:
      typeof partial?.autoSendOnAnniversary === "boolean"
        ? partial.autoSendOnAnniversary
        : base.autoSendOnAnniversary,
    recipientField: allowed.includes(recipientField)
      ? recipientField
      : base.recipientField,
    fromEmail: String(partial?.fromEmail ?? base.fromEmail).trim(),
    subject:
      String(partial?.subject ?? "").trim() ||
      DEFAULT_WORK_ANNIVERSARY_EMAIL_SUBJECT,
    message:
      String(partial?.message ?? "").trim() ||
      DEFAULT_WORK_ANNIVERSARY_EMAIL_MESSAGE,
  };
}

export function workAnniversarySentKey(
  staffId: string,
  anniversaryDate: string,
): string {
  return `${staffId}:${anniversaryDate}`;
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

export function buildWorkAnniversaryEmailVars(params: {
  staff: {
    emp_no: string | null;
    full_name: string | null;
  };
  venueName: string | null | undefined;
  years: number;
  anniversaryDate: string;
  userName: string;
}): Record<string, string> {
  const years = Math.max(1, Math.floor(Number(params.years) || 0));
  return {
    EMPLOYEE_NAME: String(params.staff.full_name ?? "").trim() || "Colleague",
    EMP_NO: String(params.staff.emp_no ?? "").trim(),
    YEARS: String(years),
    YEARS_LABEL: years === 1 ? "year" : "years",
    ANNIVERSARY_DATE: formatDateOnly(params.anniversaryDate),
    VENUE_NAME: params.venueName?.trim() || "Our team",
    USER_NAME: params.userName.trim() || "Human Resources",
  };
}

export function composeWorkAnniversaryEmailContent(params: {
  settings: HrWorkAnniversaryEmailSettings;
  vars: Record<string, string>;
  staff: { work_email: string | null; personal_email: string | null };
  draft?: { to?: string; subject?: string; body?: string } | null;
}): { to: string | null; subject: string; body: string } {
  const resolvedTo = resolveWorkAnniversaryRecipient(
    params.settings.recipientField,
    params.staff,
  );
  const to =
    String(params.draft?.to ?? "").trim() || resolvedTo;
  const subject =
    String(params.draft?.subject ?? "").trim() ||
    applyEmailPlaceholders(params.settings.subject, params.vars);
  const body =
    String(params.draft?.body ?? "").trim() ||
    applyEmailPlaceholders(params.settings.message, params.vars);
  return { to, subject, body };
}

export function resolveWorkAnniversaryRecipient(
  field: PayslipEmailRecipientField,
  staff: { work_email: string | null; personal_email: string | null },
): string | null {
  const work = staff.work_email?.trim() || null;
  const personal = staff.personal_email?.trim() || null;
  if (field === "work") return work;
  if (field === "personal") return personal;
  return work || personal;
}

async function loadSentLog(
  supabase: SupabaseClient,
  venueId: string,
): Promise<WorkAnniversaryEmailSentLog> {
  const { data } = await supabase
    .from("hr_venue_settings")
    .select("value")
    .eq("venue_id", venueId)
    .eq("key", HR_SETTINGS_KEYS.workAnniversaryEmailSent)
    .maybeSingle();
  const raw = (data?.value ?? {}) as Partial<WorkAnniversaryEmailSentLog>;
  return {
    entries:
      raw.entries && typeof raw.entries === "object" && !Array.isArray(raw.entries)
        ? (raw.entries as Record<string, string>)
        : {},
  };
}

function pruneSentLog(log: WorkAnniversaryEmailSentLog): WorkAnniversaryEmailSentLog {
  const cutoff = Date.now() - SENT_LOG_MAX_AGE_MS;
  const entries: Record<string, string> = {};
  for (const [key, iso] of Object.entries(log.entries)) {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t >= cutoff) entries[key] = iso;
  }
  return { entries };
}

async function saveSentLog(
  supabase: SupabaseClient,
  venueId: string,
  log: WorkAnniversaryEmailSentLog,
): Promise<void> {
  await supabase.from("hr_venue_settings").upsert(
    {
      venue_id: venueId,
      key: HR_SETTINGS_KEYS.workAnniversaryEmailSent,
      value: pruneSentLog(log),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
}

export async function markWorkAnniversaryEmailSent(params: {
  supabase: SupabaseClient;
  venueId: string;
  staffId: string;
  anniversaryDate: string;
  sentAt?: string;
}): Promise<void> {
  const log = await loadSentLog(params.supabase, params.venueId);
  const key = workAnniversarySentKey(params.staffId, params.anniversaryDate);
  log.entries[key] = params.sentAt ?? new Date().toISOString();
  await saveSentLog(params.supabase, params.venueId, log);
}

export async function wasWorkAnniversaryEmailSent(params: {
  supabase: SupabaseClient;
  venueId: string;
  staffId: string;
  anniversaryDate: string;
}): Promise<boolean> {
  const log = await loadSentLog(params.supabase, params.venueId);
  const key = workAnniversarySentKey(params.staffId, params.anniversaryDate);
  return Boolean(log.entries[key]);
}

export async function deliverWorkAnniversaryEmail(params: {
  venue: {
    id: string;
    name?: string | null;
    slug?: string | null;
    logo_url?: string | null;
    icon_url?: string | null;
    favicon_url?: string | null;
  };
  staff: {
    id: string;
    emp_no: string | null;
    full_name: string | null;
    work_email: string | null;
    personal_email: string | null;
  };
  settings: HrWorkAnniversaryEmailSettings;
  years: number;
  anniversaryDate: string;
  userName: string;
  actorId: string | null;
  supabase?: SupabaseClient;
  draft?: { to?: string; subject?: string; body?: string } | null;
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  if (!params.settings.enabled) {
    return {
      ok: false,
      error:
        "Work anniversary emails are disabled. Enable them under Settings → Emails → Other templates.",
    };
  }

  const years = Math.max(1, Math.floor(Number(params.years) || 0));
  const vars = buildWorkAnniversaryEmailVars({
    staff: params.staff,
    venueName: params.venue.name,
    years,
    anniversaryDate: params.anniversaryDate,
    userName: params.userName,
  });
  const composed = composeWorkAnniversaryEmailContent({
    settings: params.settings,
    vars,
    staff: params.staff,
    draft: params.draft,
  });
  if (!composed.to) {
    return {
      ok: false,
      error: "No recipient email on this staff record for the selected field.",
    };
  }

  const supabase = params.supabase ?? createServiceClient();

  let sendMessageId: string | null = null;
  let sentHtml = "";

  try {
    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body: composed.body,
      venue: {
        ...params.venue,
        slug: params.venue.slug ?? "",
      },
    });
    sentHtml = html;

    const sendResult = await sendAppEmail(
      {
        to: composed.to,
        subject: composed.subject,
        html,
        attachments:
          inlineAttachments.length > 0 ? inlineAttachments : undefined,
        fromOverride: params.settings.fromEmail || undefined,
      },
      { venueId: params.venue.id, supabase },
    );
    sendMessageId = sendResult.messageId;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send email.",
    };
  }

  await markWorkAnniversaryEmailSent({
    supabase,
    venueId: params.venue.id,
    staffId: params.staff.id,
    anniversaryDate: params.anniversaryDate,
  });

  const auditId = await writeAuditLog({
    actor_id: params.actorId,
    action: "work_anniversary_email.sent",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: params.staff.id,
    venue_id: params.venue.id,
    after: {
      to: composed.to,
      years,
      anniversaryDate: params.anniversaryDate,
      auto: params.actorId == null,
    },
  });

  if (sendMessageId && auditId) {
    await recordOutboundStaffEmail({
      supabase,
      venueId: params.venue.id,
      staffId: params.staff.id,
      rfcMessageId: sendMessageId,
      subject: composed.subject,
      fromEmail: params.settings.fromEmail || null,
      toEmail: composed.to,
      bodyHtml: sentHtml,
      bodyText: composed.body,
      sourceKind: "audit",
      sourceId: auditId,
    });
  }

  return { ok: true, to: composed.to };
}

/**
 * Send congratulations for staff whose anniversary is today (Dubai calendar),
 * when auto-send is enabled for the venue. Idempotent via sent log.
 */
export async function processDueWorkAnniversaryEmails(options?: {
  venueId?: string;
  limit?: number;
}): Promise<{
  venues: number;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const service = createServiceClient();
  const errors: string[] = [];
  let venues = 0;
  let candidates = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  let settingsQuery = service
    .from("hr_venue_settings")
    .select("venue_id, value")
    .eq("key", HR_SETTINGS_KEYS.workAnniversaryEmail);

  if (options?.venueId) {
    settingsQuery = settingsQuery.eq("venue_id", options.venueId);
  }

  const { data: settingRows, error: settingsError } = await settingsQuery;
  if (settingsError) {
    return {
      venues: 0,
      candidates: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [settingsError.message],
    };
  }

  for (const row of settingRows ?? []) {
    const settings = mergeWorkAnniversaryEmailSettings(
      row.value as Partial<HrWorkAnniversaryEmailSettings>,
    );
    if (!settings.enabled || !settings.autoSendOnAnniversary) continue;
    venues += 1;

    const venueId = String(row.venue_id);
    const { data: venue } = await service
      .from("venues")
      .select("id, name, slug, logo_url, icon_url, favicon_url")
      .eq("id", venueId)
      .maybeSingle();
    if (!venue) continue;

    const { data: staffRows, error: staffError } = await service
      .from("staff")
      .select(
        "id, emp_no, full_name, joining_date, work_email, personal_email, employment_status:employment_statuses(name)",
      )
      .eq("home_venue_id", venueId);

    if (staffError) {
      errors.push(`${venueId}: ${staffError.message}`);
      continue;
    }

    const anniversaryStaff = (staffRows ?? []).map((row) => {
      const status = row.employment_status as
        | { name: string }
        | { name: string }[]
        | null
        | undefined;
      const statusRow = Array.isArray(status) ? status[0] : status;
      return {
        id: String(row.id),
        emp_no: String(row.emp_no ?? ""),
        full_name: String(row.full_name ?? ""),
        joining_date: (row.joining_date as string | null) ?? null,
        employment_status: statusRow?.name
          ? { name: String(statusRow.name) }
          : null,
      };
    });

    const todayItems = listWorkAnniversaryItems(anniversaryStaff, 0).filter(
      (item) => item.daysUntil === 0,
    );

    const sentLog = await loadSentLog(service, venueId);
    let venueDirty = false;

    for (const item of todayItems) {
      if (candidates >= limit) break;
      candidates += 1;

      const dedupeKey = workAnniversarySentKey(item.staffId, item.anniversaryDate);
      if (sentLog.entries[dedupeKey]) {
        skipped += 1;
        continue;
      }

      const staffRow = (staffRows ?? []).find((s) => s.id === item.staffId);
      if (!staffRow) {
        skipped += 1;
        continue;
      }

      // Optimistic claim so concurrent cron/page loads don't double-send.
      sentLog.entries[dedupeKey] = new Date().toISOString();
      venueDirty = true;
      await saveSentLog(service, venueId, sentLog);

      const result = await deliverWorkAnniversaryEmail({
        venue,
        staff: {
          id: staffRow.id,
          emp_no: staffRow.emp_no as string | null,
          full_name: staffRow.full_name as string | null,
          work_email: (staffRow.work_email as string | null) ?? null,
          personal_email: (staffRow.personal_email as string | null) ?? null,
        },
        settings,
        years: item.years,
        anniversaryDate: item.anniversaryDate,
        userName: "Human Resources",
        actorId: null,
        supabase: service,
      });

      if (!result.ok) {
        failed += 1;
        errors.push(`${item.fullName}: ${result.error}`);
        delete sentLog.entries[dedupeKey];
        venueDirty = true;
        await saveSentLog(service, venueId, sentLog);
        continue;
      }

      sent += 1;
    }

    if (venueDirty) {
      // already saved during claim/rollback
    }
  }

  return { venues, candidates, sent, skipped, failed, errors };
}
