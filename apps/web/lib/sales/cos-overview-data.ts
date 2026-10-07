import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COST_CENTRES,
  type CosRunStatus,
  type CostCentre,
} from "@/lib/sales/cos-types";
import {
  deriveCosRunWithAdjustments,
  monthIndexForWeek,
} from "@/lib/sales/cos-calculations";
import {
  isCosSchemaMissingError,
  listVenueCosRuns,
} from "@/lib/sales/cos-store";

// Retail week-1 Monday per fiscal year (matches COS spreadsheet Dates sheet).
const YEAR_WK1: Record<number, string> = {
  2025: "2024-12-30",
  2026: "2025-12-29",
  2027: "2026-12-28",
};

export function cosWeekRange(
  year: number,
  weekNo: number,
): { start: string; end: string } {
  const base = YEAR_WK1[year] ?? `${year}-01-01`;
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (weekNo - 1) * 7);
  const start = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const end = d.toISOString().slice(0, 10);
  return { start, end };
}

/** Current retail week number for a date within a fiscal year. */
export function cosWeekForDate(year: number, isoDate: string): number {
  const base = new Date(`${YEAR_WK1[year] ?? `${year}-01-01`}T00:00:00Z`);
  const d = new Date(`${isoDate}T00:00:00Z`);
  const diffDays = Math.floor((d.getTime() - base.getTime()) / 86_400_000);
  return Math.max(1, Math.min(52, Math.floor(diffDays / 7) + 1));
}

type DailyRow = Record<string, number | string>;

const CENTRE_FIELDS: Record<CostCentre, string[]> = {
  food: ["lunch_food_gs", "dinner_food_gs"],
  beverage: ["lunch_beverages_gs", "dinner_beverages_gs"],
  wine: ["lunch_wine_gs", "dinner_wine_gs"],
  other: [
    "lunch_shisha_gs", "dinner_shisha_gs",
    "lunch_tobacco_gs", "dinner_tobacco_gs",
    "lunch_others_gs", "dinner_others_gs",
  ],
};
const ALL_SALES_FIELDS = Object.values(CENTRE_FIELDS).flat();

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export type CentreWeekPoint = {
  weekNo: number;
  restaurantSales: number;
  sales: number; // this centre
  purchases: number;
  costOfSales: number;
  costPct: number | null;
};

/** One retail week for one cost centre — feeds the MTD/YTD detail popups. */
export type CentreWeekDetail = {
  weekNo: number;
  monthIndex: number;
  start: string;
  end: string;
  sales: number;
  purchases: number;
  openingStock: number;
  closingStock: number;
  /** Named adjustments on the run (subtracted from cost of sales). */
  adjustments: number;
  costOfSales: number;
  runId: string | null;
  status: CosRunStatus | null;
};

export type CentreTotals = {
  costCentre: CostCentre;
  restaurantSales: number;
  sales: number;
  discount: number;
  purchases: number;
  /** Named adjustments only (subtracted from cost of sales). */
  adjustments: number;
  /** Sum of weekly opening − closing stock (added to cost of sales). */
  stockMovement: number;
  costOfSales: number;
  grossProfit: number;
  costPct: number | null;
  gpPct: number | null;
};

export type CosOverviewData = {
  fiscalYear: number;
  // weekly trend per centre (sales from daily sales; purchases/cos from runs)
  weekly: Record<CostCentre, CentreWeekPoint[]>;
  // period totals for the selected scope
  period: Record<CostCentre, CentreTotals>;
  mtd: Record<CostCentre, CentreTotals>;
  ytd: Record<CostCentre, CentreTotals>;
  /** All 52 retail weeks per centre, for drill-down. */
  weeks: Record<CostCentre, CentreWeekDetail[]>;
  /** Week numbers that make up the MTD totals. */
  mtdWeeks: number[];
  targetByCentre: Record<CostCentre, number>;
  // range metadata
  scope: "week" | "month" | "year";
  weekNo: number;
  monthIndex: number;
};

function emptyTotals(c: CostCentre): CentreTotals {
  return {
    costCentre: c,
    restaurantSales: 0,
    sales: 0,
    discount: 0,
    purchases: 0,
    adjustments: 0,
    stockMovement: 0,
    costOfSales: 0,
    grossProfit: 0,
    costPct: null,
    gpPct: null,
  };
}

function finalisePct(t: CentreTotals): CentreTotals {
  t.costPct = t.sales > 0 ? (t.costOfSales / t.sales) * 100 : null;
  t.gpPct = t.sales > 0 ? (t.grossProfit / t.sales) * 100 : null;
  return t;
}

/**
 * Build the overview dataset for a fiscal year and scope.
 * - Sales (restaurant + per centre) come from venue_daily_sales (live).
 * - Purchases / adjustments / cost of sales come from entered cost runs.
 */
export async function getCosOverviewData(
  supabase: SupabaseClient,
  venueId: string,
  fiscalYear: number,
  scope: "week" | "month" | "year",
  weekNo: number,
  monthIndex: number,
): Promise<CosOverviewData> {
  const targetByCentre = {} as Record<CostCentre, number>;

  // Load cost runs per centre (for purchases/adjustments/cost).
  const runsByCentre = {} as Record<CostCentre, Awaited<ReturnType<typeof listVenueCosRuns>>>;
  for (const c of COST_CENTRES) {
    try {
      runsByCentre[c] = await listVenueCosRuns(supabase, venueId, c, fiscalYear);
    } catch (e) {
      if (isCosSchemaMissingError(e as { code?: string; message?: string })) {
        runsByCentre[c] = [];
      } else throw e;
    }
    targetByCentre[c] = 27;
  }

  // Pull the whole year's daily sales once.
  const yearStart = cosWeekRange(fiscalYear, 1).start;
  const yearEnd = cosWeekRange(fiscalYear, 52).end;
  let daily: DailyRow[] = [];
  const { data, error } = await supabase
    .from("venue_daily_sales")
    .select("*")
    .eq("venue_id", venueId)
    .gte("sale_date", yearStart)
    .lte("sale_date", yearEnd);
  if (error) {
    if (!isCosSchemaMissingError(error)) throw error;
  } else {
    daily = (data ?? []) as DailyRow[];
  }

  // Index daily sales into weekly buckets per centre.
  const salesWeek = {} as Record<CostCentre, Map<number, { restaurant: number; sales: number }>>;
  for (const c of COST_CENTRES) salesWeek[c] = new Map();

  for (const row of daily) {
    const wk = cosWeekForDate(fiscalYear, String(row.sale_date));
    const restaurant = ALL_SALES_FIELDS.reduce((s, f) => s + n(row[f]), 0);
    for (const c of COST_CENTRES) {
      const centreSales = CENTRE_FIELDS[c].reduce((s, f) => s + n(row[f]), 0);
      const bucket = salesWeek[c].get(wk) ?? { restaurant: 0, sales: 0 };
      bucket.restaurant += restaurant;
      bucket.sales += centreSales;
      salesWeek[c].set(wk, bucket);
    }
  }

  // Weekly trend + totals.
  const weekly = {} as Record<CostCentre, CentreWeekPoint[]>;
  const period = {} as Record<CostCentre, CentreTotals>;
  const mtd = {} as Record<CostCentre, CentreTotals>;
  const ytd = {} as Record<CostCentre, CentreTotals>;
  const weeks = {} as Record<CostCentre, CentreWeekDetail[]>;

  const inScope = (wk: number) => {
    if (scope === "year") return true;
    if (scope === "month") return monthIndexForWeek(wk) === monthIndex;
    return wk === weekNo;
  };
  const inMtd = (wk: number) =>
    monthIndexForWeek(wk) === (scope === "week" ? monthIndexForWeek(weekNo) : monthIndex) &&
    wk <= (scope === "week" ? weekNo : 52);

  for (const c of COST_CENTRES) {
    const runByWeek = new Map<number, (typeof runsByCentre)[CostCentre][number]>();
    for (const r of runsByCentre[c]) runByWeek.set(r.week_no, r);

    const points: CentreWeekPoint[] = [];
    const details: CentreWeekDetail[] = [];
    const p = emptyTotals(c);
    const m = emptyTotals(c);
    const y = emptyTotals(c);

    for (let wk = 1; wk <= 52; wk++) {
      const s = salesWeek[c].get(wk);
      const run = runByWeek.get(wk);
      const d = run ? deriveCosRunWithAdjustments(run) : null;
      const restaurant = s?.restaurant ?? 0;
      const sales = s?.sales ?? (run ? run.sales_gs : 0);
      const purchases = d?.purchases ?? 0;
      const cos = d?.costOfSales ?? 0;
      const discount = run?.sales_discount_gs ?? 0;
      const adj = d?.adjustmentsTotal ?? 0;
      const stockMovement = d ? d.openingStock - d.closingStock : 0;
      const range = cosWeekRange(fiscalYear, wk);
      details.push({
        weekNo: wk,
        monthIndex: monthIndexForWeek(wk),
        start: range.start,
        end: range.end,
        sales,
        purchases,
        openingStock: d?.openingStock ?? 0,
        closingStock: d?.closingStock ?? 0,
        adjustments: adj,
        costOfSales: cos,
        runId: run?.id ?? null,
        status: run?.status ?? null,
      });

      if (restaurant > 0 || sales > 0 || purchases > 0) {
        points.push({
          weekNo: wk,
          restaurantSales: restaurant,
          sales,
          purchases,
          costOfSales: cos,
          costPct: sales > 0 && cos ? (cos / sales) * 100 : null,
        });
      }

      const add = (t: CentreTotals) => {
        t.restaurantSales += restaurant;
        t.sales += sales;
        t.discount += discount;
        t.purchases += purchases;
        t.adjustments += adj;
        t.stockMovement += stockMovement;
        t.costOfSales += cos;
        t.grossProfit += sales - cos;
      };
      add(y);
      if (inScope(wk)) add(p);
      if (inMtd(wk)) add(m);
    }

    weekly[c] = points;
    weeks[c] = details;
    period[c] = finalisePct(p);
    mtd[c] = finalisePct(m);
    ytd[c] = finalisePct(y);
  }

  return {
    fiscalYear,
    weekly,
    period,
    mtd,
    ytd,
    weeks,
    mtdWeeks: Array.from({ length: 52 }, (_, i) => i + 1).filter(inMtd),
    targetByCentre,
    scope,
    weekNo,
    monthIndex,
  };
}
