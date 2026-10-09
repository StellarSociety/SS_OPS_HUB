import type { SupabaseClient } from "@supabase/supabase-js";
import { roundMoney } from "@/lib/accounting/money";
import { monthTickKeyFromSaleDate } from "@/lib/accounting/revenue-from-sales";

export const OVERDUE_BUCKET_LABELS = [
  "1–15 Days",
  "16–30 Days",
  "31–45 Days",
  "Above 45 Days",
] as const;

export type PayablesSummary = {
  total: number;
  current: number;
  overdue: number;
  /** Same order as OVERDUE_BUCKET_LABELS. */
  overdueBuckets: number[];
};

/** Posted AP figures in AED, keyed by cash-flow month tick (`2026-8` = Sep). */
export type CashFlowApData = {
  payables: PayablesSummary;
  /** Gross bills (incl. VAT) by invoice month. */
  billsGrossByMonth: Record<string, number>;
  /** Net expense (excl. VAT) by invoice month, then ledger account label. */
  expensesNetByMonth: Record<string, Record<string, number>>;
};

export const EMPTY_CASH_FLOW_AP: CashFlowApData = {
  payables: { total: 0, current: 0, overdue: 0, overdueBuckets: [0, 0, 0, 0] },
  billsGrossByMonth: {},
  expensesNetByMonth: {},
};

type DocRow = {
  invoice_date: string;
  due_date: string;
  total_gross: number;
  fx_rate: number;
};

type LineRow = {
  net_amount: number;
  accounts: { code: string; name: string } | { code: string; name: string }[] | null;
  ap_invoices: { invoice_date: string; fx_rate: number } | { invoice_date: string; fx_rate: number }[] | null;
};

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const to = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((to - from) / 86_400_000);
}

function overdueBucket(daysPastDue: number): number {
  if (daysPastDue <= 15) return 0;
  if (daysPastDue <= 30) return 1;
  if (daysPastDue <= 45) return 2;
  return 3;
}

async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; ; page += 1000) {
    const { data, error } = await query(page, page + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/**
 * Posted AP documents for the cash flow dashboard. There are no supplier
 * payments yet, so every posted bill is unpaid: payables are all posted
 * documents, split by due date. Credit notes carry negative amounts.
 */
export async function getCashFlowApData(
  service: SupabaseClient,
  venueId: string,
  today: string,
): Promise<CashFlowApData> {
  const [docs, lines] = await Promise.all([
    fetchAll<DocRow>((from, to) =>
      service
        .from("ap_invoices")
        .select("invoice_date, due_date, total_gross, fx_rate")
        .eq("venue_id", venueId)
        .eq("status", "posted")
        .order("id")
        .range(from, to),
    ),
    fetchAll<LineRow>((from, to) =>
      service
        .from("ap_invoice_lines")
        .select(
          "net_amount, accounts ( code, name ), ap_invoices!inner ( invoice_date, fx_rate )",
        )
        .eq("ap_invoices.venue_id", venueId)
        .eq("ap_invoices.status", "posted")
        .order("id")
        .range(from, to),
    ),
  ]);

  const payables: PayablesSummary = {
    total: 0,
    current: 0,
    overdue: 0,
    overdueBuckets: [0, 0, 0, 0],
  };
  const billsGrossByMonth: Record<string, number> = {};

  for (const doc of docs) {
    const gross = roundMoney(
      (Number(doc.total_gross) || 0) * (Number(doc.fx_rate) || 1),
      2,
    );
    const invoiceDate = doc.invoice_date.slice(0, 10);
    const key = monthTickKeyFromSaleDate(invoiceDate);
    billsGrossByMonth[key] = (billsGrossByMonth[key] ?? 0) + gross;

    payables.total += gross;
    const daysPastDue = daysBetween(doc.due_date.slice(0, 10), today);
    if (daysPastDue > 0) {
      payables.overdue += gross;
      payables.overdueBuckets[overdueBucket(daysPastDue)] += gross;
    } else {
      payables.current += gross;
    }
  }

  const expensesNetByMonth: Record<string, Record<string, number>> = {};
  for (const line of lines) {
    const inv = Array.isArray(line.ap_invoices) ? line.ap_invoices[0] : line.ap_invoices;
    if (!inv) continue;
    const acc = Array.isArray(line.accounts) ? line.accounts[0] : line.accounts;
    const label = acc ? `${acc.code} — ${acc.name}` : "Unassigned";
    const net = (Number(line.net_amount) || 0) * (Number(inv.fx_rate) || 1);
    const byAccount = (expensesNetByMonth[monthTickKeyFromSaleDate(inv.invoice_date.slice(0, 10))] ??= {});
    byAccount[label] = (byAccount[label] ?? 0) + net;
  }

  for (const key of Object.keys(billsGrossByMonth)) {
    billsGrossByMonth[key] = roundMoney(billsGrossByMonth[key], 2);
  }
  return {
    payables: {
      total: roundMoney(payables.total, 2),
      current: roundMoney(payables.current, 2),
      overdue: roundMoney(payables.overdue, 2),
      overdueBuckets: payables.overdueBuckets.map((v) => roundMoney(v, 2)),
    },
    billsGrossByMonth,
    expensesNetByMonth,
  };
}

/** Top ledger accounts by net expense across the given month keys. */
export function topExpenses(
  expensesNetByMonth: CashFlowApData["expensesNetByMonth"],
  monthKeys: string[],
  limit = 6,
): { label: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const key of monthKeys) {
    for (const [label, amount] of Object.entries(expensesNetByMonth[key] ?? {})) {
      totals.set(label, (totals.get(label) ?? 0) + amount);
    }
  }
  const sorted = [...totals.entries()]
    .map(([label, amount]) => ({ label, amount: roundMoney(amount, 2) }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (sorted.length <= limit) return sorted;
  const rest = sorted.slice(limit - 1).reduce((sum, row) => sum + row.amount, 0);
  return [...sorted.slice(0, limit - 1), { label: "Others", amount: roundMoney(rest, 2) }];
}
