import type { SupabaseClient } from "@supabase/supabase-js";
import { buildExpiryNotificationDrafts, computeExpiryItems } from "./expiry";
import { emailPendingNotificationsForRecipient } from "./email";
import { getNotificationRules } from "./registry";
import type { ExpiryNotificationDraft, NotificationRecipient } from "./types";
import { buildDedupeKey } from "./types";

type SyncResult = {
  venuesProcessed: number;
  notificationsUpserted: number;
  emailsSent: number;
};

async function listNonGlobalVenues(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, slug")
    .eq("is_global", false)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

function draftToRow(
  draft: ExpiryNotificationDraft,
  recipient: NotificationRecipient,
) {
  const dedupeKey = buildDedupeKey({
    userId: recipient.userId,
    moduleKey: draft.moduleKey,
    entity: draft.entity,
    entityId: draft.entityId,
    field: draft.field,
    dueDate: draft.dueDate,
    leadDays: draft.leadDays,
  });

  return {
    user_id: recipient.userId,
    venue_id: draft.venueId,
    module_key: draft.moduleKey,
    type: draft.type,
    title: draft.title,
    body: draft.body,
    entity: draft.entity,
    entity_id: draft.entityId,
    severity: draft.severity,
    due_date: draft.dueDate,
    lead_days: draft.leadDays,
    dedupe_key: dedupeKey,
  };
}

export async function syncNotifications(
  service: SupabaseClient,
): Promise<SyncResult> {
  const venues = await listNonGlobalVenues(service);
  const rules = getNotificationRules();
  let notificationsUpserted = 0;

  for (const venue of venues) {
    for (const rule of rules) {
      const items = await rule.fetchItems(service, venue.id);
      const maxLead = Math.max(...rule.leadDays);
      const expiryItems = computeExpiryItems(items, rule.expiryFields, {
        getVenueId: rule.getVenueId,
        getDisplayName: rule.getDisplayName,
        getSecondaryLabel: rule.getSecondaryLabel,
        maxLeadDays: maxLead,
      });

      const drafts = buildExpiryNotificationDrafts(rule, expiryItems);
      if (drafts.length === 0) continue;

      const recipients = await rule.resolveRecipients(service, venue.id);
      if (recipients.length === 0) continue;

      const rows = recipients.flatMap((recipient) =>
        drafts.map((draft) => draftToRow(draft, recipient)),
      );

      const { error } = await service.from("notifications").upsert(rows, {
        onConflict: "dedupe_key",
        ignoreDuplicates: true,
      });

      if (error) throw error;
      notificationsUpserted += rows.length;
    }
  }

  const emailsSent = await sendPendingEmails(service);

  return {
    venuesProcessed: venues.length,
    notificationsUpserted,
    emailsSent,
  };
}

async function sendPendingEmails(service: SupabaseClient): Promise<number> {
  const { data: pending, error } = await service
    .from("notifications")
    .select("*")
    .is("email_sent_at", null)
    .order("due_date", { ascending: true })
    .limit(500);

  if (error) throw error;
  if (!pending?.length) return 0;

  const byUser = new Map<string, typeof pending>();
  for (const row of pending) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  let emailsSent = 0;

  for (const [userId, rows] of byUser) {
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id, email, full_name, status")
      .eq("id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) continue;

    const recipient: NotificationRecipient = {
      userId: profile.id,
      email: profile.email,
      fullName: profile.full_name,
    };

    const count = await emailPendingNotificationsForRecipient(
      service,
      recipient,
      rows,
    );
    emailsSent += count;
  }

  return emailsSent;
}
