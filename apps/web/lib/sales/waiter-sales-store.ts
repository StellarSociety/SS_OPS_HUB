import type { SupabaseClient } from "@supabase/supabase-js";
import type { VenueWaiterDailySalesEntry } from "./waiter-sales-types";

type TenderLineRow = {
  sales_id: string;
  tender_id: string;
  amount_gs: number;
};

/** Minimal waiter-sales fields for gratuity reports (no tender lines). */
export type VenueWaiterGratuityRow = {
  sale_date: string;
  waiter_id: string;
  waiter_name: string;
  gratuity_cash_gs: number;
  gratuity_cc_gs: number;
};

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 150;

function isoDateOnly(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value ?? "");
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match?.[1] ?? raw.slice(0, 10);
}

function asMoney(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function asCount(value: unknown): number {
  const n = Number.parseInt(String(value ?? 0), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function mapWaiterSalesRow(
  row: Record<string, unknown>,
  tender_amounts: Record<string, number>,
): VenueWaiterDailySalesEntry {
  return {
    id: String(row.id),
    venue_id: String(row.venue_id),
    waiter_id: String(row.waiter_id),
    sale_date: isoDateOnly(row.sale_date),
    total_sales_gs: asMoney(row.total_sales_gs),
    total_payments_gs: asMoney(row.total_payments_gs),
    gratuity_cc_gs: asMoney(row.gratuity_cc_gs),
    gratuity_cash_gs: asMoney(row.gratuity_cash_gs),
    groups_service_charge_gs: asMoney(row.groups_service_charge_gs),
    total_covers: asCount(row.total_covers),
    total_discounts_gs: asMoney(row.total_discounts_gs),
    voucher_comments: String(row.voucher_comments ?? ""),
    deposit_comments: String(row.deposit_comments ?? ""),
    on_accounts_comments: String(row.on_accounts_comments ?? ""),
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    tender_amounts,
  };
}

async function fetchAllPaged<T>(
  runPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await runPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function listVenueWaiterDailySales(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueWaiterDailySalesEntry[]> {
  const salesRows = await fetchAllPaged((from, to) =>
    supabase
      .from("venue_waiter_daily_sales")
      .select("*")
      .eq("venue_id", venueId)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  if (!salesRows.length) return [];

  const salesIds = salesRows.map((row) => String(row.id));
  const lineRows: TenderLineRow[] = [];

  for (let i = 0; i < salesIds.length; i += IN_CHUNK_SIZE) {
    const chunk = salesIds.slice(i, i + IN_CHUNK_SIZE);
    const page = await fetchAllPaged<TenderLineRow>((from, to) =>
      supabase
        .from("venue_waiter_daily_tender_lines")
        .select("sales_id, tender_id, amount_gs")
        .in("sales_id", chunk)
        .order("sales_id", { ascending: true })
        .order("tender_id", { ascending: true })
        .range(from, to),
    );
    lineRows.push(...page);
  }

  const linesBySales = new Map<string, Record<string, number>>();
  for (const line of lineRows) {
    const current = linesBySales.get(line.sales_id) ?? {};
    current[line.tender_id] = asMoney(line.amount_gs);
    linesBySales.set(line.sales_id, current);
  }

  return salesRows.map((row) =>
    mapWaiterSalesRow(
      row as Record<string, unknown>,
      linesBySales.get(String(row.id)) ?? {},
    ),
  );
}

/**
 * Fast path for gratuity reports: only the columns needed, no tender-line
 * round trip. Prefer this over {@link listVenueWaiterDailySales} on report pages.
 */
export async function listVenueWaiterGratuityRows(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueWaiterGratuityRow[]> {
  const data = await fetchAllPaged((from, to) =>
    supabase
      .from("venue_waiter_daily_sales")
      .select(
        "id, sale_date, waiter_id, gratuity_cash_gs, gratuity_cc_gs, venue_waiters ( name )",
      )
      .eq("venue_id", venueId)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return data.map((row) => {
    const waiterJoin = row.venue_waiters as
      | { name: string }
      | { name: string }[]
      | null;
    const waiterName = Array.isArray(waiterJoin)
      ? (waiterJoin[0]?.name ?? "Unknown")
      : (waiterJoin?.name ?? "Unknown");

    return {
      sale_date: isoDateOnly(row.sale_date),
      waiter_id: String(row.waiter_id),
      waiter_name: waiterName,
      gratuity_cash_gs: asMoney(row.gratuity_cash_gs),
      gratuity_cc_gs: asMoney(row.gratuity_cc_gs),
    };
  });
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
      .upsert(
        { ...salesRow, created_by: userId },
        { onConflict: "venue_id,waiter_id,sale_date" },
      )
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

  return mapWaiterSalesRow(saved as Record<string, unknown>, {
    ...payload.tender_amounts,
  });
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
