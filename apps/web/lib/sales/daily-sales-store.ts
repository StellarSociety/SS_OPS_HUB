import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_TAX_SETTINGS,
  type TaxSettingsInput,
  type VenueDailySalesRecord,
  type VenueSalesTaxSettings,
} from "./daily-sales-types";

export async function listVenueDailySales(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueDailySalesRecord[]> {
  const { data, error } = await supabase
    .from("venue_daily_sales")
    .select("*")
    .eq("venue_id", venueId)
    .order("sale_date", { ascending: true });

  if (error) throw error;
  return (data ?? []) as VenueDailySalesRecord[];
}

export async function getVenueSalesTaxSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueSalesTaxSettings> {
  const { data, error } = await supabase
    .from("venue_sales_tax_settings")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return data as VenueSalesTaxSettings;
  }

  const { data: created, error: insertError } = await supabase
    .from("venue_sales_tax_settings")
    .insert({ venue_id: venueId, ...DEFAULT_TAX_SETTINGS })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created as VenueSalesTaxSettings;
}

export async function upsertVenueSalesTaxSettings(
  supabase: SupabaseClient,
  venueId: string,
  input: TaxSettingsInput,
): Promise<VenueSalesTaxSettings> {
  const { data, error } = await supabase
    .from("venue_sales_tax_settings")
    .upsert(
      {
        venue_id: venueId,
        ...input,
      },
      { onConflict: "venue_id" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as VenueSalesTaxSettings;
}

export async function upsertVenueDailySales(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    sale_date: string;
    lunch_food_gs: number;
    lunch_beverages_gs: number;
    lunch_wine_gs: number;
    lunch_shisha_gs: number;
    lunch_tobacco_gs: number;
    lunch_others_gs: number;
    lunch_service_fees_gs: number;
    lunch_covers: number;
    lunch_bookings: number;
    lunch_walkin_tables: number;
    lunch_walkin_covers: number;
    dinner_food_gs: number;
    dinner_beverages_gs: number;
    dinner_wine_gs: number;
    dinner_shisha_gs: number;
    dinner_tobacco_gs: number;
    dinner_others_gs: number;
    dinner_service_fees_gs: number;
    dinner_covers: number;
    dinner_bookings: number;
    dinner_walkin_tables: number;
    dinner_walkin_covers: number;
    all_day_discount_gs: number;
    vat_collected_gs: number;
    municipality_fee_collected_gs: number;
    service_charge_collected_gs: number;
  },
): Promise<VenueDailySalesRecord> {
  const row = {
    venue_id: venueId,
    ...payload,
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_daily_sales")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return data as VenueDailySalesRecord;
  }

  const { data, error } = await supabase
    .from("venue_daily_sales")
    .insert({ ...row, created_by: userId })
    .select("*")
    .single();

  if (error) throw error;
  return data as VenueDailySalesRecord;
}

export async function deleteVenueDailySales(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_daily_sales")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}
