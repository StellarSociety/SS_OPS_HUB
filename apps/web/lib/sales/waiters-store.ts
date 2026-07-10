import type { SupabaseClient } from "@supabase/supabase-js";
import type { VenueWaiter, VenueWaiterStatus } from "./waiters-types";

export async function listVenueWaiters(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueWaiter[]> {
  const { data, error } = await supabase
    .from("venue_waiters")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as VenueWaiter[];
}

export async function listActiveVenueWaiters(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueWaiter[]> {
  const { data, error } = await supabase
    .from("venue_waiters")
    .select("*")
    .eq("venue_id", venueId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as VenueWaiter[];
}

async function nextWaiterSortOrder(
  supabase: SupabaseClient,
  venueId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("venue_waiters")
    .select("sort_order")
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data?.sort_order ?? -1) + 1;
}

export async function upsertVenueWaiter(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    name: string;
    position: string;
    status: VenueWaiterStatus;
  },
): Promise<VenueWaiter> {
  const row = {
    venue_id: venueId,
    name: payload.name.trim(),
    position: payload.position.trim(),
    status: payload.status,
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_waiters")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return data as VenueWaiter;
  }

  const sortOrder = await nextWaiterSortOrder(supabase, venueId);
  const { data, error } = await supabase
    .from("venue_waiters")
    .insert({ ...row, sort_order: sortOrder, created_by: userId })
    .select("*")
    .single();

  if (error) throw error;
  return data as VenueWaiter;
}

export async function reorderVenueWaiters(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  orderedIds: string[],
): Promise<void> {
  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from("venue_waiters")
      .update({ sort_order: index, updated_by: userId })
      .eq("id", orderedIds[index])
      .eq("venue_id", venueId);

    if (error) throw error;
  }
}

export async function deleteVenueWaiter(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_waiters")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}
