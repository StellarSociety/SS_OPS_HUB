import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { sendAppEmail } from "@/lib/email/transport";
import { acknowledgementCtaForSend } from "@/lib/hr/acknowledgement-store";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import {
  isPositionSalaryEmailKind,
  mergePositionSalaryEmailSettings,
  POSITION_SALARY_EMAIL_KIND_LABELS,
  type HrPositionSalaryEmailSettings,
  type PositionSalaryEmailKind,
  type PositionSalaryEmailRecord,
} from "@/lib/hr/position-salary-email";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type PayslipEmailRecipientField,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

export type EmailVenue = {
  id: string;
  name?: string | null;
  slug?: string | null;
  logo_url?: string | null;
  icon_url?: string | null;
  favicon_url?: string | null;
};

/** Everything a letter needs about one position / salary change. */
export type PositionSalaryChangeContext = {
  changeId: string;
  staffId: string;
  empNo: string;
  employeeName: string;
  workEmail: string | null;
  personalEmail: string | null;
  effectiveDate: string;
  currentPosition: string;
  newPosition: string;
  currentSalary: number | null;
  newSalary: number | null;
};

export async function getPositionSalaryEmailSettingsFor(
  client: SupabaseClient,
  venueId: string,
): Promise<HrPositionSalaryEmailSettings> {
  const stored = await getHrVenueSetting<Partial<HrPositionSalaryEmailSettings>>(
    client,
    venueId,
    HR_SETTINGS_KEYS.positionSalaryEmail,
    {},
  );
  return mergePositionSalaryEmailSettings(stored);
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function loadPositionSalaryChangeContext(
  service: SupabaseClient,
  venueId: string,
  changeId: string,
): Promise<PositionSalaryChangeContext | null> {
  const { data: change } = await service
    .from("hr_staff_position_salary_changes")
    .select(
      "id, staff_id, effective_date, from_position_id, to_position_id, from_wage_package, to_wage_package",
    )
    .eq("venue_id", venueId)
    .eq("id", changeId)
    .maybeSingle();
  if (!change) return null;

  const positionIds = [change.from_position_id, change.to_position_id].filter(
    (id): id is string => typeof id === "string",
  );
  const [{ data: staff }, { data: positions }] = await Promise.all([
    service
      .from("staff")
      .select(
        "id, emp_no, full_name, work_email, personal_email, position:positions(name)",
      )
      .eq("id", change.staff_id)
      .maybeSingle(),
    positionIds.length > 0
      ? service.from("positions").select("id, name").in("id", positionIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  if (!staff) return null;

  const posName = (id: unknown) =>
    (positions ?? []).find((p) => p.id === id)?.name ?? null;
  const current = staff.position as { name?: string } | { name?: string }[] | null;
  const currentName = (Array.isArray(current) ? current[0] : current)?.name ?? "";
  const fromPosition = posName(change.from_position_id) ?? currentName;

  return {
    changeId: String(change.id),
    staffId: String(staff.id),
    empNo: String(staff.emp_no ?? "").trim(),
    employeeName: String(staff.full_name ?? "").trim() || "Employee",
    workEmail: (staff.work_email as string | null) ?? null,
    personalEmail: (staff.personal_email as string | null) ?? null,
    effectiveDate: String(change.effective_date).slice(0, 10),
    currentPosition: fromPosition,
    newPosition: posName(change.to_position_id) ?? fromPosition,
    currentSalary: numOrNull(change.from_wage_package),
    newSalary: numOrNull(change.to_wage_package),
  };
}

export async function resolveCompanyName(
  service: SupabaseClient,
  venue: EmailVenue,
  settings: HrPositionSalaryEmailSettings,
): Promise<string> {
  if (settings.companyName) return settings.companyName;
  const { data } = await service
    .from("venue_entities")
    .select("legal_entities(name)")
    .eq("venue_id", venue.id)
    .maybeSingle();
  const entity = data?.legal_entities as
    | { name?: string }
    | { name?: string }[]
    | null
    | undefined;
  const name = (Array.isArray(entity) ? entity[0] : entity)?.name;
  return String(name ?? "").trim() || venue.name?.trim() || "the company";
}

function letterDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function letterAmount(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-AE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function applyPlaceholders(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key.toUpperCase()] ?? "";
  });
}

function resolveRecipient(
  field: PayslipEmailRecipientField,
  ctx: Pick<PositionSalaryChangeContext, "workEmail" | "personalEmail">,
): string | null {
  const work = ctx.workEmail?.trim() || null;
  const personal = ctx.personalEmail?.trim() || null;
  if (field === "work") return work;
  if (field === "personal") return personal;
  return work ?? personal;
}

export function composePositionSalaryLetter(params: {
  settings: HrPositionSalaryEmailSettings;
  kind: PositionSalaryEmailKind;
  ctx: PositionSalaryChangeContext;
  venueName: string;
  companyName: string;
  userName: string;
}): { to: string | null; subject: string; body: string } {
  const { ctx } = params;
  const vars: Record<string, string> = {
    EMPLOYEE_NAME: ctx.employeeName,
    EMP_NO: ctx.empNo,
    EFFECTIVE_DATE: letterDate(ctx.effectiveDate),
    CURRENT_POSITION: ctx.currentPosition || "—",
    NEW_POSITION: ctx.newPosition || "—",
    CURRENT_SALARY: letterAmount(ctx.currentSalary),
    NEW_SALARY: letterAmount(ctx.newSalary),
    COMPANY_NAME: params.companyName,
    VENUE_NAME: params.venueName,
    USER_NAME: params.userName.trim() || "Human Resources",
  };
  const template = params.settings.templates[params.kind];
  return {
    to: resolveRecipient(params.settings.recipientField, ctx),
    subject: applyPlaceholders(template.subject, vars),
    body: applyPlaceholders(template.message, vars),
  };
}

/** Send one letter now. Does not persist; callers record the row. */
export async function deliverPositionSalaryLetter(params: {
  service: SupabaseClient;
  venue: EmailVenue;
  staff: { id: string; fullName: string; empNo: string | null };
  kind: PositionSalaryEmailKind;
  to: string;
  fromEmail: string | null;
  subject: string;
  body: string;
  requiresAcknowledgement: boolean;
}): Promise<{ provider: string; messageId: string | null; html: string }> {
  const acknowledgement = await acknowledgementCtaForSend({
    requiresAcknowledgement: params.requiresAcknowledgement,
    venueId: params.venue.id,
    staffId: params.staff.id,
    staffName: params.staff.fullName,
    empNo: params.staff.empNo,
    recipientEmail: params.to,
    emailKind: `position_salary_${params.kind}`,
    emailKindLabel: POSITION_SALARY_EMAIL_KIND_LABELS[params.kind],
    subject: params.subject,
  });
  const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
    body: params.body,
    venue: { ...params.venue, slug: params.venue.slug ?? "" },
    acknowledgement,
  });
  const result = await sendAppEmail(
    {
      to: params.to,
      subject: params.subject,
      html,
      attachments: inlineAttachments.length > 0 ? inlineAttachments : undefined,
      fromOverride: params.fromEmail || undefined,
    },
    { venueId: params.venue.id, supabase: params.service },
  );
  return { provider: result.provider, messageId: result.messageId, html };
}

/** Audit + staff communications trail for a delivered letter. */
export async function recordPositionSalaryLetterSent(params: {
  service: SupabaseClient;
  venueId: string;
  staffId: string;
  rowId: string;
  kind: PositionSalaryEmailKind;
  to: string;
  fromEmail: string | null;
  subject: string;
  body: string;
  html: string;
  messageId: string | null;
  actorId: string | null;
  scheduled: boolean;
}): Promise<void> {
  const auditId = await writeAuditLog({
    actor_id: params.actorId,
    action: "position_salary_email.sent",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: params.staffId,
    venue_id: params.venueId,
    after: {
      emailId: params.rowId,
      kind: params.kind,
      to: params.to,
      subject: params.subject,
      scheduledSend: params.scheduled,
    },
  });
  if (params.messageId && auditId) {
    await recordOutboundStaffEmail({
      supabase: params.service,
      venueId: params.venueId,
      staffId: params.staffId,
      rfcMessageId: params.messageId,
      subject: params.subject,
      fromEmail: params.fromEmail,
      toEmail: params.to,
      bodyHtml: params.html,
      bodyText: params.body,
      sourceKind: "audit",
      sourceId: auditId,
    });
  }
}

const RECORD_SELECT =
  "id, change_id, kind, status, to_email, subject, sent_at, scheduled_at";

type RecordRow = {
  id: string;
  change_id: string;
  kind: string;
  status: string;
  to_email: string;
  subject: string;
  sent_at: string | null;
  scheduled_at: string | null;
};

export function toPositionSalaryEmailRecord(
  row: RecordRow,
): PositionSalaryEmailRecord {
  return {
    id: row.id,
    changeId: row.change_id,
    kind: isPositionSalaryEmailKind(row.kind) ? row.kind : "promotion",
    status:
      row.status === "sent" || row.status === "cancelled"
        ? row.status
        : "scheduled",
    to: row.to_email,
    subject: row.subject,
    sentAt: row.sent_at,
    scheduledAt: row.scheduled_at,
  };
}

/** Latest sent or scheduled letter per change, keyed by change id. */
export async function listLatestPositionSalaryEmails(
  venueId: string,
): Promise<Record<string, PositionSalaryEmailRecord>> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("hr_position_salary_emails")
    .select(RECORD_SELECT)
    .eq("venue_id", venueId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[hr] listLatestPositionSalaryEmails:", error.message);
    return {};
  }
  const latest: Record<string, PositionSalaryEmailRecord> = {};
  for (const row of (data ?? []) as RecordRow[]) {
    latest[row.change_id] ??= toPositionSalaryEmailRecord(row);
  }
  return latest;
}

/**
 * Claim and send letters whose scheduled time has passed. Concurrent-safe:
 * a row is claimed by moving provider scheduled → sending.
 */
export async function processDueScheduledPositionSalaryEmails(options?: {
  limit?: number;
}): Promise<{ claimed: number; sent: number; failed: number; errors: string[] }> {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
  const service = createServiceClient();
  const errors: string[] = [];
  let claimed = 0;
  let sent = 0;
  let failed = 0;

  const { data: due, error } = await service
    .from("hr_position_salary_emails")
    .select(
      "id, venue_id, staff_id, kind, to_email, from_email, subject, message, requires_acknowledgement",
    )
    .eq("status", "scheduled")
    .eq("provider", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) return { claimed, sent, failed, errors: [error.message] };

  for (const row of due ?? []) {
    const { data: claim } = await service
      .from("hr_position_salary_emails")
      .update({ provider: "sending", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "scheduled")
      .eq("provider", "scheduled")
      .select("id")
      .maybeSingle();
    if (!claim) continue;
    claimed += 1;

    const kind = isPositionSalaryEmailKind(row.kind) ? row.kind : "promotion";
    try {
      const [{ data: venue }, { data: staff }] = await Promise.all([
        service
          .from("venues")
          .select("id, name, slug, logo_url, icon_url, favicon_url")
          .eq("id", row.venue_id)
          .maybeSingle(),
        service
          .from("staff")
          .select("id, full_name, emp_no")
          .eq("id", row.staff_id)
          .maybeSingle(),
      ]);
      const delivered = await deliverPositionSalaryLetter({
        service,
        venue: (venue as EmailVenue | null) ?? { id: row.venue_id },
        staff: {
          id: row.staff_id,
          fullName: String(staff?.full_name ?? "Unknown"),
          empNo: (staff?.emp_no as string | null) ?? null,
        },
        kind,
        to: row.to_email,
        fromEmail: row.from_email,
        subject: row.subject,
        body: row.message,
        requiresAcknowledgement: row.requires_acknowledgement === true,
      });

      const sentAt = new Date().toISOString();
      await service
        .from("hr_position_salary_emails")
        .update({
          status: "sent",
          provider: delivered.provider,
          sent_at: sentAt,
          last_error: null,
          updated_at: sentAt,
        })
        .eq("id", row.id);

      await recordPositionSalaryLetterSent({
        service,
        venueId: row.venue_id,
        staffId: row.staff_id,
        rowId: row.id,
        kind,
        to: row.to_email,
        fromEmail: row.from_email,
        subject: row.subject,
        body: row.message,
        html: delivered.html,
        messageId: delivered.messageId,
        actorId: null,
        scheduled: true,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Send failed";
      errors.push(`${row.id}: ${message}`);
      // Release the claim so the next run retries.
      await service
        .from("hr_position_salary_emails")
        .update({
          provider: "scheduled",
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("provider", "sending");
    }
  }

  return { claimed, sent, failed, errors };
}
