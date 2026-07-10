import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationRow } from "./types";

export async function listNotificationsForUser(
  supabase: SupabaseClient,
  userId: string,
  options: {
    venueId: string;
    isGlobalVenue: boolean;
    limit?: number;
  },
): Promise<NotificationRow[]> {
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (!options.isGlobalVenue) {
    query = query.eq("venue_id", options.venueId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function countUnreadNotifications(
  supabase: SupabaseClient,
  userId: string,
  options: { venueId: string; isGlobalVenue: boolean },
): Promise<number> {
  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (!options.isGlobalVenue) {
    query = query.eq("venue_id", options.venueId);
  }

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
  options: { venueId: string; isGlobalVenue: boolean },
) {
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (!options.isGlobalVenue) {
    query = query.eq("venue_id", options.venueId);
  }

  const { error } = await query;
  if (error) throw error;
}
