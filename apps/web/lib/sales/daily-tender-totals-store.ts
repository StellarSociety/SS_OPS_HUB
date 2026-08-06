import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCashTenderName,
  type CashSalesRecord,
} from "@/lib/sales/cash-sales-report";

export type VenueDailyTenderTotal = {
  id: string;
  venue_id: string;
  sale_date: string;
  tender_id: string;
  amount_gs: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function listVenueDailyTenderTotals(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueDailyTenderTotal[]> {
  const { data, error } = await supabase
    .from("venue_daily_tender_totals")
    .select("*")
    .eq("venue_id", venueId)
    .order("sale_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as VenueDailyTenderTotal),
    amount_gs: Number((row as VenueDailyTenderTotal).amount_gs),
  }));
}

/**
 * Fast path for cash sales reports: only Cash tender daily totals.
 */
export async function listVenueCashSalesRows(
  supabase: SupabaseClient,
  venueId: string,
): Promise<CashSalesRecord[]> {
  const { data: tenders, error: tendersError } = await supabase
    .from("venue_tenders")
    .select("id, name")
    .eq("venue_id", venueId);

  if (tendersError) throw tendersError;

  const cashTenderIds = (tenders ?? [])
    .filter((tender) => isCashTenderName(String(tender.name ?? "")))
    .map((tender) => tender.id as string);

  if (cashTenderIds.length === 0) return [];

  const { data, error } = await supabase
    .from("venue_daily_tender_totals")
    .select("sale_date, amount_gs")
    .eq("venue_id", venueId)
    .in("tender_id", cashTenderIds)
    .order("sale_date", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    sale_date: row.sale_date as string,
    amount_gs: Number(row.amount_gs ?? 0),
  }));
}

export async function upsertVenueDailyTenderTotals(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  saleDate: string,
  amountsByTender: Record<string, number>,
): Promise<VenueDailyTenderTotal[]> {
  const { error: deleteError } = await supabase
    .from("venue_daily_tender_totals")
    .delete()
    .eq("venue_id", venueId)
    .eq("sale_date", saleDate);

  if (deleteError) throw deleteError;

  const inserts = Object.entries(amountsByTender)
    .filter(([, amount]) => amount > 0)
    .map(([tender_id, amount_gs]) => ({
      venue_id: venueId,
      sale_date: saleDate,
      tender_id,
      amount_gs,
      created_by: userId,
      updated_by: userId,
    }));

  if (inserts.length === 0) return [];

  const { data, error } = await supabase
    .from("venue_daily_tender_totals")
    .insert(inserts)
    .select("*");

  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as VenueDailyTenderTotal),
    amount_gs: Number((row as VenueDailyTenderTotal).amount_gs),
  }));
}
