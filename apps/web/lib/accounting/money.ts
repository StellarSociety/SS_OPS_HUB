/** Money helpers for accounting — amounts stored as numeric(14,3). */

export function roundMoney(value: number, decimals = 3): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function moneyEquals(a: number, b: number, decimals = 3): boolean {
  return roundMoney(a, decimals) === roundMoney(b, decimals);
}

export function sumMoney(values: number[], decimals = 3): number {
  return roundMoney(
    values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0),
    decimals,
  );
}

export function formatAedAccounting(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
