import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_WAITER_SALES_SETTINGS,
  type VenueWaiterSalesSettings,
  type WaiterSalesSettingsInput,
} from "./waiter-sales-settings-types";

export async function getVenueWaiterSalesSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueWaiterSalesSettings> {
  const { data, error } = await supabase
    .from("venue_waiter_sales_settings")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return data as VenueWaiterSalesSettings;
  }

  const { data: created, error: insertError } = await supabase
    .from("venue_waiter_sales_settings")
    .insert({
      venue_id: venueId,
      ...DEFAULT_WAITER_SALES_SETTINGS,
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created as VenueWaiterSalesSettings;
}

export async function upsertVenueWaiterSalesSettings(
  supabase: SupabaseClient,
  venueId: string,
  input: WaiterSalesSettingsInput,
): Promise<VenueWaiterSalesSettings> {
  const { data, error } = await supabase
    .from("venue_waiter_sales_settings")
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
  return data as VenueWaiterSalesSettings;
}
