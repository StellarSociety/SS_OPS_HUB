// GP & COS calculations — mirrors the COS BEV spreadsheet.
//   Cost of Sales = Purchases + Opening Stock - Closing Stock - Adjustments
//   Gross Profit  = Sales - Cost of Sales
//   Cost %        = Cost of Sales / Sales * 100
//   GP %          = Gross Profit / Sales * 100   (= 100 - Cost %)
// Weeks roll into months using the retail 4-4-5 calendar already used by the
// Sales module (lib/sales/forecast-445-calendar.ts).

import type {
  VenueCosAdjustment,
  VenueCosRun,
  VenueCosRunWithAdjustments,
} from "@/lib/sales/cos-types";

export const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export const MONTH_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

/**
 * Month boundaries for the retail calendar, taken EXACTLY from Orilla's COS
 * spreadsheet (the authoritative source for cost runs): month N starts on the
 * listed week number. Pattern of weeks per month: 4,4,5,4,4,5,4,4,5,4,5,4.
 * (Note: the hub's forecast-445-calendar uses a pure 4-4-5 which differs in the
 * last quarter — COS runs follow the spreadsheet, so we define it here.)
 */
export const MONTH_START_WEEK: number[] =
  [1, 5, 9, 14, 18, 22, 27, 31, 35, 40, 44, 49];

/** Weeks per month, derived from the boundaries above (last month → week 52). */
export const MONTH_WEEK_COUNTS: number[] = MONTH_START_WEEK.map((start, i) => {
  const next = MONTH_START_WEEK[i + 1] ?? 53;
  return next - start;
});

export const TOTAL_WEEKS = 52;

/** Month index (0=Jan) that a retail week number belongs to. */
export function monthIndexForWeek(weekNo: number): number {
  let idx = 0;
  for (let i = 0; i < MONTH_START_WEEK.length; i++) {
    if (weekNo >= MONTH_START_WEEK[i]) idx = i;
  }
  return idx;
}

/** Week numbers (1-based) that belong to a given month index. */
export function weeksInMonth(monthIndex: number): number[] {
  const start = MONTH_START_WEEK[monthIndex];
  const count = MONTH_WEEK_COUNTS[monthIndex];
  return Array.from({ length: count }, (_, i) => start + i);
}

export function sumAdjustments(adjustments: VenueCosAdjustment[]): number {
  return adjustments.reduce((sum, a) => sum + (Number(a.amount_gs) || 0), 0);
}

export type CosDerived = {
  sales: number;
  purchases: number;
  openingStock: number;
  closingStock: number;
  adjustmentsTotal: number;
  costOfSales: number;
  grossProfit: number;
  costPct: number | null; // null when sales == 0
  gpPct: number | null;
};

/** Core per-run derivation. `adjustmentsTotal` can be passed or derived. */
export function deriveCosRun(
  run: Pick<
    VenueCosRun,
    "sales_gs" | "purchases_gs" | "opening_stock_gs" | "closing_stock_gs"
  >,
  adjustmentsTotal: number,
): CosDerived {
  const sales = Number(run.sales_gs) || 0;
  const purchases = Number(run.purchases_gs) || 0;
  const openingStock = Number(run.opening_stock_gs) || 0;
  const closingStock = Number(run.closing_stock_gs) || 0;

  const costOfSales = purchases + openingStock - closingStock - adjustmentsTotal;
  const grossProfit = sales - costOfSales;
  const costPct = sales > 0 ? (costOfSales / sales) * 100 : null;
  const gpPct = sales > 0 ? (grossProfit / sales) * 100 : null;

  return {
    sales,
    purchases,
    openingStock,
    closingStock,
    adjustmentsTotal,
    costOfSales,
    grossProfit,
    costPct,
    gpPct,
  };
}

export function deriveCosRunWithAdjustments(
  run: VenueCosRunWithAdjustments,
): CosDerived {
  return deriveCosRun(run, sumAdjustments(run.adjustments));
}

/** Status for colouring cost % against a target. */
export type CostHealth = "good" | "warn" | "bad" | "none";

export function costHealth(
  costPct: number | null,
  targetPct: number,
): CostHealth {
  if (costPct == null) return "none";
  if (costPct <= targetPct) return "good";
  if (costPct <= targetPct + 5) return "warn";
  return "bad";
}

export type MonthRollup = {
  monthIndex: number;
  label: string;
  short: string;
  restaurantSales: number;
  sales: number;
  salesDiscount: number;
  purchases: number;
  adjustmentsTotal: number;
  costOfSales: number;
  grossProfit: number;
  costPct: number | null;
  gpPct: number | null;
  runCount: number;
};

/**
 * Group derived runs into month rollups (month-to-date totals), keyed by the
 * 4-4-5 month the week belongs to.
 */
export function rollupByMonth(
  runs: VenueCosRunWithAdjustments[],
): MonthRollup[] {
  const byMonth = new Map<number, MonthRollup>();

  for (const run of runs) {
    const mi = monthIndexForWeek(run.week_no);
    const d = deriveCosRunWithAdjustments(run);
    let m = byMonth.get(mi);
    if (!m) {
      m = {
        monthIndex: mi,
        label: MONTH_LABELS[mi],
        short: MONTH_SHORT[mi],
        restaurantSales: 0,
        sales: 0,
        salesDiscount: 0,
        purchases: 0,
        adjustmentsTotal: 0,
        costOfSales: 0,
        grossProfit: 0,
        costPct: null,
        gpPct: null,
        runCount: 0,
      };
      byMonth.set(mi, m);
    }
    m.restaurantSales += Number(run.restaurant_sales_gs) || 0;
    m.sales += d.sales;
    m.salesDiscount += Number(run.sales_discount_gs) || 0;
    m.purchases += d.purchases;
    m.adjustmentsTotal += d.adjustmentsTotal;
    m.costOfSales += d.costOfSales;
    m.grossProfit += d.grossProfit;
    m.runCount += 1;
  }

  for (const m of byMonth.values()) {
    m.costPct = m.sales > 0 ? (m.costOfSales / m.sales) * 100 : null;
    m.gpPct = m.sales > 0 ? (m.grossProfit / m.sales) * 100 : null;
  }

  return Array.from(byMonth.values()).sort((a, b) => a.monthIndex - b.monthIndex);
}

/** The auto-adjustment created from a discount at the configured %. */
export function autoDiscountAdjustment(
  salesDiscountGs: number,
  autoAdjustmentPct: number,
): number {
  if (!autoAdjustmentPct) return 0;
  return (Number(salesDiscountGs) || 0) * (autoAdjustmentPct / 100);
}
