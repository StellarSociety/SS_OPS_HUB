import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  VenueDailySnapDiscountLine,
  VenueDailySnapEvent,
  VenueDailySnapNotes,
  VenueMonthlyForecast,
} from "./daily-snap-types";

function isMissingTableError(
  error: { code?: string; message?: string },
  tableName: string,
): boolean {
  if (error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return (
    message.includes("PGRST205") ||
    message.includes("Could not find the table") ||
    message.includes(tableName)
  );
}

export async function listVenueMonthlyForecasts(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueMonthlyForecast[]> {
  const { data, error } = await supabase
    .from("venue_monthly_forecasts")
    .select("*")
    .eq("venue_id", venueId)
    .order("month_key", { ascending: false });

  if (error) {
    if (isMissingTableError(error, "venue_monthly_forecasts")) return [];
    throw error;
  }
  return (data ?? []).map((row) => normalizeVenueMonthlyForecast(row));
}

function normalizeVenueMonthlyForecast(
  row: Record<string, unknown>,
): VenueMonthlyForecast {
  return {
    id: String(row.id),
    venue_id: String(row.venue_id),
    month_key: String(row.month_key),
    forecast_revenue_gs: Number(row.forecast_revenue_gs ?? 0),
    forecast_covers: Number(row.forecast_covers ?? 0),
    forecast_venue_asph: Number(row.forecast_venue_asph ?? 0),
    forecast_food_asph: Number(row.forecast_food_asph ?? 0),
    forecast_beverages_asph: Number(row.forecast_beverages_asph ?? 0),
    forecast_wine_asph: Number(row.forecast_wine_asph ?? 0),
    forecast_shisha_asph: Number(row.forecast_shisha_asph ?? 0),
    forecast_other_asph: Number(row.forecast_other_asph ?? 0),
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function upsertVenueMonthlyForecast(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    month_key: string;
    forecast_revenue_gs: number;
    forecast_covers?: number;
    forecast_venue_asph?: number;
    forecast_food_asph?: number;
    forecast_beverages_asph?: number;
    forecast_wine_asph?: number;
    forecast_shisha_asph?: number;
    forecast_other_asph?: number;
  },
): Promise<VenueMonthlyForecast> {
  const row = {
    venue_id: venueId,
    month_key: payload.month_key,
    forecast_revenue_gs: payload.forecast_revenue_gs,
    forecast_covers: payload.forecast_covers ?? 0,
    forecast_venue_asph: payload.forecast_venue_asph ?? 0,
    forecast_food_asph: payload.forecast_food_asph ?? 0,
    forecast_beverages_asph: payload.forecast_beverages_asph ?? 0,
    forecast_wine_asph: payload.forecast_wine_asph ?? 0,
    forecast_shisha_asph: payload.forecast_shisha_asph ?? 0,
    forecast_other_asph: payload.forecast_other_asph ?? 0,
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_monthly_forecasts")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return normalizeVenueMonthlyForecast(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("venue_monthly_forecasts")
    .upsert({ ...row, created_by: userId }, { onConflict: "venue_id,month_key" })
    .select("*")
    .single();

  if (error) throw error;
  return normalizeVenueMonthlyForecast(data as Record<string, unknown>);
}

export async function deleteVenueMonthlyForecast(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_monthly_forecasts")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}

export async function getVenueDailySnapNotes(
  supabase: SupabaseClient,
  venueId: string,
  saleDate: string,
): Promise<VenueDailySnapNotes | null> {
  const { data, error } = await supabase
    .from("venue_daily_snap_notes")
    .select("*")
    .eq("venue_id", venueId)
    .eq("sale_date", saleDate)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error, "venue_daily_snap_notes")) return null;
    throw error;
  }
  return (data as VenueDailySnapNotes | null) ?? null;
}

export async function listVenueDailySnapDiscountLines(
  supabase: SupabaseClient,
  venueId: string,
  saleDate?: string,
): Promise<VenueDailySnapDiscountLine[]> {
  let query = supabase
    .from("venue_daily_snap_discount_lines")
    .select("*")
    .eq("venue_id", venueId)
    .order("sale_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (saleDate) {
    query = query.eq("sale_date", saleDate);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error, "venue_daily_snap_discount_lines")) return [];
    throw error;
  }
  return (data ?? []) as VenueDailySnapDiscountLine[];
}

export async function listVenueDailySnapEvents(
  supabase: SupabaseClient,
  venueId: string,
  saleDate?: string,
): Promise<VenueDailySnapEvent[]> {
  let query = supabase
    .from("venue_daily_snap_events")
    .select("*")
    .eq("venue_id", venueId)
    .order("sale_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (saleDate) {
    query = query.eq("sale_date", saleDate);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error, "venue_daily_snap_events")) return [];
    throw error;
  }
  return (data ?? []) as VenueDailySnapEvent[];
}

export async function upsertVenueDailySnapNotes(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    sale_date: string;
    eighty_six_lunch: string;
    eighty_six_dinner: string;
    service_comments_lunch: string;
    service_comments_dinner: string;
    cash_drawer_opening_gs: number;
    cash_drawer_closing_gs: number;
  },
): Promise<VenueDailySnapNotes> {
  const row = {
    venue_id: venueId,
    sale_date: payload.sale_date,
    eighty_six_lunch: payload.eighty_six_lunch,
    eighty_six_dinner: payload.eighty_six_dinner,
    service_comments_lunch: payload.service_comments_lunch,
    service_comments_dinner: payload.service_comments_dinner,
    cash_drawer_opening_gs: payload.cash_drawer_opening_gs,
    cash_drawer_closing_gs: payload.cash_drawer_closing_gs,
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_daily_snap_notes")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return data as VenueDailySnapNotes;
  }

  const { data, error } = await supabase
    .from("venue_daily_snap_notes")
    .upsert({ ...row, created_by: userId }, { onConflict: "venue_id,sale_date" })
    .select("*")
    .single();

  if (error) throw error;
  return data as VenueDailySnapNotes;
}

export async function upsertVenueDailySnapDiscountLine(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    sale_date: string;
    table_number: string;
    time_of_day: string;
    guest_name: string;
    reason: string;
    amount_gs: number;
    sort_order: number;
  },
): Promise<VenueDailySnapDiscountLine> {
  const row = {
    venue_id: venueId,
    sale_date: payload.sale_date,
    table_number: payload.table_number.trim(),
    time_of_day: payload.time_of_day.trim(),
    guest_name: payload.guest_name.trim(),
    reason: payload.reason.trim(),
    amount_gs: payload.amount_gs,
    sort_order: payload.sort_order,
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_daily_snap_discount_lines")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return data as VenueDailySnapDiscountLine;
  }

  const { data, error } = await supabase
    .from("venue_daily_snap_discount_lines")
    .insert({ ...row, created_by: userId })
    .select("*")
    .single();

  if (error) throw error;
  return data as VenueDailySnapDiscountLine;
}

export async function deleteVenueDailySnapDiscountLine(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_daily_snap_discount_lines")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}

export async function upsertVenueDailySnapEvent(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    sale_date: string;
    event_name: string;
    guest_count: number;
    package_name: string;
    total_pay_gs: number;
    service_comments: string;
    sort_order: number;
  },
): Promise<VenueDailySnapEvent> {
  const row = {
    venue_id: venueId,
    sale_date: payload.sale_date,
    event_name: payload.event_name.trim(),
    guest_count: payload.guest_count,
    package_name: payload.package_name.trim(),
    total_pay_gs: payload.total_pay_gs,
    service_comments: payload.service_comments.trim(),
    sort_order: payload.sort_order,
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_daily_snap_events")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return data as VenueDailySnapEvent;
  }

  const { data, error } = await supabase
    .from("venue_daily_snap_events")
    .insert({ ...row, created_by: userId })
    .select("*")
    .single();

  if (error) throw error;
  return data as VenueDailySnapEvent;
}

export async function deleteVenueDailySnapEvent(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_daily_snap_events")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}
