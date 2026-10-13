
import type { SupabaseClient } from "@supabase/supabase-js";

/** Which Connecteam events create an alert (bell row + phone / desktop push). */
export const CONNECT_ALERT_OPTIONS = [
  { key: "chatDirect", label: "Direct messages", hint: "1:1 chats." },
  { key: "chatGroup", label: "Group chat messages", hint: "Every new message in your group chats." },
  { key: "mentions", label: "@Mentions", hint: "When someone mentions you in a chat or the feed." },
  { key: "feedPosts", label: "New feed posts", hint: "Posts in feed groups you belong to." },
  { key: "feedComments", label: "Comments", hint: "Comments on your posts and threads you joined." },
  { key: "feedReactions", label: "Reactions", hint: "Likes and reactions to your posts." },
] as const;

export type ConnectAlertKey = (typeof CONNECT_ALERT_OPTIONS)[number]["key"];
export type ConnectAlertPrefs = Record<ConnectAlertKey, boolean>;

export const DEFAULT_ALERT_PREFS: ConnectAlertPrefs = {
  chatDirect: true,
  chatGroup: true,
  mentions: true,
  feedPosts: true,
  feedComments: true,
  feedReactions: true,
};

function normalize(raw: unknown): ConnectAlertPrefs {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_ALERT_PREFS };
  for (const key of Object.keys(out) as ConnectAlertKey[]) {
    if (typeof value[key] === "boolean") out[key] = value[key] as boolean;
  }
  return out;
}

export async function loadAlertPrefs(
  service: SupabaseClient,
  userIds: string[],
): Promise<Map<string, ConnectAlertPrefs>> {
  const map = new Map<string, ConnectAlertPrefs>();
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return map;
  const { data, error } = await service
    .from("connect_notification_prefs")
    .select("user_id, prefs")
    .in("user_id", ids);
  // Table not there yet (or any read error): fall back to everything on.
  if (error) return map;
  for (const row of data ?? []) map.set(row.user_id as string, normalize(row.prefs));
  return map;
}

export async function getAlertPrefs(
  service: SupabaseClient,
  userId: string,
): Promise<ConnectAlertPrefs> {
  return (await loadAlertPrefs(service, [userId])).get(userId) ?? DEFAULT_ALERT_PREFS;
}

/** Keeps only the people whose preferences allow this kind of alert. */
export async function filterByAlertPref<T>(
  service: SupabaseClient,
  items: T[],
  userIdOf: (item: T) => string,
  keyOf: (item: T) => ConnectAlertKey,
): Promise<T[]> {
  if (items.length === 0) return items;
  const prefs = await loadAlertPrefs(service, items.map(userIdOf));
  return items.filter((item) => {
    const p = prefs.get(userIdOf(item));
    return p ? p[keyOf(item)] : true;
  });
}

export function normalizeAlertPrefs(raw: unknown): ConnectAlertPrefs {
  return normalize(raw);
}
