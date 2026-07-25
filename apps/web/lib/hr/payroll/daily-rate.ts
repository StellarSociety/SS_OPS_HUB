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
