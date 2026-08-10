import type { ApInvoice, TaxCode } from "./ap-types";
import { roundMoney, sumMoney } from "./money";

export type ApInsightLine = {
  ap_invoice_id: string;
  account_id: string;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
  tax_code_id: string;
  accounts?: { code: string; name: string } | null;
};

export type ApInsights = {
  totalPurchases: number;
  priorPurchases: number;
  momTrendPct: number | null;
  spendBySupplier: { name: string; amount: number }[];
  spendByAccount: { code: string; name: string; amount: number }[];
  recoverableVat: number;
  blockedVat: number;
  aging: {
    current: number;
    d1_30: number;
    d31_60: number;
    d61_90: number;
    d90_plus: number;
  };
  statusFunnel: Record<string, number>;
  avgApprovalHours: number | null;
  anomalyFlags: { id: string; invoice_no: string; reason: string }[];
};

function monthShift(isoFrom: string, months: number): { from: string; to: string } {
  const d = new Date(`${isoFrom}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  const from = d.toISOString().slice(0, 10);
  const end = new Date(d);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { from, to: end.toISOString().slice(0, 10) };
}

function daysPastDue(dueDate: string, asOf: string): number {
  const due = new Date(`${dueDate}T00:00:00`);
  const asOfDate = new Date(`${asOf}T00:00:00`);
  return Math.floor((asOfDate.getTime() - due.getTime()) / 86_400_000);
}

export function computeApInsights(params: {
  invoices: ApInvoice[];
  lines: ApInsightLine[];
  taxCodes: TaxCode[];
  periodFrom: string;
  periodTo: string;
  asOf?: string;
}): ApInsights {
  const asOf = params.asOf ?? params.periodTo;
  const taxById = new Map(params.taxCodes.map((t) => [t.id, t]));

  const inPeriod = (inv: ApInvoice) =>
    inv.invoice_date >= params.periodFrom && inv.invoice_date <= params.periodTo;

  const postedInPeriod = params.invoices.filter(
    (i) => i.status === "posted" && inPeriod(i),
  );

  const prior = monthShift(params.periodFrom, -1);
  const postedPrior = params.invoices.filter(
    (i) =>
      i.status === "posted" &&
      i.invoice_date >= prior.from &&
      i.invoice_date <= prior.to,
  );

  const totalPurchases = sumMoney(postedInPeriod.map((i) => i.total_gross));
  const priorPurchases = sumMoney(postedPrior.map((i) => i.total_gross));
  const momTrendPct =
    priorPurchases === 0
      ? totalPurchases > 0
        ? 100
        : null
      : roundMoney(((totalPurchases - priorPurchases) / priorPurchases) * 100, 1);

  const bySupplier = new Map<string, number>();
  for (const inv of postedInPeriod) {
    const name = inv.suppliers?.name ?? "Unknown";
    bySupplier.set(name, roundMoney((bySupplier.get(name) ?? 0) + inv.total_gross));
  }
  const spendBySupplier = [...bySupplier.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const periodInvoiceIds = new Set(postedInPeriod.map((i) => i.id));
  const byAccount = new Map<string, { code: string; name: string; amount: number }>();
  let recoverableVat = 0;
  let blockedVat = 0;

  for (const line of params.lines) {
    if (!periodInvoiceIds.has(line.ap_invoice_id)) continue;
    const key = line.account_id;
    const code = line.accounts?.code ?? "?";
    const name = line.accounts?.name ?? "Account";
    const prev = byAccount.get(key);
    byAccount.set(key, {
      code,
      name,
      amount: roundMoney((prev?.amount ?? 0) + line.net_amount),
    });

    const tax = taxById.get(line.tax_code_id);
    if (!tax) continue;
    if (tax.code.toUpperCase() === "BL") {
      blockedVat = roundMoney(blockedVat + line.tax_amount);
    } else if (tax.input_recoverable) {
      recoverableVat = roundMoney(recoverableVat + line.tax_amount);
    }
  }

  const spendByAccount = [...byAccount.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  for (const inv of params.invoices.filter((i) => i.status === "posted")) {
    const days = daysPastDue(inv.due_date, asOf);
    const amt = inv.total_gross;
    if (days <= 0) aging.current = roundMoney(aging.current + amt);
    else if (days <= 30) aging.d1_30 = roundMoney(aging.d1_30 + amt);
    else if (days <= 60) aging.d31_60 = roundMoney(aging.d31_60 + amt);
    else if (days <= 90) aging.d61_90 = roundMoney(aging.d61_90 + amt);
    else aging.d90_plus = roundMoney(aging.d90_plus + amt);
  }

  const statusFunnel: Record<string, number> = {
    draft: 0,
    submitted: 0,
    approved: 0,
    posted: 0,
    reversed: 0,
    void: 0,
  };
  for (const inv of params.invoices) {
    statusFunnel[inv.status] = (statusFunnel[inv.status] ?? 0) + 1;
  }

  const approvalHours: number[] = [];
  for (const inv of params.invoices) {
    if (inv.submitted_at && inv.approved_at) {
      const h =
        (new Date(inv.approved_at).getTime() -
          new Date(inv.submitted_at).getTime()) /
        3_600_000;
      if (h >= 0) approvalHours.push(h);
    }
  }
  const avgApprovalHours =
    approvalHours.length === 0
      ? null
      : roundMoney(
          approvalHours.reduce((a, b) => a + b, 0) / approvalHours.length,
          1,
        );

  // Near-duplicate: same supplier + amount + date within ±1 day
  const anomalyFlags: ApInsights["anomalyFlags"] = [];
  const posted = params.invoices.filter((i) =>
    ["posted", "submitted", "approved", "draft"].includes(i.status),
  );
  for (let i = 0; i < posted.length; i++) {
    for (let j = i + 1; j < posted.length; j++) {
      const a = posted[i]!;
      const b = posted[j]!;
      if (a.supplier_id !== b.supplier_id) continue;
      if (!moneyClose(a.total_gross, b.total_gross)) continue;
      const dayDiff = Math.abs(
        (new Date(`${a.invoice_date}T00:00:00`).getTime() -
          new Date(`${b.invoice_date}T00:00:00`).getTime()) /
          86_400_000,
      );
      if (dayDiff > 1) continue;
      anomalyFlags.push({
        id: a.id,
        invoice_no: a.invoice_no,
        reason: `Near-match with ${b.invoice_no} (same supplier/amount/date)`,
      });
    }
  }

  return {
    totalPurchases,
    priorPurchases,
    momTrendPct,
    spendBySupplier,
    spendByAccount,
    recoverableVat,
    blockedVat,
    aging,
    statusFunnel,
    avgApprovalHours,
    anomalyFlags: anomalyFlags.slice(0, 20),
  };
}

function moneyClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}
