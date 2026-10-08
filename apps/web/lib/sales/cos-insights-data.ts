import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveCosRunWithAdjustments,
  monthIndexForWeek,
} from "@/lib/sales/cos-calculations";
import { cosWeekForDate, cosWeekRange } from "@/lib/sales/cos-overview-data";
import { getCosLedgerPurchases } from "@/lib/sales/cos-purchases-data";
import {
  CENTRE_SALES_FIELDS,
  getVenueTotalTaxPct,
} from "@/lib/sales/cos-sales-data";
import {
  getVenueCosSettings,
  listVenueCosMonthlyTargets,
  listVenueCosRuns,
  resolveCosTargets,
} from "@/lib/sales/cos-store";
import { COST_CENTRES, type CostCentre } from "@/lib/sales/cos-types";
import { grossToNet } from "@/lib/sales/daily-sales-calculations";

/** One retail week of figures for the Insights charts. */
export type CosInsightWeek = {
  year: number;
  weekNo: number;
  monthIndex: number;
  start: string;
  end: string;
  /** NET sales per cost centre (from Revenue daily sales). */
  salesNet: Record<CostCentre, number>;
  /** This centre's NET purchases; null when there's no source for the week. */
  purchases: number | null;
  /** Closing stock from the week's cost run; null without a run. */
  closingStock: number | null;
  /** Cost of sales and the sales it's measured against, from the cost run. */
  costOfSales: number | null;
  runSales: number | null;
  /** Cost of sales ÷ sales on the cost run; null without a run or sales. */
  costPct: number | null;
  purchaseTarget: number;
  closingStockTarget: number;
};

export type CosInsightsData = {
  centre: CostCentre;
  fiscalYear: number;
  currentWeek: number;
  /** Where purchases come from: linked Accounts ledgers, else cost runs. */
  purchasesSource: "accounts" | "cost_runs";
  /** Previous fiscal year's week 1 through the current week, oldest first. */
  weeks: CosInsightWeek[];
};

function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Fiscal year a date falls in (retail years start on the Monday of week 1). */
export function cosFiscalYearForDate(iso: string): number {
  const y = Number(iso.slice(0, 4));
  if (iso < cosWeekRange(y, 1).start) return y - 1;
  if (iso > cosWeekRange(y, 52).end) return y + 1;
  return y;
}

/**
 * Weekly sales, purchases, stock and targets for one cost centre, covering the
 * previous fiscal year and the current one up to this week.
 */
export async function getCosInsightsData(
  supabase: SupabaseClient,
  venueId: string,
  centre: CostCentre,
  today: string,
): Promise<CosInsightsData> {
  const fiscalYear = cosFiscalYearForDate(today);
  const currentWeek = cosWeekForDate(fiscalYear, today);
  const years = [fiscalYear - 1, fiscalYear];
  const from = cosWeekRange(years[0], 1).start;
  const to = cosWeekRange(fiscalYear, currentWeek).end;

  const [salesRes, totalTaxPct, settings, runsByYear, targetsByYear] =
    await Promise.all([
      supabase
        .from("venue_daily_sales")
        .select("*")
        .eq("venue_id", venueId)
        .gte("sale_date", from)
        .lte("sale_date", to),
      getVenueTotalTaxPct(supabase, venueId),
      getVenueCosSettings(supabase, venueId, centre),
      Promise.all(
        years.map((y) => listVenueCosRuns(supabase, venueId, centre, y)),
      ),
      Promise.all(
        years.map((y) =>
          listVenueCosMonthlyTargets(supabase, venueId, {
            costCentre: centre,
            fiscalYear: y,
          }),
        ),
      ),
    ]);
  if (salesRes.error) throw salesRes.error;

  const weeks: CosInsightWeek[] = [];
  const index = new Map<string, CosInsightWeek>();
  years.forEach((year, yi) => {
    const lastWeek = year === fiscalYear ? currentWeek : 52;
    const runByWeek = new Map(runsByYear[yi].map((r) => [r.week_no, r]));
    for (let weekNo = 1; weekNo <= lastWeek; weekNo++) {
      const monthIndex = monthIndexForWeek(weekNo);
      const targets = resolveCosTargets(
        settings,
        targetsByYear[yi].find((t) => t.month_index === monthIndex),
      );
      const run = runByWeek.get(weekNo);
      const derived = run ? deriveCosRunWithAdjustments(run) : null;
      const week: CosInsightWeek = {
        year,
        weekNo,
        monthIndex,
        ...cosWeekRange(year, weekNo),
        salesNet: { food: 0, beverage: 0, wine: 0, other: 0 },
        purchases: run ? num(run.purchases_gs) : null,
        closingStock: run ? num(run.closing_stock_gs) : null,
        costOfSales: derived?.costOfSales ?? null,
        runSales: derived?.sales ?? null,
        costPct: derived?.costPct ?? null,
        purchaseTarget: targets.purchaseTargetGs,
        closingStockTarget: targets.closingStockTargetGs,
      };
      weeks.push(week);
      index.set(`${year}:${weekNo}`, week);
    }
  });

  const weekFor = (iso: string) => {
    const year = cosFiscalYearForDate(iso);
    return index.get(`${year}:${cosWeekForDate(year, iso)}`);
  };

  for (const row of (salesRes.data ?? []) as Record<string, unknown>[]) {
    const week = weekFor(String(row.sale_date).slice(0, 10));
    if (!week) continue;
    for (const c of COST_CENTRES) {
      const gs = CENTRE_SALES_FIELDS[c].reduce((s, f) => s + num(row[f]), 0);
      week.salesNet[c] += grossToNet(gs, totalTaxPct);
    }
  }

  // Purchases: AP invoices on the centre's linked ledgers, else cost runs.
  const ledgerIds = settings?.ledger_account_ids ?? [];
  let purchasesSource: CosInsightsData["purchasesSource"] = "cost_runs";
  if (ledgerIds.length > 0) {
    try {
      const lines = await getCosLedgerPurchases(venueId, ledgerIds, from, to);
      for (const w of weeks) w.purchases = 0;
      for (const line of lines) {
        const week = weekFor(line.date);
        if (week) week.purchases = (week.purchases ?? 0) + line.net;
      }
      purchasesSource = "accounts";
    } catch (error) {
      console.error("[gp-cos/insights] ledger purchases:", error);
    }
  }

  return { centre, fiscalYear, currentWeek, purchasesSource, weeks };
}
