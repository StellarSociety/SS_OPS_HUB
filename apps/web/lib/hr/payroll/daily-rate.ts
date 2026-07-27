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
};

export type ResolvedManualAdjustment = {
  amount: number;
  percentOfDailyRate: number | null;
  daysApplied: number | null;
};

function parseOptionalNumber(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return value;
}

/**
 * Resolve a manual adjustment from one of three inputs:
 * - fixed amount (AED)
 * - % of daily rate (defaults to 1 day when days omitted)
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

  if (dailyRate == null || dailyRate <= 0) {
    return {
      ok: false,
      error:
        "Daily rate is unavailable for this employee — enter an amount (AED) instead.",
    };
  }

  const effectivePercent = hasPercent ? percentNum : 100;
  const effectiveDays = hasDays ? daysNum : 1;

  if (effectivePercent < 0 || effectiveDays < 0) {
    return {
      ok: false,
      error: "Percent and days must be zero or greater.",
    };
  }

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
    },
  };
}
