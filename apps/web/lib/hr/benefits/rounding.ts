function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Individual payouts are handed out in AED 5 notes, so they floor to a multiple of 5. */
export function floorPayoutToAed5(amount: number): number {
  const n = Number(amount) || 0;
  if (n <= 0) return 0;
  return Math.floor(n / 5) * 5;
}

const AED5_PAYROLL_BENEFIT_TYPES = new Set(["tips", "service_charge"]);

/**
 * Amount that lands on a payroll line. Tips and service charge follow the
 * benefit-run Rounded payout (floor to AED 5); other benefits stay exact.
 */
export function payrollBenefitPayoutAmount(
  benefitType: string,
  amount: number,
): number {
  if (AED5_PAYROLL_BENEFIT_TYPES.has(benefitType)) {
    return floorPayoutToAed5(amount);
  }
  return round2(Number(amount) || 0);
}

/**
 * Rounding collection: what stays behind after each individual payout is floored
 * to AED 5. Callers pass one amount per person actually paid out — pool share for
 * pool recipients, retained tips for contributors.
 */
export function sumAed5RoundingRemainder(amounts: Iterable<number>): number {
  let total = 0;
  for (const raw of amounts) {
    const amount = Number(raw) || 0;
    if (amount <= 0) continue;
    total += amount - floorPayoutToAed5(amount);
  }
  return Math.max(0, round2(total));
}
