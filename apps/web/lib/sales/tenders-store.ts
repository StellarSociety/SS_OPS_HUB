import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  VenueTender,
  VenueTenderStatus,
} from "./tenders-types";

export type { VenueTender, VenueTenderStatus };

export async function listVenueTenders(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueTender[]> {
  const { data, error } = await supabase
    .from("venue_tenders")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as VenueTender[];
}

export async function listActiveVenueTenders(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueTender[]> {
  const { data, error } = await supabase
    .from("venue_tenders")
    .select("*")
    .eq("venue_id", venueId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as VenueTender[];
}

export async function upsertVenueTender(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    name: string;
    status: VenueTenderStatus;
    sort_order?: number;
  },
): Promise<VenueTender> {
  const row = {
    venue_id: venueId,
    name: payload.name.trim(),
    status: payload.status,
    sort_order: payload.sort_order ?? 0,
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_tenders")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return data as VenueTender;
  }

  const { data, error } = await supabase
    .from("venue_tenders")
    .insert({ ...row, created_by: userId })
    .select("*")
    .single();

  if (error) throw error;
  return data as VenueTender;
}

export async function deleteVenueTender(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_tenders")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}

export async function reorderVenueTenders(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  orderedIds: string[],
): Promise<void> {
  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from("venue_tenders")
      .update({ sort_order: index, updated_by: userId })
      .eq("id", orderedIds[index])
      .eq("venue_id", venueId);

    if (error) throw error;
  }
}
