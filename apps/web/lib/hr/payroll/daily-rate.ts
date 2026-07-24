/** Daily rate = Salary to pay × 12 / 365 (UAE calendar-day model). */

export function computeDailyRate(salaryToPay: number | null | undefined): number | null {
  if (salaryToPay == null || Number.isNaN(salaryToPay)) return null;
  return round6((salaryToPay * 12) / 365);
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
