import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationFolder } from "./folder";
import type { NotificationRow } from "./types";

type VenueScope = {
  venueId: string;
  isGlobalVenue: boolean;
};

function applyVenueScope<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  options: VenueScope,
): T {
  if (options.isGlobalVenue) return query;
  return query.eq("venue_id", options.venueId);
}

function applyFolder<
  T extends {
    is: (column: string, value: null) => T;
    not: (column: string, operator: string, value: null) => T;
    in: (column: string, values: string[]) => T;
  },
>(query: T, folder: NotificationFolder): T {
  if (folder === "archive") {
    return query.not("archived_at", "is", null);
  }
  let next = query.is("archived_at", null);
  if (folder === "alerts") {
    next = next.in("severity", ["warning", "critical"]);
  }
  return next;
}

export async function listNotificationsForUser(
  supabase: SupabaseClient,
  userId: string,
  options: VenueScope & {
    limit?: number;
    folder?: NotificationFolder;
  },
): Promise<NotificationRow[]> {
  const folder = options.folder ?? "inbox";
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId);
  query = applyFolder(query, folder);
  query = applyVenueScope(query, options);
  query = query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function countUnreadNotifications(
  supabase: SupabaseClient,
  userId: string,
  options: VenueScope,
): Promise<number> {
  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
    .is("archived_at", null);
  query = applyVenueScope(query, options);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function countNotifications(
  supabase: SupabaseClient,
  userId: string,
  options: VenueScope & { folder?: NotificationFolder },
): Promise<number> {
  const folder = options.folder ?? "inbox";
  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  query = applyFolder(query, folder);
  query = applyVenueScope(query, options);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(
  supabase: SupabaseClient,
  userId: string,
  notificationId: string,
) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
}

export async function markAllNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
  options: VenueScope,
) {
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null)
    .is("archived_at", null);
  query = applyVenueScope(query, options);

  const { error } = await query;
  if (error) throw error;
}

export async function archiveNotification(
  supabase: SupabaseClient,
  userId: string,
  notificationId: string,
) {
  const { error } = await supabase
    .from("notifications")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .is("archived_at", null);

  if (error) throw error;
}

export async function archiveAllNotifications(
  supabase: SupabaseClient,
  userId: string,
  options: VenueScope,
) {
  let query = supabase
    .from("notifications")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("archived_at", null);
  query = applyVenueScope(query, options);

  const { error } = await query;
  if (error) throw error;
}

export async function unarchiveNotification(
  supabase: SupabaseClient,
  userId: string,
  notificationId: string,
) {
  const { error } = await supabase
    .from("notifications")
    .update({ archived_at: null })
    .eq("id", notificationId)
    .eq("user_id", userId)
    .not("archived_at", "is", null);

  if (error) throw error;
}

export async function deleteNotification(
  supabase: SupabaseClient,
  userId: string,
  notificationId: string,
) {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function deleteAllNotifications(
  supabase: SupabaseClient,
  userId: string,
  options: VenueScope,
) {
  let query = supabase
    .from("notifications")
    .delete()
    .eq("user_id", userId)
    .not("archived_at", "is", null);
  query = applyVenueScope(query, options);

  const { error } = await query;
  if (error) throw error;
}
