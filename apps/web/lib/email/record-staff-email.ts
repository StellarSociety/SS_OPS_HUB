import "server-only";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffEmailSourceKind =
  | "boarding"
  | "payslip"
  | "audit"
  | "invite";

export function normalizeRfcMessageId(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed;
  return `<${trimmed.replace(/^<|>$/g, "")}>`;
}

export function generateRfcMessageId(fromEmail?: string | null): string {
  const domain =
    String(fromEmail ?? "")
      .split("@")[1]
      ?.trim()
      .toLowerCase() || "ss-ops-hub.local";
  return `<${randomUUID()}@${domain}>`;
}

export async function recordOutboundStaffEmail(params: {
  supabase: SupabaseClient;
  venueId: string;
  staffId: string;
  rfcMessageId: string;
  subject: string;
  fromEmail?: string | null;
  toEmail: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  sourceKind: StaffEmailSourceKind;
  sourceId: string;
  occurredAt?: string;
}): Promise<{ id: string; threadId: string } | null> {
  const rfcMessageId = normalizeRfcMessageId(params.rfcMessageId);
  if (!rfcMessageId) return null;

  const threadId = randomUUID();
  const occurredAt = params.occurredAt ?? new Date().toISOString();
  const toEmail = String(params.toEmail ?? "").trim();
  const subject = String(params.subject ?? "").trim();

  const { data, error } = await params.supabase
    .from("hr_email_messages")
    .upsert(
      {
        venue_id: params.venueId,
        staff_id: params.staffId,
        thread_id: threadId,
        direction: "outbound",
        rfc_message_id: rfcMessageId,
        in_reply_to: null,
        references_header: null,
        subject,
        from_email: String(params.fromEmail ?? "").trim() || null,
        to_email: toEmail,
        body_text: params.bodyText ?? null,
        body_html: params.bodyHtml ?? null,
        source_kind: params.sourceKind,
        source_id: params.sourceId,
        occurred_at: occurredAt,
      },
      { onConflict: "venue_id,rfc_message_id", ignoreDuplicates: true },
    )
    .select("id, thread_id")
    .maybeSingle();

  if (error) {
    console.error("[hr_email_messages] outbound insert failed:", error.message);
    return null;
  }

  if (data?.id && data.thread_id) {
    return { id: data.id, threadId: data.thread_id };
  }

  // Row already existed — fetch it.
  const { data: existing } = await params.supabase
    .from("hr_email_messages")
    .select("id, thread_id")
    .eq("venue_id", params.venueId)
    .eq("rfc_message_id", rfcMessageId)
    .maybeSingle();

  if (!existing?.id || !existing.thread_id) return null;
  return { id: existing.id, threadId: existing.thread_id };
}

export async function recordInboundStaffEmail(params: {
  supabase: SupabaseClient;
  venueId: string;
  staffId: string;
  threadId: string;
  rfcMessageId: string;
  inReplyTo?: string | null;
  referencesHeader?: string | null;
  subject: string;
  fromEmail?: string | null;
  toEmail: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  occurredAt?: string;
}): Promise<{ id: string } | null> {
  const rfcMessageId = normalizeRfcMessageId(params.rfcMessageId);
  if (!rfcMessageId) return null;

  const { data, error } = await params.supabase
    .from("hr_email_messages")
    .upsert(
      {
        venue_id: params.venueId,
        staff_id: params.staffId,
        thread_id: params.threadId,
        direction: "inbound",
        rfc_message_id: rfcMessageId,
        in_reply_to: normalizeRfcMessageId(params.inReplyTo) || null,
        references_header: String(params.referencesHeader ?? "").trim() || null,
        subject: String(params.subject ?? "").trim(),
        from_email: String(params.fromEmail ?? "").trim() || null,
        to_email: String(params.toEmail ?? "").trim(),
        body_text: params.bodyText ?? null,
        body_html: params.bodyHtml ?? null,
        source_kind: null,
        source_id: null,
        occurred_at: params.occurredAt ?? new Date().toISOString(),
      },
      { onConflict: "venue_id,rfc_message_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[hr_email_messages] inbound insert failed:", error.message);
    return null;
  }

  if (data?.id) return { id: data.id };

  const { data: existing } = await params.supabase
    .from("hr_email_messages")
    .select("id")
    .eq("venue_id", params.venueId)
    .eq("rfc_message_id", rfcMessageId)
    .maybeSingle();

  return existing?.id ? { id: existing.id } : null;
}
