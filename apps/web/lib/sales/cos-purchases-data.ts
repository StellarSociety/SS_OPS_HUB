import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Accounts-app purchases for GP & COS. Reads AP invoices with the service
 * client (scoped to the venue) so GP & COS users don't need Accounts access.
 */

/** Invoices that count as purchases; drafts and reversed/void ones don't. */
export const COUNTED_AP_STATUSES = ["approved", "posted"] as const;

export type LedgerAccountOption = {
  id: string;
  code: string;
  name: string;
  accountType: string;
};

export type CosLedgerPurchaseRow = {
  key: string;
  invoiceId: string;
  date: string;
  supplierName: string;
  supplierInvoiceNo: string;
  invoiceNo: string;
  status: string;
  gross: number;
  net: number;
  ledgerCode: string;
  ledgerName: string;
};

function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Postable, active ledger accounts for the settings multi-select. */
export async function listLedgerAccountOptions(): Promise<LedgerAccountOption[]> {
  const { data, error } = await createServiceClient()
    .from("accounts")
    .select("id, code, name, account_type")
    .eq("is_postable", true)
    .eq("active", true)
    .order("code");
  if (error) {
    console.error("[gp-cos] list ledger accounts:", error.message);
    return [];
  }
  return (data ?? []).map((a) => ({
    id: a.id as string,
    code: String(a.code),
    name: String(a.name),
    accountType: String(a.account_type),
  }));
}

/**
 * AP invoice lines on the given ledgers, invoice-dated within [from, to],
 * one row per invoice per ledger (lines on the same ledger are summed).
 */
export async function getCosLedgerPurchases(
  venueId: string,
  ledgerAccountIds: string[],
  from: string,
  to: string,
): Promise<CosLedgerPurchaseRow[]> {
  if (ledgerAccountIds.length === 0) return [];

  const { data, error } = await createServiceClient()
    .from("ap_invoice_lines")
    .select(
      "account_id, net_amount, gross_amount, account:accounts(code, name), invoice:ap_invoices!inner(id, invoice_no, supplier_invoice_no, invoice_date, status, venue_id, supplier:suppliers(name))",
    )
    .in("account_id", ledgerAccountIds)
    .eq("invoice.venue_id", venueId)
    .in("invoice.status", [...COUNTED_AP_STATUSES])
    .gte("invoice.invoice_date", from)
    .lte("invoice.invoice_date", to);

  if (error) {
    console.error("[gp-cos] ledger purchases:", error.message);
    throw error;
  }

  type Line = {
    account_id: string;
    net_amount: unknown;
    gross_amount: unknown;
    account: { code: string; name: string } | null;
    invoice: {
      id: string;
      invoice_no: string;
      supplier_invoice_no: string;
      invoice_date: string;
      status: string;
      supplier: { name: string } | null;
    } | null;
  };

  const byKey = new Map<string, CosLedgerPurchaseRow>();
  for (const line of (data ?? []) as unknown as Line[]) {
    const inv = line.invoice;
    if (!inv) continue;
    const key = `${inv.id}:${line.account_id}`;
    const row =
      byKey.get(key) ??
      ({
        key,
        invoiceId: inv.id,
        date: String(inv.invoice_date).slice(0, 10),
        supplierName: inv.supplier?.name ?? "—",
        supplierInvoiceNo: inv.supplier_invoice_no ?? "",
        invoiceNo: inv.invoice_no ?? "",
        status: inv.status,
        gross: 0,
        net: 0,
        ledgerCode: line.account?.code ?? "",
        ledgerName: line.account?.name ?? "",
      } satisfies CosLedgerPurchaseRow);
    row.gross += num(line.gross_amount);
    row.net += num(line.net_amount);
    byKey.set(key, row);
  }

  return [...byKey.values()].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.supplierName.localeCompare(b.supplierName),
  );
}

/** Net purchases total on the given ledgers for a period (cost run check). */
export async function getCosLedgerPurchasesNet(
  venueId: string,
  ledgerAccountIds: string[],
  from: string,
  to: string,
): Promise<number | null> {
  if (ledgerAccountIds.length === 0) return null;
  const rows = await getCosLedgerPurchases(venueId, ledgerAccountIds, from, to);
  return Math.round(rows.reduce((s, r) => s + r.net, 0) * 100) / 100;
}
