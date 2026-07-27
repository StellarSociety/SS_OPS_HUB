import {
  INTERNAL_ADJUSTMENT_CODE,
  adjustmentFoldsIntoFixedPay,
  isInternalAdjustmentCode,
} from "./adjustment-codes";
import type { PayrollLineCategory } from "./types";
import { round2 } from "./daily-rate";

export type OrphanInternalAdjustmentDraft = {
  staff_id: string;
  category: "deduction" | "variable";
  code: string;
  label: string;
  amount: number;
  percent_of_daily_rate: number;
  days_applied: number;
  reason: string;
};

/**
 * When fixed pay uses fewer/more days than attendance but no INTERNAL_ADJ row
 * exists (often after recalculate CASCADE-deleted the staging record).
 */
export function inferOrphanedInternalAdjustment(input: {
  staffId: string;
  paidDays: number;
  effectivePaidDays: number;
  dailyRate: number | null;
  fixedLineDays: number | null;
  existingAdjustments: Array<{
    code: string;
    category: string;
    days_applied?: number | null;
    percent_of_daily_rate?: number | null;
  }>;
}): OrphanInternalAdjustmentDraft | null {
  if (
    input.existingAdjustments.some((a) =>
      adjustmentFoldsIntoFixedPay({
        code: a.code,
        category: a.category as PayrollLineCategory,
        daysApplied: a.days_applied ?? null,
        percentOfDailyRate: a.percent_of_daily_rate ?? null,
      }),
    )
  ) {
    return null;
  }

  const effectiveDays =
    input.fixedLineDays != null && !Number.isNaN(Number(input.fixedLineDays))
      ? Number(input.fixedLineDays)
      : input.effectivePaidDays;
  const delta = round2(input.paidDays - effectiveDays);
  if (Math.abs(delta) < 0.005) return null;

  const daysApplied = Math.abs(delta);
  const amount =
    input.dailyRate != null && input.dailyRate > 0
      ? round2(input.dailyRate * daysApplied)
      : 0;
  const category = delta > 0 ? "deduction" : "variable";

  return {
    staff_id: input.staffId,
    category,
    code: INTERNAL_ADJUSTMENT_CODE,
    label: "Internal adjustment",
    amount,
    percent_of_daily_rate: 100,
    days_applied: daysApplied,
    reason:
      "Applied in payroll calculation — adjustment record missing after recalculate",
  };
}

export function isOrphanPayrollAdjustment(adj: { id: string }): boolean {
  return !adj.id.trim();
}
