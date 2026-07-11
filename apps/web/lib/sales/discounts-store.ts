import type { SupabaseClient } from "@supabase/supabase-js";
import type { VenueDailyDiscountsRecord } from "./discounts-types";

export async function listVenueDailyDiscounts(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueDailyDiscountsRecord[]> {
  const { data, error } = await supabase
    .from("venue_daily_discounts")
    .select("*")
    .eq("venue_id", venueId)
    .order("sale_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as VenueDailyDiscountsRecord[];
}

export async function upsertVenueDailyDiscounts(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    sale_date: string;
    food_discount_gs: number;
    beverages_discount_gs: number;
    wine_discount_gs: number;
    shisha_discount_gs: number;
    others_discount_gs: number;
  },
): Promise<VenueDailyDiscountsRecord> {
  const row = {
    venue_id: venueId,
    ...payload,
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_daily_discounts")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return data as VenueDailyDiscountsRecord;
  }

  const { data, error } = await supabase
    .from("venue_daily_discounts")
    .insert({ ...row, created_by: userId })
    .select("*")
    .single();

  if (error) throw error;
  return data as VenueDailyDiscountsRecord;
}

export async function deleteVenueDailyDiscounts(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_daily_discounts")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}
