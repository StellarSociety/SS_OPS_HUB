import type { PayrollLineCategory } from "./types";
import { PAYROLL_LINE_CATEGORY_LABELS } from "./types";

/** How an adjustment is applied during payroll calculation. */
export type PayrollAdjustmentApplyBehavior =
  | "separate_line"
  | "fold_when_days_or_percent"
  | "always_fold_into_fixed";

export const PAYROLL_ADJUSTMENT_APPLY_BEHAVIOR_LABELS: Record<
  PayrollAdjustmentApplyBehavior,
  string
> = {
  separate_line: "Separate pay line",
  fold_when_days_or_percent: "Fold into fixed pay when days or % used",
  always_fold_into_fixed: "Always fold into fixed pay",
};

export type PayrollAdjustmentCodeConfig = {
  code: string;
  label: string;
  /** Short description shown in settings and as helper text. */
  description: string;
  category: PayrollLineCategory;
  /** How calculation applies this adjustment. */
  applyBehavior: PayrollAdjustmentApplyBehavior;
  /** Human-readable explanation of the apply behaviour. */
  behaviorExplanation: string;
  /** When true, omitted from payslip line lists. */
  excludeFromPayslip: boolean;
  allowAmountInput: boolean;
  allowDaysInput: boolean;
  allowPercentInput: boolean;
  active: boolean;
  sortOrder: number;
  /** System codes cannot change code or be deleted. */
  systemProtected: boolean;
};

/** Lightweight shape used by older call sites. */
export type PayrollAdjustmentCode = Pick<
  PayrollAdjustmentCodeConfig,
  "code" | "label" | "category" | "excludeFromPayslip"
>;

/** Category-level labels and behaviour overview for settings. */
export type PayrollCategoryMeta = {
  category: PayrollLineCategory;
  label: string;
  description: string;
  behaviorOverview: string;
};

export const PAYROLL_CATEGORY_META: PayrollCategoryMeta[] = [
  {
    category: "variable",
    label: PAYROLL_LINE_CATEGORY_LABELS.variable,
    description:
      "One-off or recurring earnings that sit outside the fixed wage package (basic + allowances).",
    behaviorOverview:
      "Usually posted as their own pay lines. They increase gross / net without changing paid-day fractions unless you enter days or %.",
  },
  {
    category: "fixed",
    label: PAYROLL_LINE_CATEGORY_LABELS.fixed,
    description:
      "Corrections and adjustments that relate to the fixed package (basic, accommodation, transport).",
    behaviorOverview:
      "Flat amounts appear as separate lines. When days or % of daily rate are used, selected codes fold into BASIC / ACCOM / TRANSP and can adjust effective paid days.",
  },
  {
    category: "addon",
    label: PAYROLL_LINE_CATEGORY_LABELS.addon,
    description:
      "Special add-ons used for period corrections (for example new joiners mid-cycle).",
    behaviorOverview:
      "Designed for structural pay corrections. Days / % inputs typically fold into fixed pay components rather than listing a standalone earning.",
  },
  {
    category: "deduction",
    label: PAYROLL_LINE_CATEGORY_LABELS.deduction,
    description:
      "Amounts withheld from net pay (advances, fines, equipment, or internal balancing).",
    behaviorOverview:
      "Reduce net salary. Most appear on the payslip; internal fold codes stay off the payslip and only reshape fixed components.",
  },
];

/** Internal-only adjustment — modifies basic / accom / transp, hidden from payslip. */
export const INTERNAL_ADJUSTMENT_CODE = "INTERNAL_ADJ";

/** Add-on that corrects new-joiner paid days / fixed pay when days or % are used. */
export const NEW_JOINER_CORRECTION_CODE = "NEW_JOINER_CORRECTION";

export type AdjustmentFoldInput = {
  code: string;
  category: PayrollLineCategory;
  daysApplied?: number | null;
  percentOfDailyRate?: number | null;
};

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Default catalogue — source of truth until a venue overrides labels / behaviours
 * under HR Settings → Pay → Adjustments & Codes.
 */
export const DEFAULT_PAYROLL_ADJUSTMENT_CODES: PayrollAdjustmentCodeConfig[] = [
  // Variable earnings
  {
    code: "OT",
    category: "variable",
    label: "Overtime",
    description: "Extra hours worked beyond the rostered shift.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Posted as its own variable earning line. Amount can be entered directly or derived from days / % of daily rate; it does not rewrite BASIC / ACCOM / TRANSP.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 10,
    systemProtected: true,
  },
  {
    code: "BONUS",
    category: "variable",
    label: "Bonus",
    description: "Discretionary or contractual bonus for the period.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Appears as a separate variable line on the run and payslip. Does not change paid days or fold into the fixed package.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 20,
    systemProtected: true,
  },
  {
    code: "COMPENSATION",
    category: "variable",
    label: "Compensation",
    description: "Compensatory pay (e.g. extra day given / PH compensation).",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Tracked as a distinct variable earning so compensation stays visible apart from overtime or bonus.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 30,
    systemProtected: true,
  },
  {
    code: "REIMBURSEMENT",
    category: "variable",
    label: "Reimbursement",
    description: "Expense reimbursement paid through payroll.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Adds a taxable or non-taxable reimbursement line (venue accounting decides GL). Remains a separate payslip line.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: false,
    allowPercentInput: false,
    active: true,
    sortOrder: 40,
    systemProtected: true,
  },
  {
    code: "PAYBACK",
    category: "variable",
    label: "Payback",
    description: "Return of previously underpaid or owed amounts.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Credits the employee as a variable line without altering fixed package components.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 50,
    systemProtected: true,
  },
  {
    code: "EXPENSE_RETURN",
    category: "variable",
    label: "Expense return",
    description: "Return of staff expenses settled via payroll.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Separate variable line for expense returns so they can be reconciled against claims.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: false,
    allowPercentInput: false,
    active: true,
    sortOrder: 60,
    systemProtected: true,
  },
  {
    code: "OTHER_VARIABLE",
    category: "variable",
    label: "Other variable earning",
    description: "Catch-all variable earning when no specific code fits.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Generic separate-line earning. Prefer a specific code when possible for reporting clarity.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 70,
    systemProtected: true,
  },
  // Fixed earnings
  {
    code: "SALARY_CORRECTION",
    category: "fixed",
    label: "Salary correction",
    description: "Correction to basic / fixed salary for the period.",
    applyBehavior: "fold_when_days_or_percent",
    behaviorExplanation:
      "A flat amount posts as its own fixed line. When days or % of daily rate are entered, the value folds into BASIC (and related fixed components) and can adjust effective paid days instead of listing a standalone correction.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 110,
    systemProtected: true,
  },
  {
    code: "ALLOWANCE_ADJ",
    category: "fixed",
    label: "Allowance adjustment",
    description: "Adjustment to accommodation or transport allowance.",
    applyBehavior: "fold_when_days_or_percent",
    behaviorExplanation:
      "Flat amounts appear as fixed lines. Days / % inputs fold into ACCOM / TRANSP (with BASIC as needed) so the payslip reflects corrected allowances rather than an extra add-on line.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 120,
    systemProtected: true,
  },
  {
    code: "OTHER_FIXED",
    category: "fixed",
    label: "Other fixed earning",
    description: "Other fixed-package related earning.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Always posted as a separate fixed earning line. Does not fold into BASIC / ACCOM / TRANSP.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 130,
    systemProtected: true,
  },
  // Add-Ons
  {
    code: NEW_JOINER_CORRECTION_CODE,
    category: "addon",
    label: "New Joiner Payroll Correction",
    description:
      "Corrects paid days and fixed pay when a new joiner starts mid-period.",
    applyBehavior: "fold_when_days_or_percent",
    behaviorExplanation:
      "When days or % of daily rate are used, folds into fixed pay and updates effective paid days so the new joiner’s package matches actual days worked. Flat amounts can still post as an add-on line.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 210,
    systemProtected: true,
  },
  // Deductions
  {
    code: "ADVANCE",
    category: "deduction",
    label: "Salary advance recovery",
    description: "Recovery of a previously paid salary advance.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Deducts from net as a visible payslip line. Does not change fixed package components or paid days.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: false,
    allowPercentInput: false,
    active: true,
    sortOrder: 310,
    systemProtected: true,
  },
  {
    code: "FINE",
    category: "deduction",
    label: "Fine / penalty",
    description: "Disciplinary fine or contractual penalty.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Separate deduction line on the run and payslip for auditability.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: false,
    allowPercentInput: false,
    active: true,
    sortOrder: 320,
    systemProtected: true,
  },
  {
    code: "UNIFORM",
    category: "deduction",
    label: "Uniform / equipment",
    description: "Uniform, tools, or equipment cost recovery.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Deducts as its own line so equipment recoveries can be reconciled separately from advances or fines.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: false,
    allowPercentInput: false,
    active: true,
    sortOrder: 330,
    systemProtected: true,
  },
  {
    code: "OTHER_DEDUCTION",
    category: "deduction",
    label: "Other deduction",
    description: "Catch-all deduction when no specific code fits.",
    applyBehavior: "separate_line",
    behaviorExplanation:
      "Generic deduction. A flat amount or percent×days posts as its own line. Percent with no days discounts the daily rate for all paid days (BASIC / ACCOM / TRANSP), with no separate deduction line.",
    excludeFromPayslip: false,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 340,
    systemProtected: true,
  },
  {
    code: INTERNAL_ADJUSTMENT_CODE,
    category: "deduction",
    label: "Internal adjustment",
    description:
      "Internal balancing adjustment that reshapes fixed pay without a payslip line.",
    applyBehavior: "always_fold_into_fixed",
    behaviorExplanation:
      "Always folds into BASIC / ACCOM / TRANSP and is hidden from the payslip. Use for internal day or package balancing that must not appear as a staff-facing deduction.",
    excludeFromPayslip: true,
    allowAmountInput: true,
    allowDaysInput: true,
    allowPercentInput: true,
    active: true,
    sortOrder: 350,
    systemProtected: true,
  },
];

/** @deprecated Prefer DEFAULT_PAYROLL_ADJUSTMENT_CODES — kept for call-site compatibility. */
export const PAYROLL_ADJUSTMENT_CODES: PayrollAdjustmentCode[] =
  DEFAULT_PAYROLL_ADJUSTMENT_CODES.map(
    ({ code, label, category, excludeFromPayslip }) => ({
      code,
      label,
      category,
      excludeFromPayslip,
    }),
  );

export type HrPayrollAdjustmentCodesSettings = {
  codes: PayrollAdjustmentCodeConfig[];
};

export const DEFAULT_HR_PAYROLL_ADJUSTMENT_CODES_SETTINGS: HrPayrollAdjustmentCodesSettings =
  {
    codes: DEFAULT_PAYROLL_ADJUSTMENT_CODES,
  };

function sanitizeCodeConfig(
  raw: Partial<PayrollAdjustmentCodeConfig>,
  fallback?: PayrollAdjustmentCodeConfig,
): PayrollAdjustmentCodeConfig | null {
  const code = normalizeCode(String(raw.code ?? fallback?.code ?? ""));
  if (!code) return null;

  const category = (raw.category ?? fallback?.category ?? "variable") as
    | PayrollLineCategory;
  const validCategory: PayrollLineCategory =
    category === "fixed" ||
    category === "variable" ||
    category === "deduction" ||
    category === "addon"
      ? category
      : "variable";

  const applyBehavior = (raw.applyBehavior ??
    fallback?.applyBehavior ??
    "separate_line") as PayrollAdjustmentApplyBehavior;
  const validBehavior: PayrollAdjustmentApplyBehavior =
    applyBehavior === "fold_when_days_or_percent" ||
    applyBehavior === "always_fold_into_fixed"
      ? applyBehavior
      : "separate_line";

  const systemProtected =
    fallback?.systemProtected === true ||
    DEFAULT_PAYROLL_ADJUSTMENT_CODES.some(
      (d) => d.code === code && d.systemProtected,
    );

  return {
    code,
    label: String(raw.label ?? fallback?.label ?? code).trim() || code,
    description: String(
      raw.description ?? fallback?.description ?? "",
    ).trim(),
    category: systemProtected
      ? (fallback?.category ?? validCategory)
      : validCategory,
    applyBehavior: validBehavior,
    behaviorExplanation: String(
      raw.behaviorExplanation ?? fallback?.behaviorExplanation ?? "",
    ).trim(),
    excludeFromPayslip: Boolean(
      raw.excludeFromPayslip ?? fallback?.excludeFromPayslip ?? false,
    ),
    allowAmountInput: Boolean(
      raw.allowAmountInput ?? fallback?.allowAmountInput ?? true,
    ),
    allowDaysInput: Boolean(
      raw.allowDaysInput ?? fallback?.allowDaysInput ?? true,
    ),
    allowPercentInput: Boolean(
      raw.allowPercentInput ?? fallback?.allowPercentInput ?? true,
    ),
    active: raw.active === undefined ? (fallback?.active ?? true) : Boolean(raw.active),
    sortOrder: Number.isFinite(Number(raw.sortOrder))
      ? Number(raw.sortOrder)
      : (fallback?.sortOrder ?? 999),
    systemProtected,
  };
}

/**
 * Merge venue overrides with system defaults.
 * - System-protected defaults are always present (labels/behaviours overridable).
 * - Custom venue codes are kept when valid.
 * - Inactive codes stay in the catalogue but are filtered by active helpers.
 */
export function mergePayrollAdjustmentCodes(
  stored?: Partial<HrPayrollAdjustmentCodesSettings> | PayrollAdjustmentCodeConfig[] | null,
): PayrollAdjustmentCodeConfig[] {
  const rawList: Partial<PayrollAdjustmentCodeConfig>[] = Array.isArray(stored)
    ? stored
    : Array.isArray(stored?.codes)
      ? stored.codes
      : [];

  const byCode = new Map<string, PayrollAdjustmentCodeConfig>();

  for (const def of DEFAULT_PAYROLL_ADJUSTMENT_CODES) {
    byCode.set(def.code, { ...def });
  }

  for (const raw of rawList) {
    const code = normalizeCode(String(raw.code ?? ""));
    if (!code) continue;
    const existing = byCode.get(code);
    const merged = sanitizeCodeConfig(raw, existing);
    if (!merged) continue;
    byCode.set(code, merged);
  }

  return Array.from(byCode.values()).sort((a, b) => {
    if (a.category !== b.category) {
      const order: PayrollLineCategory[] = [
        "variable",
        "fixed",
        "addon",
        "deduction",
      ];
      return order.indexOf(a.category) - order.indexOf(b.category);
    }
    return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);
  });
}

export function findAdjustmentCode(
  code: string,
  catalog: PayrollAdjustmentCodeConfig[] = DEFAULT_PAYROLL_ADJUSTMENT_CODES,
): PayrollAdjustmentCodeConfig | undefined {
  const normalized = normalizeCode(code);
  return catalog.find((c) => c.code === normalized);
}

/**
 * Adjustments folded into BASIC / ACCOM / TRANSP instead of a separate pay line.
 * Behaviour is driven by the catalogue `applyBehavior` field.
 */
export function adjustmentFoldsIntoFixedPay(
  adj: AdjustmentFoldInput,
  catalog: PayrollAdjustmentCodeConfig[] = DEFAULT_PAYROLL_ADJUSTMENT_CODES,
): boolean {
  const entry = findAdjustmentCode(adj.code, catalog);
  if (!entry) {
    // Legacy fallback for known system codes if catalogue missing the row
    const code = normalizeCode(adj.code);
    if (code === INTERNAL_ADJUSTMENT_CODE) return true;
    if (
      (code === "SALARY_CORRECTION" ||
        code === "ALLOWANCE_ADJ" ||
        code === NEW_JOINER_CORRECTION_CODE) &&
      (adj.daysApplied != null || adj.percentOfDailyRate != null)
    ) {
      return true;
    }
    return false;
  }

  if (entry.applyBehavior === "always_fold_into_fixed") return true;
  if (entry.applyBehavior === "fold_when_days_or_percent") {
    return adj.daysApplied != null || adj.percentOfDailyRate != null;
  }
  return false;
}

export function isSalaryCorrectionCode(code: string): boolean {
  return normalizeCode(code) === "SALARY_CORRECTION";
}

export function isNewJoinerCorrectionCode(code: string): boolean {
  return normalizeCode(code) === NEW_JOINER_CORRECTION_CODE;
}

export function isInternalAdjustmentCode(code: string): boolean {
  return normalizeCode(code) === INTERNAL_ADJUSTMENT_CODE;
}

export function excludeAdjustmentFromPayslip(
  code: string,
  catalog: PayrollAdjustmentCodeConfig[] = DEFAULT_PAYROLL_ADJUSTMENT_CODES,
): boolean {
  const entry = findAdjustmentCode(code, catalog);
  if (entry) return entry.excludeFromPayslip || entry.applyBehavior === "always_fold_into_fixed";
  return isInternalAdjustmentCode(code);
}

export function adjustmentCodesForCategory(
  category: PayrollLineCategory,
  catalog: PayrollAdjustmentCodeConfig[] = DEFAULT_PAYROLL_ADJUSTMENT_CODES,
  opts?: { includeInactive?: boolean },
): PayrollAdjustmentCodeConfig[] {
  return catalog.filter(
    (c) =>
      c.category === category &&
      (opts?.includeInactive ? true : c.active),
  );
}

export function defaultLabelForAdjustmentCode(
  code: string,
  catalog: PayrollAdjustmentCodeConfig[] = DEFAULT_PAYROLL_ADJUSTMENT_CODES,
): string | null {
  return findAdjustmentCode(code, catalog)?.label ?? null;
}

export function behaviorExplanationForCode(
  code: string,
  catalog: PayrollAdjustmentCodeConfig[] = DEFAULT_PAYROLL_ADJUSTMENT_CODES,
): string | null {
  return findAdjustmentCode(code, catalog)?.behaviorExplanation ?? null;
}
