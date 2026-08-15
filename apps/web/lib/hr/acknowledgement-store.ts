import "server-only";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  acknowledgementPublicUrl,
  mergeAcknowledgementPageSettings,
  mergeAcknowledgementReminderSettings,
  parseAcknowledgementRecord,
  resolveAcknowledgementButtonLabel,
  type HrAcknowledgementPageSettings,
  type HrAcknowledgementReminderSettings,
  type HrAcknowledgementSentEmail,
  type HrEmailAcknowledgementRecord,
  type HrEmailAcknowledgementStatus,
} from "@/lib/hr/acknowledgement";
import { resolveVenueFromEmail } from "@/lib/email/transport";
import { getHrVenueSetting } from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

const TABLE = "hr_email_acknowledgements";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asStaffUuid(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return UUID_RE.test(text) ? text : null;
}

export async function loadAcknowledgementPageSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrAcknowledgementPageSettings> {
  const stored = await getHrVenueSetting<Partial<HrAcknowledgementPageSettings>>(
    supabase,
    venueId,
    HR_SETTINGS_KEYS.acknowledgementPage,
    {},
  );
  return mergeAcknowledgementPageSettings(stored);
}

export async function loadAcknowledgementReminderSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrAcknowledgementReminderSettings> {
  const stored = await getHrVenueSetting<
    Partial<HrAcknowledgementReminderSettings>
  >(supabase, venueId, HR_SETTINGS_KEYS.acknowledgementReminders, {});
  return mergeAcknowledgementReminderSettings(stored);
}

export async function getAcknowledgementRecordById(
  supabase: SupabaseClient,
  venueId: string,
  recordId: string,
): Promise<HrEmailAcknowledgementRecord | null> {
  const id = String(recordId ?? "").trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) {
    console.error("[hr] getAcknowledgementRecordById:", error.message);
    return null;
  }
  return parseAcknowledgementRecord(data);
}

export async function incrementAcknowledgementReminderCount(
  supabase: SupabaseClient,
  venueId: string,
  recordId: string,
  currentCount: number,
): Promise<number> {
  const next = Math.max(0, Math.floor(currentCount)) + 1;
  const { error } = await supabase
    .from(TABLE)
    .update({
      reminder_count: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId)
    .eq("venue_id", venueId);
  if (error) {
    console.error("[hr] incrementAcknowledgementReminderCount:", error.message);
    throw new Error(error.message);
  }
  return next;
}

export async function listAcknowledgementRecordsForVenue(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrEmailAcknowledgementRecord[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("venue_id", venueId)
    .order("sent_at", { ascending: false });

  if (error) {
    console.error("[hr] listAcknowledgementRecordsForVenue:", error.message);
    return [];
  }

  const records: HrEmailAcknowledgementRecord[] = [];
  for (const row of data ?? []) {
    const parsed = parseAcknowledgementRecord(row);
    if (parsed) records.push(parsed);
  }
  return records;
}

export async function getAcknowledgementRecordByToken(
  token: string,
): Promise<HrEmailAcknowledgementRecord | null> {
  const clean = String(token ?? "").trim();
  if (!clean) return null;
  const service = createServiceClient();
  const { data, error } = await service
    .from(TABLE)
    .select("*")
    .eq("token", clean)
    .maybeSingle();
  if (error) {
    console.error("[hr] getAcknowledgementRecordByToken:", error.message);
    return null;
  }
  return parseAcknowledgementRecord(data);
}

export type CreatePendingAcknowledgementInput = {
  venueId: string;
  staffId?: string | null;
  staffName: string;
  empNo?: string | null;
  recipientEmail?: string | null;
  emailKind: string;
  emailKindLabel: string;
  subject: string;
};

async function insertPendingAcknowledgement(
  service: SupabaseClient,
  token: string,
  input: CreatePendingAcknowledgementInput,
  staffId: string | null,
): Promise<HrEmailAcknowledgementRecord> {
  const now = new Date().toISOString();
  const { data, error } = await service
    .from(TABLE)
    .insert({
      token,
      venue_id: input.venueId,
      staff_id: staffId,
      staff_name: input.staffName.trim() || "Unknown",
      emp_no: input.empNo?.trim() || null,
      recipient_email: input.recipientEmail?.trim() || null,
      email_kind: input.emailKind.trim() || "email",
      email_kind_label: input.emailKindLabel.trim() || "Email",
      subject: input.subject.trim() || "(No subject)",
      status: "pending",
      comments: "",
      sent_at: now,
      responded_at: null,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const record = parseAcknowledgementRecord(data);
  if (!record) throw new Error("Failed to create acknowledgement record.");
  return record;
}

export async function createPendingAcknowledgement(
  input: CreatePendingAcknowledgementInput,
): Promise<{ record: HrEmailAcknowledgementRecord; url: string }> {
  const token = randomBytes(24).toString("base64url");
  const service = createServiceClient();
  const staffId = asStaffUuid(input.staffId);

  let record: HrEmailAcknowledgementRecord;
  try {
    record = await insertPendingAcknowledgement(service, token, input, staffId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!staffId || !/staff_id|foreign key/i.test(message)) throw error;
    record = await insertPendingAcknowledgement(service, token, input, null);
  }

  revalidatePath("/hr/communications/acknowledgements", "page");
  return { record, url: acknowledgementPublicUrl(token) };
}

export async function acknowledgementCtaForSend(params: {
  requiresAcknowledgement: boolean;
  venueId: string;
  staffId?: string | null;
  staffName: string;
  empNo?: string | null;
  recipientEmail?: string | null;
  emailKind: string;
  emailKindLabel: string;
  subject: string;
  buttonLabel?: string;
}): Promise<{ url: string; buttonLabel: string; token: string } | null> {
  if (!params.requiresAcknowledgement) return null;

  try {
    const service = createServiceClient();
    const [created, page, venue] = await Promise.all([
      createPendingAcknowledgement({
        venueId: params.venueId,
        staffId: params.staffId,
        staffName: params.staffName,
        empNo: params.empNo,
        recipientEmail: params.recipientEmail,
        emailKind: params.emailKind,
        emailKindLabel: params.emailKindLabel,
        subject: params.subject,
      }),
      loadAcknowledgementPageSettings(service, params.venueId),
      service
        .from("venues")
        .select("name")
        .eq("id", params.venueId)
        .maybeSingle()
        .then((result) => result.data),
    ]);

    return {
      url: created.url,
      token: created.record.token,
      buttonLabel: resolveAcknowledgementButtonLabel(
        params.buttonLabel?.trim() || page.emailButtonLabel,
        {
          employeeName: params.staffName,
          employeeEmail: params.recipientEmail ?? "",
          subject: params.subject,
          venueName: String(venue?.name ?? "").trim(),
        },
      ),
    };
  } catch (error) {
    console.error("[hr] acknowledgementCtaForSend:", error);
    return null;
  }
}

export async function saveAcknowledgementSentEmailContent(params: {
  token: string;
  bodyHtml: string;
  bodyText?: string | null;
  fromEmail?: string | null;
}): Promise<void> {
  const token = String(params.token ?? "").trim();
  if (!token) return;
  const html = String(params.bodyHtml ?? "").trim();
  const text = String(params.bodyText ?? "").trim();
  if (!html && !text) return;

  const service = createServiceClient();
  let fromEmail = String(params.fromEmail ?? "").trim() || null;
  if (!fromEmail) {
    const { data: row } = await service
      .from(TABLE)
      .select("venue_id")
      .eq("token", token)
      .maybeSingle();
    const venueId = String(row?.venue_id ?? "").trim();
    if (venueId) {
      fromEmail = (await resolveVenueFromEmail(service, venueId)) || null;
    }
  }

  const { error } = await service
    .from(TABLE)
    .update({
      body_html: html || null,
      body_text: text || null,
      from_email: fromEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("token", token);
  if (error) {
    console.error("[hr] saveAcknowledgementSentEmailContent:", error.message);
  }
}

function pickClosestEmailMessage<
  T extends { occurred_at?: string | null },
>(rows: T[] | null | undefined, sentAt: string): T | null {
  if (!rows?.length) return null;
  const target = Date.parse(sentAt);
  if (!Number.isFinite(target)) return rows[0] ?? null;
  let best = rows[0]!;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const at = Date.parse(String(row.occurred_at ?? ""));
    const delta = Number.isFinite(at) ? Math.abs(at - target) : Number.POSITIVE_INFINITY;
    if (delta < bestDelta) {
      best = row;
      bestDelta = delta;
    }
  }
  return best;
}

export async function loadAcknowledgementSentEmail(
  supabase: SupabaseClient,
  venueId: string,
  recordId: string,
): Promise<HrAcknowledgementSentEmail | null> {
  const id = String(recordId ?? "").trim();
  if (!id) return null;

  const { data: row, error } = await supabase
    .from(TABLE)
    .select(
      "id, venue_id, staff_id, staff_name, recipient_email, from_email, subject, email_kind_label, sent_at, body_html, body_text",
    )
    .eq("id", id)
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) {
    console.error("[hr] loadAcknowledgementSentEmail:", error.message);
    return null;
  }
  if (!row) return null;

  let html = String(row.body_html ?? "").trim() || null;
  let text = String(row.body_text ?? "").trim() || null;
  let fromEmail = String(row.from_email ?? "").trim() || null;

  if (!html && !text) {
    let query = supabase
      .from("hr_email_messages")
      .select("from_email, to_email, body_html, body_text, occurred_at")
      .eq("venue_id", venueId)
      .eq("direction", "outbound")
      .eq("subject", String(row.subject ?? "").trim())
      .limit(8);

    const staffId = String(row.staff_id ?? "").trim();
    const toEmail = String(row.recipient_email ?? "").trim();
    if (staffId) query = query.eq("staff_id", staffId);
    else if (toEmail) query = query.ilike("to_email", toEmail);

    const { data: messages } = await query;
    const match = pickClosestEmailMessage(messages, String(row.sent_at ?? ""));
    if (match) {
      html = String(match.body_html ?? "").trim() || null;
      text = String(match.body_text ?? "").trim() || html;
      fromEmail = String(match.from_email ?? "").trim() || fromEmail;
    }
  }

  if (!fromEmail) {
    fromEmail = (await resolveVenueFromEmail(supabase, venueId)) || null;
  }

  return {
    to: String(row.recipient_email ?? "").trim() || null,
    from: fromEmail,
    subject: String(row.subject ?? "").trim() || "(No subject)",
    sentAt: String(row.sent_at ?? ""),
    html,
    text,
    staffName: String(row.staff_name ?? "").trim() || "Unknown",
    emailKindLabel: String(row.email_kind_label ?? "").trim() || "Email",
  };
}

export async function submitAcknowledgementRecord(input: {
  token: string;
  status: Exclude<HrEmailAcknowledgementStatus, "pending">;
  comments: string;
}): Promise<
  | { ok: true; record: HrEmailAcknowledgementRecord }
  | { ok: false; error: string }
> {
  const token = String(input.token ?? "").trim();
  if (!token) return { ok: false, error: "This acknowledgement link is invalid." };

  const comments = String(input.comments ?? "").trim();
  if (input.status === "not_acknowledged" && !comments) {
    return { ok: false, error: "Please add a comment if you do not acknowledge." };
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await service
    .from(TABLE)
    .update({
      status: input.status,
      comments,
      responded_at: now,
      updated_at: now,
    })
    .eq("token", token)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  const updated = parseAcknowledgementRecord(data);
  if (updated) {
    revalidatePath("/hr/communications/acknowledgements", "page");
    return { ok: true, record: updated };
  }

  const existing = await getAcknowledgementRecordByToken(token);
  if (!existing) {
    return { ok: false, error: "This acknowledgement link is invalid or has expired." };
  }
  return { ok: false, error: "This acknowledgement has already been submitted." };
}
