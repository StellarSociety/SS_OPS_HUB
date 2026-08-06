import type { SupabaseClient } from "@supabase/supabase-js";
import type { VenueCashJournalRecord } from "./cash-journal-types";

function mapCashJournalRow(row: VenueCashJournalRecord): VenueCashJournalRecord {
  return {
    ...row,
    open_till_gs:
      row.open_till_gs == null ? null : Number(row.open_till_gs ?? 0),
    cash_withdraw_gs: Number(row.cash_withdraw_gs ?? 0),
    cash_expenses_gs: Number(row.cash_expenses_gs ?? 0),
    cash_deposit_gs: Number(row.cash_deposit_gs ?? 0),
    closing_till_gs:
      row.closing_till_gs == null ? null : Number(row.closing_till_gs ?? 0),
    comments: String(row.comments ?? ""),
  };
}

export async function listVenueCashJournal(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueCashJournalRecord[]> {
  const { data, error } = await supabase
    .from("venue_cash_journal")
    .select("*")
    .eq("venue_id", venueId)
    .order("sale_date", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as VenueCashJournalRecord[]).map(mapCashJournalRow);
}

export async function upsertVenueCashJournal(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    sale_date: string;
    /** Null keeps Daily Snap as the source of truth for this till amount. */
    open_till_gs: number | null;
    cash_withdraw_gs: number;
    cash_expenses_gs: number;
    cash_deposit_gs: number;
    /** Null keeps Daily Snap as the source of truth for this till amount. */
    closing_till_gs: number | null;
    comments: string;
  },
): Promise<VenueCashJournalRecord> {
  const row = {
    venue_id: venueId,
    sale_date: payload.sale_date,
    open_till_gs: payload.open_till_gs,
    cash_withdraw_gs: payload.cash_withdraw_gs,
    cash_expenses_gs: payload.cash_expenses_gs,
    cash_deposit_gs: payload.cash_deposit_gs,
    closing_till_gs: payload.closing_till_gs,
    comments: payload.comments,
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_cash_journal")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return mapCashJournalRow(data as VenueCashJournalRecord);
  }

  const { data, error } = await supabase
    .from("venue_cash_journal")
    .upsert({ ...row, created_by: userId }, { onConflict: "venue_id,sale_date" })
    .select("*")
    .single();

  if (error) throw error;
  return mapCashJournalRow(data as VenueCashJournalRecord);
}

export async function deleteVenueCashJournal(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_cash_journal")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}
