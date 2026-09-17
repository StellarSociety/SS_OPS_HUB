"use server";

import { envAppUrl, joinAppUrl } from "@/lib/public-app-url";
import { sendPushToUser } from "@/lib/push/send";
import {
  countPushSubscriptionsForUser,
  deletePushSubscriptionByEndpoint,
  isPushPlatform,
  upsertPushSubscription,
} from "@/lib/push/store";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  platform: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const endpoint = input.endpoint.trim();
  const p256dh = input.p256dh.trim();
  const auth = input.auth.trim();
  if (!endpoint || !p256dh || !auth) {
    return { error: "Invalid push subscription." };
  }
  if (!isPushPlatform(input.platform)) {
    return { error: "Invalid push platform." };
  }
  if (endpoint.length > 2048 || p256dh.length > 512 || auth.length > 512) {
    return { error: "Invalid push subscription." };
  }

  const saved = await upsertPushSubscription(supabase, user.id, {
    endpoint,
    p256dh,
    auth,
    userAgent: input.userAgent?.slice(0, 500) ?? null,
    platform: input.platform,
  });
  if (saved.error) return { error: saved.error };
  return { ok: true as const };
}

export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const trimmed = endpoint.trim();
  if (!trimmed) return { error: "Missing subscription." };
  const removed = await deletePushSubscriptionByEndpoint(
    supabase,
    user.id,
    trimmed,
  );
  if (removed.error) return { error: removed.error };
  return { ok: true as const };
}

export async function getPushSubscriptionStatus() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false, deviceCount: 0 };
  const deviceCount = await countPushSubscriptionsForUser(supabase, user.id);
  return { signedIn: true, deviceCount };
}

export async function sendTestDeviceNotification() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (!count) {
    return { error: "Enable device notifications on this device first." };
  }

  const service = createServiceClient();
  const { sent } = await sendPushToUser({
    service,
    userId: user.id,
    payload: {
      title: "SS Ops Hub",
      body: "Device notifications are on. You will get alerts even when the app is closed.",
      url: joinAppUrl("/m/", envAppUrl()),
      tag: "ss-ops-push-test",
    },
  });
  if (sent === 0) {
    return { error: "Could not reach this device. Try enabling notifications again." };
  }
  return { ok: true as const, sent };
}
