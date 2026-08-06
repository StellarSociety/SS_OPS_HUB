import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  VenueCashExpenseLineInput,
  VenueCashExpenseLineRecord,
} from "./cash-expenses-types";

function mapCashExpenseLineRow(
  row: VenueCashExpenseLineRecord,
): VenueCashExpenseLineRecord {
  return {
    ...row,
    gross_gs: Number(row.gross_gs ?? 0),
    vat_gs: Number(row.vat_gs ?? 0),
    net_gs: Number(row.net_gs ?? 0),
    pchase_portal: Boolean(row.pchase_portal),
    sort_order: Number(row.sort_order ?? 0),
    description: String(row.description ?? ""),
  };
}

export async function listVenueCashExpenseLines(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueCashExpenseLineRecord[]> {
  const { data, error } = await supabase
    .from("venue_cash_expense_lines")
    .select("*")
    .eq("venue_id", venueId)
    .order("sale_date", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as VenueCashExpenseLineRecord[]).map(mapCashExpenseLineRow);
}

/**
 * Replace all justification lines for a venue + sale date.
 * Empty `lines` clears the day.
 */
export async function replaceVenueCashExpenseLinesForDate(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  saleDate: string,
  lines: VenueCashExpenseLineInput[],
): Promise<VenueCashExpenseLineRecord[]> {
  const { error: deleteError } = await supabase
    .from("venue_cash_expense_lines")
    .delete()
    .eq("venue_id", venueId)
    .eq("sale_date", saleDate);

  if (deleteError) throw deleteError;

  if (lines.length === 0) return [];

  const rows = lines.map((line, index) => ({
    venue_id: venueId,
    sale_date: saleDate,
    description: line.description.trim(),
    gross_gs: Number(line.gross_gs) || 0,
    vat_gs: Number(line.vat_gs) || 0,
    net_gs: Number(line.net_gs) || 0,
    pchase_portal: Boolean(line.pchase_portal),
    sort_order: line.sort_order ?? index,
    created_by: userId,
    updated_by: userId,
  }));

  const { data, error } = await supabase
    .from("venue_cash_expense_lines")
    .insert(rows)
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as VenueCashExpenseLineRecord[]).map(mapCashExpenseLineRow);
}
