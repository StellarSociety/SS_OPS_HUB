import {
  formatIsoWeekLabel,
  formatMonthLabel,
  getIsoWeekMonday,
  getIsoWeekParts,
} from "@/lib/sales/daily-sales-calculations";
import { getPreviousMonthKey } from "@/lib/sales/sales-overview-aggregations";
import {
  formatLocalDateFromDate,
  getDatesInIsoWeek,
  getDatesInMonth,
  getDatesInYear,
  parseWeekFilterKey,
  resolveSalesTableCalendarDates,
} from "@/lib/sales/sales-data-table-dates";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";
import type { VenueWaiter } from "@/lib/sales/waiters-types";

export type WaiterInsightsPeriodMode = "week" | "month" | "year";

export type WaiterComparisonPoint = {
  waiterId: string;
  label: string;
  current: number;
  previous: number;
  currentContributionPct: number | null;
  previousContributionPct: number | null;
};

type WaiterPeriodTotals = {
  sales: number;
  covers: number;
  gratuity: number;
};

export function getPreviousWeekFilterKey(weekKey: string): string {
  const parsed = parseWeekFilterKey(weekKey);
  if (!parsed) return weekKey;

  const monday = getIsoWeekMonday(parsed.year, parsed.week);
  monday.setDate(monday.getDate() - 7);
  const { week, year } = getIsoWeekParts(formatLocalDateFromDate(monday));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function getPreviousYearKey(yearKey: string): string {
  return String(Number(yearKey) - 1);
}

export function resolvePreviousPeriodFilterKey(
  periodMode: WaiterInsightsPeriodMode,
  filterKey: string,
): string {
  if (periodMode === "week") return getPreviousWeekFilterKey(filterKey);
  if (periodMode === "month") return getPreviousMonthKey(filterKey);
  return getPreviousYearKey(filterKey);
}

export function formatWaiterInsightsPeriodLabel(
  periodMode: WaiterInsightsPeriodMode,
  filterKey: string,
): string {
  if (periodMode === "week") {
    const parsed = parseWeekFilterKey(filterKey);
    if (!parsed) return filterKey;
    return formatIsoWeekLabel(parsed.year, parsed.week);
  }
  if (periodMode === "month") return formatMonthLabel(filterKey);
  return filterKey;
}

function getPeriodDates(
  periodMode: WaiterInsightsPeriodMode,
  filterKey: string,
): string[] {
  return (
    resolveSalesTableCalendarDates({
      fromDate: "",
      toDate: "",
      weekFilter: periodMode === "week" ? filterKey : "",
      monthFilter: periodMode === "month" ? filterKey : "",
      yearFilter: periodMode === "year" ? filterKey : "",
    }) ?? []
  );
}

export function filterWaiterEntriesForPeriod(
  entries: VenueWaiterDailySalesEntry[],
  periodMode: WaiterInsightsPeriodMode,
  filterKey: string,
): VenueWaiterDailySalesEntry[] {
  const dateSet = new Set(getPeriodDates(periodMode, filterKey));
  if (dateSet.size === 0) return [];

  return entries.filter((entry) => dateSet.has(entry.sale_date));
}

function emptyTotals(): WaiterPeriodTotals {
  return { sales: 0, covers: 0, gratuity: 0 };
}

function aggregateWaiterTotals(
  entries: VenueWaiterDailySalesEntry[],
): Map<string, WaiterPeriodTotals> {
  const totals = new Map<string, WaiterPeriodTotals>();

  for (const entry of entries) {
    const current = totals.get(entry.waiter_id) ?? emptyTotals();
    current.sales += entry.total_sales_gs;
    current.covers += entry.total_covers;
    current.gratuity += entry.gratuity_cc_gs + entry.gratuity_cash_gs;
    totals.set(entry.waiter_id, current);
  }

  return totals;
}

function periodAsph(totals: WaiterPeriodTotals): number {
  if (totals.covers <= 0) return 0;
  return totals.sales / totals.covers;
}

function contributionPct(value: number, total: number): number | null {
  if (total <= 0) return null;
  return (value / total) * 100;
}

function getActiveWaiters(waiters: VenueWaiter[]): VenueWaiter[] {
  return waiters.filter((waiter) => waiter.status === "active");
}

function getActiveWaiterIds(waiters: VenueWaiter[]): Set<string> {
  return new Set(getActiveWaiters(waiters).map((waiter) => waiter.id));
}

function filterEntriesForActiveWaiters(
  entries: VenueWaiterDailySalesEntry[],
  activeWaiterIds: Set<string>,
): VenueWaiterDailySalesEntry[] {
  return entries.filter((entry) => activeWaiterIds.has(entry.waiter_id));
}

function buildWaiterComparisonPoints(
  waiters: VenueWaiter[],
  currentEntries: VenueWaiterDailySalesEntry[],
  previousEntries: VenueWaiterDailySalesEntry[],
  getCurrentValue: (totals: WaiterPeriodTotals) => number,
  getPreviousValue: (totals: WaiterPeriodTotals) => number,
): WaiterComparisonPoint[] {
  const activeWaiters = getActiveWaiters(waiters);
  const activeWaiterIds = getActiveWaiterIds(waiters);
  const filteredCurrentEntries = filterEntriesForActiveWaiters(
    currentEntries,
    activeWaiterIds,
  );
  const filteredPreviousEntries = filterEntriesForActiveWaiters(
    previousEntries,
    activeWaiterIds,
  );

  const currentTotals = aggregateWaiterTotals(filteredCurrentEntries);
  const previousTotals = aggregateWaiterTotals(filteredPreviousEntries);
  const waiterNameById = new Map(
    activeWaiters.map((waiter) => [waiter.id, waiter.name]),
  );

  const currentGrandTotal = Array.from(currentTotals.values()).reduce(
    (sum, totals) => sum + getCurrentValue(totals),
    0,
  );
  const previousGrandTotal = Array.from(previousTotals.values()).reduce(
    (sum, totals) => sum + getPreviousValue(totals),
    0,
  );

  const orderedWaiterIds = activeWaiters.map((waiter) => waiter.id);

  return orderedWaiterIds
    .map((waiterId) => {
      const current = currentTotals.get(waiterId) ?? emptyTotals();
      const previous = previousTotals.get(waiterId) ?? emptyTotals();
      const currentValue = getCurrentValue(current);
      const previousValue = getPreviousValue(previous);

      return {
        waiterId,
        label: waiterNameById.get(waiterId) ?? "Unknown waiter",
        current: currentValue,
        previous: previousValue,
        currentContributionPct: contributionPct(currentValue, currentGrandTotal),
        previousContributionPct: contributionPct(previousValue, previousGrandTotal),
      };
    })
    .sort(
      (a, b) =>
        b.current - a.current ||
        b.previous - a.previous ||
        a.label.localeCompare(b.label),
    );
}

export function buildWaiterRevenueComparison(
  waiters: VenueWaiter[],
  currentEntries: VenueWaiterDailySalesEntry[],
  previousEntries: VenueWaiterDailySalesEntry[],
): WaiterComparisonPoint[] {
  return buildWaiterComparisonPoints(
    waiters,
    currentEntries,
    previousEntries,
    (totals) => totals.sales,
    (totals) => totals.sales,
  );
}

export function buildWaiterAsphComparison(
  waiters: VenueWaiter[],
  currentEntries: VenueWaiterDailySalesEntry[],
  previousEntries: VenueWaiterDailySalesEntry[],
): WaiterComparisonPoint[] {
  return buildWaiterComparisonPoints(
    waiters,
    currentEntries,
    previousEntries,
    periodAsph,
    periodAsph,
  );
}

export function buildWaiterGratuityComparison(
  waiters: VenueWaiter[],
  currentEntries: VenueWaiterDailySalesEntry[],
  previousEntries: VenueWaiterDailySalesEntry[],
): WaiterComparisonPoint[] {
  return buildWaiterComparisonPoints(
    waiters,
    currentEntries,
    previousEntries,
    (totals) => totals.gratuity,
    (totals) => totals.gratuity,
  );
}

export function getWaiterInsightsPeriodDateCount(
  periodMode: WaiterInsightsPeriodMode,
  filterKey: string,
): number {
  if (periodMode === "week") return getDatesInIsoWeek(filterKey).length;
  if (periodMode === "month") return getDatesInMonth(filterKey).length;
  return getDatesInYear(filterKey).length;
}
