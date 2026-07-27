import type { PayrollLineCategory } from "./types";

export type PayrollAdjustmentCode = {
  code: string;
  label: string;
  category: PayrollLineCategory;
  /** When true, the adjustment is folded into fixed pay lines — not listed on payslips. */
  excludeFromPayslip?: boolean;
};

/** Internal-only adjustment — modifies basic / accom / transp, hidden from payslip. */
export const INTERNAL_ADJUSTMENT_CODE = "INTERNAL_ADJ";

export type AdjustmentFoldInput = {
  code: string;
  category: PayrollLineCategory;
  daysApplied?: number | null;
  percentOfDailyRate?: number | null;
};

/**
 * Adjustments folded into BASIC / ACCOM / TRANSP instead of a separate pay line.
 * Internal adjustments always fold; salary / allowance corrections fold when days
 * or % of daily rate is used.
 */
export function adjustmentFoldsIntoFixedPay(adj: AdjustmentFoldInput): boolean {
  const code = adj.code.trim().toUpperCase();
  if (isInternalAdjustmentCode(code)) return true;
  if (
    (code === "SALARY_CORRECTION" || code === "ALLOWANCE_ADJ") &&
    (adj.daysApplied != null || adj.percentOfDailyRate != null)
  ) {
    return true;
  }
  return false;
}

export function isSalaryCorrectionCode(code: string): boolean {
  return code.trim().toUpperCase() === "SALARY_CORRECTION";
}

/** Manual adjustment codes — aligned with payroll run summary buckets. */
export const PAYROLL_ADJUSTMENT_CODES: PayrollAdjustmentCode[] = [
  // Variable earnings
  { code: "OT", category: "variable", label: "Overtime" },
  { code: "BONUS", category: "variable", label: "Bonus" },
  { code: "COMPENSATION", category: "variable", label: "Compensation" },
  { code: "REIMBURSEMENT", category: "variable", label: "Reimbursement" },
  { code: "PAYBACK", category: "variable", label: "Payback" },
  { code: "EXPENSE_RETURN", category: "variable", label: "Expense return" },
  {
    code: "OTHER_VARIABLE",
    category: "variable",
    label: "Other variable earning",
  },
  // Fixed earnings
  {
    code: "SALARY_CORRECTION",
    category: "fixed",
    label: "Salary correction",
  },
  {
    code: "ALLOWANCE_ADJ",
    category: "fixed",
    label: "Allowance adjustment",
  },
  { code: "OTHER_FIXED", category: "fixed", label: "Other fixed earning" },
  // Deductions
  { code: "ADVANCE", category: "deduction", label: "Salary advance recovery" },
  { code: "FINE", category: "deduction", label: "Fine / penalty" },
  { code: "UNIFORM", category: "deduction", label: "Uniform / equipment" },
  { code: "OTHER_DEDUCTION", category: "deduction", label: "Other deduction" },
  {
    code: INTERNAL_ADJUSTMENT_CODE,
    category: "deduction",
    label: "Internal adjustment",
    excludeFromPayslip: true,
  },
];

export function isInternalAdjustmentCode(code: string): boolean {
  return code.trim().toUpperCase() === INTERNAL_ADJUSTMENT_CODE;
}

export function excludeAdjustmentFromPayslip(code: string): boolean {
  const entry = PAYROLL_ADJUSTMENT_CODES.find(
    (c) => c.code === code.trim().toUpperCase(),
  );
  return entry?.excludeFromPayslip === true || isInternalAdjustmentCode(code);
}

export function adjustmentCodesForCategory(
  category: PayrollLineCategory,
): PayrollAdjustmentCode[] {
  return PAYROLL_ADJUSTMENT_CODES.filter((c) => c.category === category);
}

export function defaultLabelForAdjustmentCode(code: string): string | null {
  return PAYROLL_ADJUSTMENT_CODES.find((c) => c.code === code)?.label ?? null;
}
