import "server-only";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { decryptSecret } from "@/lib/email/secret";
import {
  normalizeRfcMessageId,
  recordInboundStaffEmail,
} from "@/lib/email/record-staff-email";
import {
  loadEmailTransportStore,
  pickDefaultEmailTransport,
} from "@/lib/email/transport";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

function extractCandidateMessageIds(params: {
  inReplyTo?: string | string[] | null;
  references?: string | string[] | null;
}): string[] {
  const ids: string[] = [];
  const push = (raw: string | null | undefined) => {
    const normalized = normalizeRfcMessageId(raw);
    if (normalized && !ids.includes(normalized)) ids.push(normalized);
  };

  if (Array.isArray(params.inReplyTo)) {
    for (const part of params.inReplyTo) push(part);
  } else if (typeof params.inReplyTo === "string") {
    for (const part of params.inReplyTo.split(/\s+/)) push(part);
  }

  const refs = params.references;
  if (Array.isArray(refs)) {
    for (const r of refs) push(r);
  } else if (typeof refs === "string") {
    for (const part of refs.split(/\s+/)) push(part);
  }

  return ids;
}

function addressListToString(
  value:
    | { text?: string; value?: Array<{ address?: string | null }> }
    | Array<{ text?: string; value?: Array<{ address?: string | null }> }>
    | string
    | undefined
    | null,
): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((entry) => addressListToString(entry))
      .filter(Boolean)
      .join(", ");
  }
  if (value.text?.trim()) return value.text.trim();
  const addrs = (value.value ?? [])
    .map((a) => String(a.address ?? "").trim())
    .filter(Boolean);
  return addrs.join(", ");
}

export type SyncInboundRepliesResult = {
  venuesProcessed: number;
  fetched: number;
  matched: number;
  inserted: number;
  skipped: number;
  errors: string[];
};

async function syncVenueInbox(params: {
  venueId: string;
}): Promise<{
  fetched: number;
  matched: number;
  inserted: number;
  skipped: number;
  error?: string;
}> {
  const service = createServiceClient();
  const store = await loadEmailTransportStore(service, params.venueId);
  const settings = pickDefaultEmailTransport(store);

  if (
    !settings ||
    settings.provider === "resend" ||
    !settings.imap.host.trim() ||
    !settings.passwordEncrypted
  ) {
    return { fetched: 0, matched: 0, inserted: 0, skipped: 0 };
  }

  let password: string;
  try {
    password = decryptSecret(settings.passwordEncrypted);
  } catch (err) {
    return {
      fetched: 0,
      matched: 0,
      inserted: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : "Failed to decrypt mailbox password",
    };
  }

  const { data: syncState } = await service
    .from("hr_email_sync_state")
    .select("last_uid")
    .eq("venue_id", params.venueId)
    .maybeSingle();

  const lastUid = Number(syncState?.last_uid ?? 0) || 0;
  const mailbox = settings.smtp.username.trim();

  const client = new ImapFlow({
    host: settings.imap.host.trim(),
    port: settings.imap.port || 993,
    secure: true,
    auth: {
      user: mailbox,
      pass: password,
    },
    logger: false,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });

  let fetched = 0;
  let matched = 0;
  let inserted = 0;
  let skipped = 0;
  let maxUid = lastUid;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const status = await client.status("INBOX", { uidNext: true });
      const uidNext = Number(status.uidNext || 1) || 1;
      // On first sync, do not scan the entire mailbox history — only recent mail.
      const startUid =
        lastUid > 0
          ? lastUid + 1
          : Math.max(1, uidNext - 150);
      if (startUid >= uidNext) {
        // Nothing new.
        await service.from("hr_email_sync_state").upsert(
          {
            venue_id: params.venueId,
            mailbox,
            last_uid: Math.max(lastUid, uidNext - 1),
            last_synced_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "venue_id" },
        );
        return { fetched: 0, matched: 0, inserted: 0, skipped: 0 };
      }

      const range = `${startUid}:*`;
      for await (const msg of client.fetch(range, {
        uid: true,
        source: true,
        envelope: true,
      })) {
        const uid = Number(msg.uid) || 0;
        if (uid <= lastUid) continue;
        if (uid > maxUid) maxUid = uid;
        fetched += 1;

        if (!msg.source) {
          skipped += 1;
          continue;
        }

        let parsed;
        try {
          parsed = await simpleParser(msg.source);
        } catch {
          skipped += 1;
          continue;
        }

        const rfcMessageId = normalizeRfcMessageId(
          Array.isArray(parsed.messageId)
            ? parsed.messageId[0]
            : parsed.messageId,
        );
        if (!rfcMessageId) {
          skipped += 1;
          continue;
        }

        const inReplyRaw = Array.isArray(parsed.inReplyTo)
          ? parsed.inReplyTo.join(" ")
          : parsed.inReplyTo;
        const candidateIds = extractCandidateMessageIds({
          inReplyTo: inReplyRaw,
          references: parsed.references,
        });
        if (candidateIds.length === 0) {
          skipped += 1;
          continue;
        }

        const { data: outboundMatches } = await service
          .from("hr_email_messages")
          .select("id, thread_id, staff_id, venue_id")
          .eq("venue_id", params.venueId)
          .eq("direction", "outbound")
          .in("rfc_message_id", candidateIds)
          .limit(1);

        const outbound = outboundMatches?.[0];
        if (!outbound?.thread_id || !outbound.staff_id) {
          skipped += 1;
          continue;
        }

        matched += 1;

        const bodyHtml =
          typeof parsed.html === "string" ? parsed.html : null;
        const bodyText =
          typeof parsed.text === "string" ? parsed.text : null;
        const occurredAt =
          parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime())
            ? parsed.date.toISOString()
            : new Date().toISOString();

        const recorded = await recordInboundStaffEmail({
          supabase: service,
          venueId: params.venueId,
          staffId: String(outbound.staff_id),
          threadId: String(outbound.thread_id),
          rfcMessageId,
          inReplyTo: inReplyRaw ?? null,
          referencesHeader: Array.isArray(parsed.references)
            ? parsed.references.join(" ")
            : (parsed.references ?? null),
          subject: String(parsed.subject ?? "").trim(),
          fromEmail: addressListToString(parsed.from),
          toEmail: addressListToString(parsed.to),
          bodyHtml,
          bodyText,
          occurredAt,
        });

        if (recorded) inserted += 1;
        else skipped += 1;
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "IMAP sync failed";
    // On failure, still advance the cursor past what we successfully scanned
    // so we do not re-scan the whole mailbox — but never past maxUid.
    await service.from("hr_email_sync_state").upsert(
      {
        venue_id: params.venueId,
        mailbox,
        last_uid: maxUid > lastUid ? maxUid : lastUid,
        last_synced_at: new Date().toISOString(),
        last_error: message,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id" },
    );
    return { fetched, matched, inserted, skipped, error: message };
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }

  await service.from("hr_email_sync_state").upsert(
    {
      venue_id: params.venueId,
      mailbox,
      last_uid: maxUid,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id" },
  );

  return { fetched, matched, inserted, skipped };
}

/**
 * Poll venue people mailboxes for replies to staff emails and attach them
 * to existing hr_email_messages threads.
 */
export async function syncInboundStaffEmailReplies(options?: {
  venueId?: string | null;
  limit?: number;
}): Promise<SyncInboundRepliesResult> {
  const service = createServiceClient();
  const errors: string[] = [];
  let venuesProcessed = 0;
  let fetched = 0;
  let matched = 0;
  let inserted = 0;
  let skipped = 0;

  let venueIds: string[] = [];
  if (options?.venueId) {
    venueIds = [options.venueId];
  } else {
    const { data, error } = await service
      .from("hr_venue_settings")
      .select("venue_id")
      .eq("key", HR_SETTINGS_KEYS.emailTransport)
      .limit(options?.limit ?? 50);
    if (error) {
      return {
        venuesProcessed: 0,
        fetched: 0,
        matched: 0,
        inserted: 0,
        skipped: 0,
        errors: [error.message],
      };
    }
    venueIds = [...new Set((data ?? []).map((r) => String(r.venue_id)))];
  }

  for (const venueId of venueIds) {
    venuesProcessed += 1;
    const result = await syncVenueInbox({ venueId });
    fetched += result.fetched;
    matched += result.matched;
    inserted += result.inserted;
    skipped += result.skipped;
    if (result.error) {
      errors.push(`${venueId}: ${result.error}`);
    }
  }

  return {
    venuesProcessed,
    fetched,
    matched,
    inserted,
    skipped,
    errors,
  };
}
