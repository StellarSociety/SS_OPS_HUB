import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { notificationClickPath } from "@/lib/notifications/href";
import type { NotificationRow } from "@/lib/notifications/types";
import { envAppUrl, joinAppUrl } from "@/lib/public-app-url";
import {
  deletePushSubscriptionByEndpointAdmin,
  listPushSubscriptionsForUsers,
} from "./store";
import type { PushSubscriptionRow, WebPushPayload } from "./types";
import { isWebPushConfigured, webPushPrivateKey, webPushPublicKey, webPushSubject } from "./vapid";

type VenueLookup = {
  slug: string;
  is_global: boolean;
};

let vapidReady = false;

function ensureVapid(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      webPushSubject(),
      webPushPublicKey(),
      webPushPrivateKey(),
    );
    vapidReady = true;
  }
  return true;
}

function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

async function sendToSubscription(
  subscription: PushSubscriptionRow,
  payload: WebPushPayload,
): Promise<"ok" | "gone" | "fail"> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      {
        TTL: 60 * 60 * 24,
        urgency: payload.severity === "critical" ? "high" : "normal",
      },
    );
    return "ok";
  } catch (error) {
    const statusCode =
      typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : undefined;
    if (isGoneStatus(statusCode)) return "gone";
    console.warn("[push] send failed:", error);
    return "fail";
  }
}

async function loadVenuesById(
  service: SupabaseClient,
  venueIds: string[],
): Promise<Map<string, VenueLookup>> {
  const map = new Map<string, VenueLookup>();
  if (venueIds.length === 0) return map;
  const { data, error } = await service
    .from("venues")
    .select("id, slug, is_global")
    .in("id", venueIds);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.id, { slug: row.slug, is_global: Boolean(row.is_global) });
  }
  return map;
}

function payloadForNotification(
  notification: NotificationRow,
  subscription: PushSubscriptionRow,
  venues: Map<string, VenueLookup>,
): WebPushPayload {
  const venue = notification.venue_id
    ? venues.get(notification.venue_id)
    : undefined;
  const path = notificationClickPath({
    module_key: notification.module_key,
    entity: notification.entity,
    entity_id: notification.entity_id,
    venueSlug: venue?.slug ?? null,
    isGlobalVenue: venue?.is_global ?? false,
    platform: subscription.platform,
  });
  return {
    title: notification.title,
    body: notification.body ?? "",
    url: joinAppUrl(path, envAppUrl()),
    tag: notification.id,
    notificationId: notification.id,
    severity: notification.severity,
  };
}

export async function sendPendingPushNotifications(
  service: SupabaseClient,
): Promise<{ sent: number; skipped: number }> {
  if (!ensureVapid()) return { sent: 0, skipped: 0 };

  const { data: pending, error } = await service
    .from("notifications")
    .select("*")
    .is("push_sent_at", null)
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) throw error;
  if (!pending?.length) return { sent: 0, skipped: 0 };

  return sendPushForNotificationRows(service, pending as NotificationRow[]);
}

export async function sendPushForNotificationRows(
  service: SupabaseClient,
  rows: NotificationRow[],
): Promise<{ sent: number; skipped: number }> {
  if (!ensureVapid() || rows.length === 0) return { sent: 0, skipped: 0 };

  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const venueIds = [
    ...new Set(
      rows
        .map((row) => row.venue_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [subscriptions, venues] = await Promise.all([
    listPushSubscriptionsForUsers(service, userIds),
    loadVenuesById(service, venueIds),
  ]);

  const byUser = new Map<string, PushSubscriptionRow[]>();
  for (const sub of subscriptions) {
    const list = byUser.get(sub.user_id) ?? [];
    list.push(sub);
    byUser.set(sub.user_id, list);
  }

  let sent = 0;
  let skipped = 0;
  const deliveredIds: string[] = [];

  for (const row of rows) {
    const targets = byUser.get(row.user_id) ?? [];
    if (targets.length === 0) {
      skipped += 1;
      continue;
    }

    let delivered = false;
    const remaining: PushSubscriptionRow[] = [];
    for (const sub of targets) {
      const result = await sendToSubscription(
        sub,
        payloadForNotification(row, sub, venues),
      );
      if (result === "gone") {
        await deletePushSubscriptionByEndpointAdmin(service, sub.endpoint);
        continue;
      }
      remaining.push(sub);
      if (result === "ok") delivered = true;
    }
    byUser.set(row.user_id, remaining);
    if (delivered) {
      deliveredIds.push(row.id);
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  if (deliveredIds.length > 0) {
    const { error } = await service
      .from("notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .in("id", deliveredIds)
      .is("push_sent_at", null);
    if (error) throw error;
  }

  return { sent, skipped };
}

export async function sendPushToUser(params: {
  service: SupabaseClient;
  userId: string;
  payload: WebPushPayload;
}): Promise<{ sent: number }> {
  if (!ensureVapid()) return { sent: 0 };
  const subscriptions = await listPushSubscriptionsForUsers(params.service, [
    params.userId,
  ]);
  let sent = 0;
  for (const sub of subscriptions) {
    const result = await sendToSubscription(sub, {
      ...params.payload,
      url: /^https?:\/\//i.test(params.payload.url)
        ? params.payload.url
        : joinAppUrl(params.payload.url, envAppUrl()),
    });
    if (result === "gone") {
      await deletePushSubscriptionByEndpointAdmin(params.service, sub.endpoint);
      continue;
    }
    if (result === "ok") sent += 1;
  }
  return { sent };
}

/** Best-effort: never throw into the calling action / cron. */
export async function dispatchPendingPushes(
  service: SupabaseClient,
): Promise<void> {
  try {
    await sendPendingPushNotifications(service);
  } catch (error) {
    console.error("[push] dispatch failed:", error);
  }
}
