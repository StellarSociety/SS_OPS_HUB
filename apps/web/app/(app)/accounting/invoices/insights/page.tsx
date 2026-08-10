import { ApDenied } from "@/components/accounting/invoices-sub-nav";
import { ApInsightsClient } from "@/components/accounting/ap-insights-client";
import { listApInvoices, listTaxCodes } from "@/lib/accounting/ap-store";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { canAccessAp } from "@/lib/accounting/permissions";
import { computeApInsights } from "@/lib/accounting/ap-insights";

export default async function ApInsightsPage() {
  const { supabase, venue, permissions } = await getAccountingPageContext();

  if (!canAccessAp(permissions, venue.id)) {
    return <ApDenied />;
  }

  const now = new Date();
  const periodFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const periodTo = now.toISOString().slice(0, 10);

  const [invoices, taxCodes] = await Promise.all([
    listApInvoices(supabase, { venueId: venue.id }),
    listTaxCodes(supabase),
  ]);

  // Load lines for posted invoices in period for category / VAT split
  const postedIds = invoices
    .filter((i) => i.status === "posted")
    .map((i) => i.id);

  let lines: Array<{
    ap_invoice_id: string;
    account_id: string;
    net_amount: number;
    tax_amount: number;
    gross_amount: number;
    tax_code_id: string;
    accounts?: { code: string; name: string } | null;
  }> = [];

  if (postedIds.length > 0) {
    const { data } = await supabase
      .from("ap_invoice_lines")
      .select("ap_invoice_id, account_id, net_amount, tax_amount, gross_amount, tax_code_id, accounts(code, name)")
      .in("ap_invoice_id", postedIds);
    lines = (data ?? []).map((l) => ({
      ...l,
      net_amount: Number(l.net_amount),
      tax_amount: Number(l.tax_amount),
      gross_amount: Number(l.gross_amount),
      accounts: Array.isArray(l.accounts) ? l.accounts[0] ?? null : l.accounts,
    }));
  }

  const insights = computeApInsights({
    invoices,
    lines,
    taxCodes,
    periodFrom,
    periodTo,
  });

  return (
    <ApInsightsClient
      initial={insights}
      periodFrom={periodFrom}
      periodTo={periodTo}
      invoices={invoices}
      lines={lines}
      taxCodes={taxCodes}
    />
  );
}
