/**
 * Daily rate for a payroll period.
 *
 * Monthly salary is fixed: full attendance in the period pays salaryToPay in
 * full, whether the period has 30 or 31 calendar days.
 *
 * dailyRate = salaryToPay / periodCalendarDays
 * fixedPay  = dailyRate × paidDays
 */

export function computeDailyRate(
  salaryToPay: number | null | undefined,
  periodCalendarDays: number,
): number | null {
  if (salaryToPay == null || Number.isNaN(salaryToPay)) return null;
  if (!Number.isFinite(periodCalendarDays) || periodCalendarDays <= 0) {
    return null;
  }
  return round6(salaryToPay / periodCalendarDays);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round6(n: number): number {
  return Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;
}

/**
 * Percentage deduction applied on daily rate for N days:
 * amount = dailyRate × (percent / 100) × daysApplied
 */
export function percentDeductionAmount(
  dailyRate: number,
  percent: number,
  daysApplied: number,
): number {
  return round2(dailyRate * (percent / 100) * daysApplied);
}

export type ManualAdjustmentAmountInput = {
  amount?: number | null;
  percentOfDailyRate?: number | null;
  daysApplied?: number | null;
  /**
   * Deduction + % with no days → period-wide daily-rate discount
   * (amount 0, daysApplied null). Earnings keep the 1-day default.
   */
  rateDiscountWhenPercentOnly?: boolean;
};

export type ResolvedManualAdjustment = {
  amount: number;
  percentOfDailyRate: number | null;
  daysApplied: number | null;
  /** Set when this adjustment discounts the daily rate for all paid days. */
  rateDiscountPercent: number | null;
};

function parseOptionalNumber(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return value;
}

/**
 * True when a stored deduction is a percent-only daily-rate discount
 * (no days, no fixed AED amount).
 */
export function isDailyRateDiscountAdjustment(adj: {
  category: string;
  percentOfDailyRate?: number | null;
  daysApplied?: number | null;
  amount?: number | null;
}): boolean {
  if (adj.category !== "deduction") return false;
  if (adj.percentOfDailyRate == null || adj.percentOfDailyRate <= 0) return false;
  if (adj.daysApplied != null) return false;
  if (adj.amount != null && adj.amount > 0) return false;
  return true;
}

/**
 * Resolve a manual adjustment from one of three inputs:
 * - fixed amount (AED)
 * - % of daily rate
 *   - deductions with no days → rate discount (amount 0, days null)
 *   - otherwise defaults to 1 day when days omitted
 * - days applied (defaults to 100% of daily rate when percent omitted)
 */
export function resolveManualAdjustmentAmount(
  input: ManualAdjustmentAmountInput,
  dailyRate: number | null | undefined,
): { ok: true; value: ResolvedManualAdjustment } | { ok: false; error: string } {
  const amountNum = parseOptionalNumber(input.amount);
  const percentNum = parseOptionalNumber(input.percentOfDailyRate);
  const daysNum = parseOptionalNumber(input.daysApplied);

  if (amountNum != null) {
    if (amountNum < 0) {
      return { ok: false, error: "Amount must be zero or greater." };
    }
    return {
      ok: true,
      value: {
        amount: round2(amountNum),
        percentOfDailyRate: percentNum,
        daysApplied: daysNum,
        rateDiscountPercent: null,
      },
    };
  }

  const hasPercent = percentNum != null;
  const hasDays = daysNum != null;

  if (!hasPercent && !hasDays) {
    return {
      ok: false,
      error: "Enter an amount (AED), days applied, or % of daily rate.",
    };
  }

  if (percentNum != null && percentNum < 0) {
    return { ok: false, error: "Percent and days must be zero or greater." };
  }
  if (daysNum != null && daysNum < 0) {
    return { ok: false, error: "Percent and days must be zero or greater." };
  }

  // Deduction: % alone discounts the daily rate for all paid days.
  if (
    input.rateDiscountWhenPercentOnly &&
    hasPercent &&
    !hasDays &&
    percentNum != null
  ) {
    return {
      ok: true,
      value: {
        amount: 0,
        percentOfDailyRate: percentNum,
        daysApplied: null,
        rateDiscountPercent: percentNum,
      },
    };
  }

  if (dailyRate == null || dailyRate <= 0) {
    return {
      ok: false,
      error:
        "Daily rate is unavailable for this employee — enter an amount (AED) instead.",
    };
  }

  const effectivePercent = hasPercent ? percentNum! : 100;
  const effectiveDays = hasDays ? daysNum! : 1;

  return {
    ok: true,
    value: {
      amount: percentDeductionAmount(
        dailyRate,
        effectivePercent,
        effectiveDays,
      ),
      percentOfDailyRate: effectivePercent,
      daysApplied: effectiveDays,
      rateDiscountPercent: null,
    },
  };
}
