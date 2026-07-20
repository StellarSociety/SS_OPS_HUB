import type { SupabaseClient } from "@supabase/supabase-js";
import type { VenueWaiterDailySalesEntry } from "./waiter-sales-types";

type TenderLineRow = {
  tender_id: string;
  amount_gs: number;
};

export async function listVenueWaiterDailySales(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueWaiterDailySalesEntry[]> {
  const { data: salesRows, error } = await supabase
    .from("venue_waiter_daily_sales")
    .select("*")
    .eq("venue_id", venueId)
    .order("sale_date", { ascending: true });

  if (error) throw error;
  if (!salesRows?.length) return [];

  const salesIds = salesRows.map((row) => row.id);
  const { data: lineRows, error: linesError } = await supabase
    .from("venue_waiter_daily_tender_lines")
    .select("sales_id, tender_id, amount_gs")
    .in("sales_id", salesIds);

  if (linesError) throw linesError;

  const linesBySales = new Map<string, Record<string, number>>();
  for (const line of (lineRows ?? []) as (TenderLineRow & { sales_id: string })[]) {
    const current = linesBySales.get(line.sales_id) ?? {};
    current[line.tender_id] = Number(line.amount_gs);
    linesBySales.set(line.sales_id, current);
  }

  return salesRows.map((row) => ({
    ...(row as VenueWaiterDailySalesEntry),
    tender_amounts: linesBySales.get(row.id) ?? {},
  }));
}

export async function upsertVenueWaiterDailySales(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    waiter_id: string;
    sale_date: string;
    total_sales_gs: number;
    total_payments_gs: number;
    gratuity_cc_gs: number;
    gratuity_cash_gs: number;
    groups_service_charge_gs: number;
    total_covers: number;
    total_discounts_gs: number;
    voucher_comments: string;
    deposit_comments: string;
    on_accounts_comments: string;
    tender_amounts: Record<string, number>;
  },
): Promise<VenueWaiterDailySalesEntry> {
  const salesRow = {
    venue_id: venueId,
    waiter_id: payload.waiter_id,
    sale_date: payload.sale_date,
    total_sales_gs: payload.total_sales_gs,
    total_payments_gs: payload.total_payments_gs,
    gratuity_cc_gs: payload.gratuity_cc_gs,
    gratuity_cash_gs: payload.gratuity_cash_gs,
    groups_service_charge_gs: payload.groups_service_charge_gs,
    total_covers: payload.total_covers,
    total_discounts_gs: payload.total_discounts_gs,
    voucher_comments: payload.voucher_comments,
    deposit_comments: payload.deposit_comments,
    on_accounts_comments: payload.on_accounts_comments,
    updated_by: userId,
  };

  let salesId = payload.id;

  if (salesId) {
    const { data, error } = await supabase
      .from("venue_waiter_daily_sales")
      .update(salesRow)
      .eq("id", salesId)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    salesId = data.id;
  } else {
    const { data, error } = await supabase
      .from("venue_waiter_daily_sales")
      .insert({ ...salesRow, created_by: userId })
      .select("*")
      .single();

    if (error) throw error;
    salesId = data.id;
  }

  const { error: deleteError } = await supabase
    .from("venue_waiter_daily_tender_lines")
    .delete()
    .eq("sales_id", salesId);

  if (deleteError) throw deleteError;

  const lineInserts = Object.entries(payload.tender_amounts)
    .filter(([, amount]) => amount > 0)
    .map(([tender_id, amount_gs]) => ({
      sales_id: salesId!,
      tender_id,
      amount_gs,
    }));

  if (lineInserts.length > 0) {
    const { error: insertError } = await supabase
      .from("venue_waiter_daily_tender_lines")
      .insert(lineInserts);

    if (insertError) throw insertError;
  }

  const { data: saved, error: fetchError } = await supabase
    .from("venue_waiter_daily_sales")
    .select("*")
    .eq("id", salesId)
    .single();

  if (fetchError) throw fetchError;

  return {
    ...(saved as VenueWaiterDailySalesEntry),
    tender_amounts: payload.tender_amounts,
  };
}

export async function deleteVenueWaiterDailySales(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_waiter_daily_sales")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}
