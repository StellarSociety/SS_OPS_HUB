import type { SupabaseClient } from "@supabase/supabase-js";

export type PresenceStatus = "online" | "recent" | "offline";

/** The app heartbeats every minute, so 3 minutes covers a missed ping. */
export const PRESENCE_ONLINE_MS = 3 * 60 * 1000;
/** Seen within the last hour → "recently active". */
export const PRESENCE_RECENT_MS = 60 * 60 * 1000;

export const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  recent: "Active recently",
  offline: "Offline",
};

/** Presence for the given users from their online-session heartbeats. */
export async function loadPresence(
  service: SupabaseClient,
  userIds: string[],
  now: number = Date.now(),
): Promise<Record<string, PresenceStatus>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const result: Record<string, PresenceStatus> = {};
  for (const id of ids) result[id] = "offline";
  if (ids.length === 0) return result;

  const since = new Date(now - PRESENCE_RECENT_MS).toISOString();
  const { data, error } = await service
    .from("user_online_sessions")
    .select("user_id, last_seen_at, ended_at")
    .in("user_id", ids)
    .gte("last_seen_at", since);
  if (error) {
    console.error("[connect] loadPresence:", error.message);
    return result;
  }

  for (const row of (data ?? []) as {
    user_id: string;
    last_seen_at: string;
    ended_at: string | null;
  }[]) {
    const age = now - new Date(row.last_seen_at).getTime();
    const status: PresenceStatus =
      !row.ended_at && age <= PRESENCE_ONLINE_MS ? "online" : "recent";
    if (result[row.user_id] !== "online") result[row.user_id] = status;
  }
  return result;
}
