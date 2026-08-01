import "server-only";

import { writeAuditLog } from "@/lib/audit";
import { sendAppEmail } from "@/lib/email/transport";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import { HR_MODULE_KEY, parseBoardingEmailAction, parseBoardingTemplateToEmails } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

const SELECT =
  "id, venue_id, staff_id, process_id, action, status, to_email, from_email, subject, message, template_id, template_name, provider, recorded_at, sent_at, scheduled_at";

type DueRow = {
  id: string;
  venue_id: string;
  staff_id: string;
  process_id: string | null;
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

/**
 * Claim and send boarding notice emails whose scheduled_at is due.
 * Concurrent-safe via provider claim (scheduled → sending).
 */
export async function processDueScheduledBoardingEmails(options?: {
  limit?: number;
}): Promise<{
  claimed: number;
  sent: number;
  failed: number;
  errors: string[];
}> {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
  const service = createServiceClient();
  const nowIso = new Date().toISOString();
  const errors: string[] = [];
  let claimed = 0;
  let sent = 0;
  let failed = 0;

  const { data: dueRows, error: listError } = await service
    .from("hr_boarding_emails")
    .select(SELECT)
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (listError) {
    return {
      claimed: 0,
      sent: 0,
      failed: 0,
      errors: [listError.message],
    };
  }

  for (const raw of dueRows ?? []) {
    const row = raw as DueRow;

    const claimAt = new Date().toISOString();
    const { data: claimedRow, error: claimError } = await service
      .from("hr_boarding_emails")
      .update({
        provider: "sending",
        updated_at: claimAt,
      })
      .eq("id", row.id)
      .eq("status", "scheduled")
      .eq("provider", "scheduled")
      .select("id")
      .maybeSingle();

    if (claimError || !claimedRow) continue;
    claimed += 1;

    try {
      const action = parseBoardingEmailAction(row.action);

      const { data: venue } = await service
        .from("venues")
        .select("id, name, slug, logo_url, icon_url, favicon_url")
        .eq("id", row.venue_id)
        .maybeSingle();

      const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
        body: row.message,
        venue: (venue as {
          id: string;
          name: string | null;
          slug: string;
          logo_url?: string | null;
          icon_url?: string | null;
          favicon_url?: string | null;
        } | null) ?? { id: row.venue_id, name: null, slug: "" },
      });

      const toList = parseBoardingTemplateToEmails(row.to_email);
      if (toList.length === 0) {
        failed += 1;
        continue;
      }

      const result = await sendAppEmail(
        {
          to: toList.length === 1 ? toList[0]! : toList,
          subject: row.subject,
          html,
          attachments: inlineAttachments,
          fromOverride: row.from_email || undefined,
        },
        { venueId: row.venue_id, supabase: service },
      );

      const sentAt = new Date().toISOString();
      const { error: persistError } = await service
        .from("hr_boarding_emails")
        .update({
          status: "sent",
          provider: result.provider,
          recorded_at: sentAt,
          sent_at: sentAt,
          scheduled_at: null,
          updated_at: sentAt,
        })
        .eq("id", row.id)
        .eq("status", "scheduled");

      if (persistError) {
        failed += 1;
        errors.push(
          `${row.id}: sent but persist failed — ${persistError.message}`,
        );
        continue;
      }

      await writeAuditLog({
        actor_id: null,
        action: "create",
        module_key: HR_MODULE_KEY,
        entity: "boarding_notice_email",
        entity_id: row.id,
        venue_id: row.venue_id,
        after: {
          action,
          to: row.to_email,
          subject: row.subject,
          provider: result.provider,
          status: "sent",
          scheduledSend: true,
        },
      });

      sent += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Send failed";
      errors.push(`${row.id}: ${message}`);
      await service
        .from("hr_boarding_emails")
        .update({
          provider: "scheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "scheduled")
        .eq("provider", "sending");
    }
  }

  return { claimed, sent, failed, errors };
}
