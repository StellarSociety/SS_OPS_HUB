import { moneyEquals, roundMoney, sumMoney } from "./money";
import {
  computePurchaseLineTax,
  resolveTaxRate,
  type TaxCodeRow,
  type TaxRateRow,
} from "./tax";

export type JournalLineInput = {
  accountId: string;
  debit?: number;
  credit?: number;
  taxCodeId?: string | null;
  description?: string;
  dimensions?: Record<string, string>;
};

export type ApInvoiceLineForPosting = {
  description: string;
  accountId: string;
  netAmount: number;
  taxCodeId: string;
  dimensions?: Record<string, string>;
};

export type ApPostingAccounts = {
  inputVatAccountId: string;
  outputVatAccountId: string;
  apControlAccountId: string;
};

export type BuiltJournalLine = {
  accountId: string;
  debit: number;
  credit: number;
  taxCodeId: string | null;
  description: string;
  dimensions: Record<string, string>;
};

/** Build balanced journal lines for posting an AP supplier invoice. */
export function buildApJournalLines(params: {
  lines: ApInvoiceLineForPosting[];
  invoiceDate: string;
  taxCodes: TaxCodeRow[];
  taxRates: TaxRateRow[];
  accounts: ApPostingAccounts;
  supplierDimension?: Record<string, string>;
  memo?: string;
}): { lines: BuiltJournalLine[]; subtotalNet: number; taxTotal: number; totalGross: number } {
  const taxById = new Map(params.taxCodes.map((t) => [t.id, t]));
  const built: BuiltJournalLine[] = [];
  let recoverableVat = 0;
  let reverseChargeVat = 0;
  let subtotalNet = 0;
  let taxTotal = 0;
  let totalGross = 0;

  for (const line of params.lines) {
    const taxCode = taxById.get(line.taxCodeId);
    if (!taxCode) {
      throw new Error(`Unknown tax code ${line.taxCodeId}`);
    }
    const rate = resolveTaxRate(params.taxRates, taxCode.id, params.invoiceDate);
    const computed = computePurchaseLineTax({
      netAmount: line.netAmount,
      taxCode,
      rate,
    });

    subtotalNet = roundMoney(subtotalNet + computed.netAmount);
    taxTotal = roundMoney(taxTotal + computed.taxAmount);
    totalGross = roundMoney(totalGross + computed.grossAmount);
    recoverableVat = roundMoney(recoverableVat + computed.recoverableTax);
    reverseChargeVat = roundMoney(reverseChargeVat + computed.reverseChargeTax);

    built.push({
      accountId: line.accountId,
      debit: computed.expenseDebit,
      credit: 0,
      taxCodeId: taxCode.id,
      description: line.description || params.memo || "AP expense",
      dimensions: line.dimensions ?? {},
    });
  }

  if (recoverableVat > 0) {
    built.push({
      accountId: params.accounts.inputVatAccountId,
      debit: recoverableVat,
      credit: 0,
      taxCodeId: null,
      description: "Input VAT recoverable",
      dimensions: {},
    });
  }

  if (reverseChargeVat > 0) {
    // Dual VAT for RC: already Dr Input VAT above via recoverable; Cr Output VAT
    built.push({
      accountId: params.accounts.outputVatAccountId,
      debit: 0,
      credit: reverseChargeVat,
      taxCodeId: null,
      description: "Output VAT (reverse charge)",
      dimensions: {},
    });
  }

  // Cr AP for total_gross — for RC, gross paid to supplier is net (no VAT on bill)
  const apCredit = totalGross;
  if (apCredit > 0) {
    built.push({
      accountId: params.accounts.apControlAccountId,
      debit: 0,
      credit: apCredit,
      taxCodeId: null,
      description: params.memo || "Accounts payable",
      dimensions: params.supplierDimension ?? {},
    });
  }

  assertBalanced(built);
  return { lines: built, subtotalNet, taxTotal, totalGross };
}

export function assertBalanced(lines: BuiltJournalLine[]): void {
  const debit = sumMoney(lines.map((l) => l.debit));
  const credit = sumMoney(lines.map((l) => l.credit));
  if (!moneyEquals(debit, credit)) {
    throw new Error(
      `Journal unbalanced: debit ${debit} != credit ${credit}`,
    );
  }
  if (debit === 0) {
    throw new Error("Journal has no amounts");
  }
}

/** Mirror debits↔credits for a reversal entry. */
export function mirrorJournalLines(
  lines: BuiltJournalLine[],
): BuiltJournalLine[] {
  return lines.map((l) => ({
    ...l,
    debit: l.credit,
    credit: l.debit,
    description: l.description
      ? `Reversal: ${l.description}`
      : "Reversal",
  }));
}

export type ApApprovalContext = {
  isAppAdmin: boolean;
  /** Highest ladder level on accounting/ap for the venue. */
  accessLevel: "admin" | "edit" | "view" | "submit" | null;
  /** From accounting_approval_limits; null = no special limit grant. */
  approvalLimit: number | null;
};

/**
 * Bookkeeper (edit) can submit but not post.
 * Admin can always post.
 * A user with an approval limit may post when gross ≤ limit.
 */
export function canApproveOrPostApInvoice(
  ctx: ApApprovalContext,
  grossAmount: number,
): boolean {
  if (ctx.isAppAdmin) return true;
  if (ctx.accessLevel === "admin") return true;
  if (ctx.accessLevel === "edit" || ctx.accessLevel === "view" || ctx.accessLevel === "submit") {
    // edit/view/submit alone cannot post — unless they have an explicit limit
    if (ctx.approvalLimit == null) return false;
    if (!Number.isFinite(ctx.approvalLimit)) return true;
    return roundMoney(grossAmount) <= roundMoney(ctx.approvalLimit);
  }
  if (ctx.approvalLimit != null) {
    if (!Number.isFinite(ctx.approvalLimit)) return true;
    return roundMoney(grossAmount) <= roundMoney(ctx.approvalLimit);
  }
  return false;
}

export function canEditApInvoice(
  ctx: ApApprovalContext,
  status: string,
): boolean {
  if (status !== "draft") return false;
  if (ctx.isAppAdmin) return true;
  return (
    ctx.accessLevel === "admin" ||
    ctx.accessLevel === "edit" ||
    ctx.accessLevel === "submit"
  );
}

export function canSubmitApInvoice(ctx: ApApprovalContext): boolean {
  if (ctx.isAppAdmin) return true;
  return (
    ctx.accessLevel === "admin" ||
    ctx.accessLevel === "edit" ||
    ctx.accessLevel === "submit"
  );
}
