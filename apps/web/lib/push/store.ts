import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushPlatform, PushSubscriptionInput, PushSubscriptionRow } from "./types";

export async function upsertPushSubscription(
  supabase: SupabaseClient,
  userId: string,
  input: PushSubscriptionInput,
): Promise<{ error?: string }> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
      platform: input.platform,
      last_seen_at: now,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { error: error.message };
  return {};
}

export async function deletePushSubscriptionByEndpoint(
  supabase: SupabaseClient,
  userId: string,
  endpoint: string,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);
  if (error) return { error: error.message };
  return {};
}

export async function deletePushSubscriptionByEndpointAdmin(
  service: SupabaseClient,
  endpoint: string,
): Promise<void> {
  const { error } = await service
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) {
    console.warn("[push] failed to drop stale subscription:", error.message);
  }
}

export async function listPushSubscriptionsForUsers(
  service: SupabaseClient,
  userIds: string[],
): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await service
    .from("push_subscriptions")
    .select("*")
    .in("user_id", userIds);
  if (error) throw error;
  return (data ?? []) as PushSubscriptionRow[];
}

export async function countPushSubscriptionsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

export function isPushPlatform(value: string): value is PushPlatform {
  return value === "ios" || value === "android" || value === "desktop";
}
