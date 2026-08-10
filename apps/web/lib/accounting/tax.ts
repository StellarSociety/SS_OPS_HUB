import { roundMoney } from "./money";

export type TaxCodeRow = {
  id: string;
  code: string;
  label: string;
  treatment: "output" | "input" | "both" | "none";
  input_recoverable: boolean;
  output_account_id: string | null;
  input_account_id: string | null;
};

export type TaxRateRow = {
  id: string;
  tax_code_id: string;
  rate: number;
  valid_from: string;
  valid_to: string | null;
};

/** Resolve the effective tax rate for (tax_code, transaction_date). Never hardcode. */
export function resolveTaxRate(
  rates: TaxRateRow[],
  taxCodeId: string,
  transactionDate: string,
): number {
  const applicable = rates
    .filter(
      (r) =>
        r.tax_code_id === taxCodeId &&
        r.valid_from <= transactionDate &&
        (r.valid_to == null || r.valid_to >= transactionDate),
    )
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from));

  if (applicable.length === 0) {
    throw new Error(
      `No tax rate found for tax code ${taxCodeId} on ${transactionDate}`,
    );
  }
  return Number(applicable[0]!.rate);
}

export type LineTaxResult = {
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
  rate: number;
  /** VAT recoverable to Input VAT control (0 for BL / zero-rated). */
  recoverableTax: number;
  /** Self-assessed reverse-charge VAT (Dr Input + Cr Output). */
  reverseChargeTax: number;
  /** For BL: expense is debited at gross; taxAmount still shown but not recoverable. */
  expenseDebit: number;
};

export function computePurchaseLineTax(params: {
  netAmount: number;
  taxCode: TaxCodeRow;
  rate: number;
}): LineTaxResult {
  const netAmount = roundMoney(params.netAmount);
  const rate = params.rate;
  const taxAmount = roundMoney(netAmount * rate);
  const grossAmount = roundMoney(netAmount + taxAmount);
  const code = params.taxCode.code.toUpperCase();

  if (code === "BL") {
    return {
      netAmount,
      taxAmount,
      grossAmount,
      rate,
      recoverableTax: 0,
      reverseChargeTax: 0,
      expenseDebit: grossAmount,
    };
  }

  if (code === "RC") {
    return {
      netAmount,
      taxAmount,
      grossAmount: netAmount, // RC: supplier bill has no VAT; self-assess
      rate,
      recoverableTax: taxAmount,
      reverseChargeTax: taxAmount,
      expenseDebit: netAmount,
    };
  }

  // SP, ZP, and other input treatments
  const recoverable =
    params.taxCode.input_recoverable && taxAmount > 0 ? taxAmount : 0;

  return {
    netAmount,
    taxAmount,
    grossAmount: roundMoney(netAmount + taxAmount),
    rate,
    recoverableTax: recoverable,
    reverseChargeTax: 0,
    expenseDebit: netAmount,
  };
}
