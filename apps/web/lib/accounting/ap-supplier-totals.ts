import type { SupabaseClient } from "@supabase/supabase-js";
import { cosWeekRange } from "@/lib/sales/cos-overview-data";
import { cosFiscalYearForDate } from "@/lib/sales/cos-insights-data";

export type SupplierTotalsSupplier = {
  id: string;
  name: string;
  nickname: string | null;
  /** Default ledger account, e.g. "5110 — Food Purchases / COGS". */
  ledger: string | null;
};

export type SupplierTotalsData = {
  fiscalYear: number;
  /** Retail weeks that have started this year, oldest first. */
  weeks: { weekNo: number; start: string; end: string }[];
  suppliers: SupplierTotalsSupplier[];
  /** Net AED per supplier per week: totals[supplierId][weekNo]. */
  totals: Record<string, Record<number, number>>;
  /** Net AED for the year across every supplier (the % base). */
  grandTotal: number;
  /** The venue's saved column list; null until someone saves one. */
  selection: string[] | null;
};

/**
 * Weekly net purchases per supplier for one fiscal year, from posted AP
 * documents (credit notes count negative), plus the venue's saved columns.
 */
export async function getSupplierTotalsData(
  service: SupabaseClient,
  venueId: string,
  fiscalYear: number,
  today: string,
): Promise<SupplierTotalsData> {
  const weeks: SupplierTotalsData["weeks"] = [];
  for (let w = 1; w <= 52; w++) {
    const range = cosWeekRange(fiscalYear, w);
    if (range.start > today) break;
    weeks.push({ weekNo: w, ...range });
  }
  const from = cosWeekRange(fiscalYear, 1).start;
  const to = cosWeekRange(fiscalYear, 52).end;

  const docs: {
    supplier_id: string;
    invoice_date: string;
    subtotal_net: number;
    fx_rate: number;
  }[] = [];
  for (let page = 0; ; page += 1000) {
    const { data, error } = await service
      .from("ap_invoices")
      .select("supplier_id, invoice_date, subtotal_net, fx_rate")
      .eq("venue_id", venueId)
      .eq("status", "posted")
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .range(page, page + 999);
    if (error) throw new Error(error.message);
    docs.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const [{ data: supplierRows, error: supErr }, { data: setting }] =
    await Promise.all([
      service
        .from("suppliers")
        .select("id, name, nickname, accounts:default_expense_account_id ( code, name )")
        .eq("venue_id", venueId)
        .order("name"),
      service
        .from("ap_supplier_totals_settings")
        .select("supplier_ids")
        .eq("venue_id", venueId)
        .maybeSingle(),
    ]);
  if (supErr) throw new Error(supErr.message);

  const weekOf = (iso: string) => {
    const d = iso.slice(0, 10);
    return weeks.find((w) => d >= w.start && d <= w.end)?.weekNo ?? null;
  };

  const totals: SupplierTotalsData["totals"] = {};
  let grandTotal = 0;
  for (const doc of docs) {
    if (cosFiscalYearForDate(doc.invoice_date.slice(0, 10)) !== fiscalYear) continue;
    const weekNo = weekOf(doc.invoice_date);
    if (weekNo == null) continue;
    const net = (Number(doc.subtotal_net) || 0) * (Number(doc.fx_rate) || 1);
    const bySupplier = (totals[doc.supplier_id] ??= {});
    bySupplier[weekNo] = (bySupplier[weekNo] ?? 0) + net;
    grandTotal += net;
  }

  type Row = {
    id: string;
    name: string;
    nickname: string | null;
    accounts: { code: string; name: string } | { code: string; name: string }[] | null;
  };
  const suppliers = ((supplierRows ?? []) as Row[]).map((s) => {
    const acc = Array.isArray(s.accounts) ? s.accounts[0] : s.accounts;
    return {
      id: s.id,
      name: s.name,
      nickname: s.nickname,
      ledger: acc ? `${acc.code} — ${acc.name}` : null,
    };
  });

  return {
    fiscalYear,
    weeks,
    suppliers,
    totals,
    grandTotal,
    selection: (setting?.supplier_ids as string[] | undefined) ?? null,
  };
}
