import {
  enrichDailySalesRows,
  formatIsoWeekLabel,
  getCurrentMonthKey,
  getIsoWeekParts,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import { compareWeekFilterKeys } from "@/lib/sales/sales-data-table-dates";

export type EnrichedDailyRow = ReturnType<typeof enrichDailySalesRows>[number];

export type MonthWeekComparisonPoint = {
  label: string;
  current: number;
  previous: number;
};

export type WeeklyTrendPoint = {
  weekKey: string;
  label: string;
  value: number;
};

export type YearMonthlyTrendPoint = {
  monthKey: string;
  label: string;
  value: number;
};

export type AverageSpendMetric = {
  key: string;
  title: string;
  currentAsph: number | null;
  previousAsph: number | null;
  currentLunchAsph: number | null;
  currentDinnerAsph: number | null;
  previousLunchAsph: number | null;
  previousDinnerAsph: number | null;
  currentCovers: number;
  previousCovers: number;
};

export function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  const previousYear = date.getFullYear();
  const previousMonth = String(date.getMonth() + 1).padStart(2, "0");
  return `${previousYear}-${previousMonth}`;
}

function getWeekOfMonthFromDate(isoDate: string): number {
  const day = Number(isoDate.slice(8, 10));
  return Math.ceil(day / 7);
}

function getDaysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

export function getLatestDailySalesDate(
  rows: EnrichedDailyRow[],
): string | null {
  return rows.reduce<string | null>(
    (latest, row) =>
      latest == null || row.sale_date > latest ? row.sale_date : latest,
    null,
  );
}

function resolveOverviewMtdDay(
  rows: EnrichedDailyRow[],
  currentMonthKey: string,
): number {
  const lastInputDate = getLatestDailySalesDate(rows);
  if (!lastInputDate?.startsWith(currentMonthKey)) return 0;

  return Math.min(
    Number(lastInputDate.slice(8, 10)),
    getDaysInMonth(currentMonthKey),
  );
}

function isRowInMonthMtd(
  row: EnrichedDailyRow,
  monthKey: string,
  mtdDay: number,
): boolean {
  if (!row.sale_date.startsWith(monthKey)) return false;
  const day = Number(row.sale_date.slice(8, 10));
  const maxDay = Math.min(mtdDay, getDaysInMonth(monthKey));
  return day >= 1 && day <= maxDay;
}

function sumRowsInMonthMtd(
  rows: EnrichedDailyRow[],
  monthKey: string,
  mtdDay: number,
  getValue: (row: EnrichedDailyRow) => number,
): number {
  return rows.reduce((sum, row) => {
    if (!isRowInMonthMtd(row, monthKey, mtdDay)) return sum;
    return sum + getValue(row);
  }, 0);
}

function sumCoversInMonthMtd(
  rows: EnrichedDailyRow[],
  monthKey: string,
  mtdDay: number,
): number {
  return sumRowsInMonthMtd(rows, monthKey, mtdDay, (row) => row.totalCovers);
}

function sumServiceAsphInMonthMtd(
  rows: EnrichedDailyRow[],
  monthKey: string,
  mtdDay: number,
  getGross: (row: EnrichedDailyRow) => number,
  getCovers: (row: EnrichedDailyRow) => number,
): number | null {
  let gross = 0;
  let covers = 0;

  for (const row of rows) {
    if (!isRowInMonthMtd(row, monthKey, mtdDay)) continue;
    gross += getGross(row);
    covers += getCovers(row);
  }

  return periodAsph(gross, covers);
}

function varianceGapToBeat(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null;
  if (current >= previous) return null;
  return previous - current;
}

function varianceSurplus(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current == null || previous == null) return null;
  if (current <= previous) return null;
  return current - previous;
}

export function formatMtdDayRange(mtdDay: number, monthKey: string): string {
  if (mtdDay <= 0) return "No data";
  const maxDay = Math.min(mtdDay, getDaysInMonth(monthKey));
  return maxDay === 1 ? "Day 1" : `Days 1–${maxDay}`;
}

function sumRowsInMonth(
  rows: EnrichedDailyRow[],
  monthKey: string,
  getValue: (row: EnrichedDailyRow) => number,
): number {
  return rows.reduce((sum, row) => {
    if (!row.sale_date.startsWith(monthKey)) return sum;
    return sum + getValue(row);
  }, 0);
}

function sumCoversInMonth(rows: EnrichedDailyRow[], monthKey: string): number {
  return sumRowsInMonth(rows, monthKey, (row) => row.totalCovers);
}

function periodAsph(gross: number, covers: number): number | null {
  if (covers <= 0) return null;
  return gross / covers;
}

function periodAps(covers: number, bookings: number): number | null {
  if (bookings <= 0) return null;
  return covers / bookings;
}

export function buildMonthWeekComparison(
  rows: EnrichedDailyRow[],
  currentMonthKey: string,
  previousMonthKey: string,
): MonthWeekComparisonPoint[] {
  const currentByWeek = new Map<number, number>();
  const previousByWeek = new Map<number, number>();

  for (const row of rows) {
    const week = getWeekOfMonthFromDate(row.sale_date);
    if (row.sale_date.startsWith(currentMonthKey)) {
      currentByWeek.set(
        week,
        (currentByWeek.get(week) ?? 0) + row.totalVenueGs,
      );
    }
    if (row.sale_date.startsWith(previousMonthKey)) {
      previousByWeek.set(
        week,
        (previousByWeek.get(week) ?? 0) + row.totalVenueGs,
      );
    }
  }

  const weekNumbers = new Set([
    ...currentByWeek.keys(),
    ...previousByWeek.keys(),
  ]);

  return Array.from(weekNumbers)
    .sort((a, b) => a - b)
    .map((week) => ({
      label: `W${week}`,
      current: currentByWeek.get(week) ?? 0,
      previous: previousByWeek.get(week) ?? 0,
    }));
}

export function buildWeeklySalesTrend(
  rows: EnrichedDailyRow[],
  weekCount = 12,
): WeeklyTrendPoint[] {
  const totalsByWeek = new Map<string, number>();

  for (const row of rows) {
    const { week, year } = getIsoWeekParts(row.sale_date);
    const weekKey = `${year}-W${String(week).padStart(2, "0")}`;
    totalsByWeek.set(
      weekKey,
      (totalsByWeek.get(weekKey) ?? 0) + row.totalVenueGs,
    );
  }

  const sortedWeekKeys = Array.from(totalsByWeek.keys()).sort(compareWeekFilterKeys);
  const recentWeekKeys = sortedWeekKeys.slice(0, weekCount).reverse();

  return recentWeekKeys.map((weekKey) => {
    const parsed = /^(\d{4})-W(\d{2})$/.exec(weekKey);
    const label =
      parsed != null
        ? formatIsoWeekLabel(Number(parsed[1]), Number(parsed[2]))
        : weekKey;
    return {
      weekKey,
      label: label.replace(/^Week \d+ · /, "W").replace(" · ", " "),
      value: totalsByWeek.get(weekKey) ?? 0,
    };
  });
}

function formatShortMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1)
    .toLocaleString(undefined, { month: "short" })
    .toUpperCase();
}

function resolveOverviewYear(rows: EnrichedDailyRow[]): number {
  const lastInputDate = getLatestDailySalesDate(rows);
  if (lastInputDate) return Number(lastInputDate.slice(0, 4));
  return new Date().getFullYear();
}

function resolveYearToDateEndMonth(
  rows: EnrichedDailyRow[],
  year: number,
): number {
  const lastInputDate = getLatestDailySalesDate(rows);
  if (lastInputDate?.startsWith(String(year))) {
    return Number(lastInputDate.slice(5, 7));
  }

  const currentMonthKey = getCurrentMonthKey();
  if (currentMonthKey.startsWith(String(year))) {
    return Number(currentMonthKey.slice(5, 7));
  }

  return 12;
}

export function buildYearToDateMonthlyTrend(
  rows: EnrichedDailyRow[],
): { year: number; points: YearMonthlyTrendPoint[] } {
  const year = resolveOverviewYear(rows);
  const endMonth = resolveYearToDateEndMonth(rows, year);
  const totalsByMonth = new Map<string, number>();

  for (const row of rows) {
    if (!row.sale_date.startsWith(String(year))) continue;
    const monthKey = row.sale_date.slice(0, 7);
    totalsByMonth.set(
      monthKey,
      (totalsByMonth.get(monthKey) ?? 0) + row.totalVenueGs,
    );
  }

  const points = Array.from({ length: endMonth }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    const monthKey = `${year}-${month}`;
    return {
      monthKey,
      label: formatShortMonthLabel(monthKey),
      value: totalsByMonth.get(monthKey) ?? 0,
    };
  });

  return { year, points };
}

export function buildAverageSpendInsights(
  rows: EnrichedDailyRow[],
  currentMonthKey: string,
  previousMonthKey: string,
  mtdDay?: number,
): AverageSpendMetric[] {
  const resolvedMtdDay =
    mtdDay ?? resolveOverviewMtdDay(rows, currentMonthKey);

  const metrics: Array<{
    key: string;
    title: string;
    getGross: (row: EnrichedDailyRow) => number;
    getLunchGross: (row: EnrichedDailyRow) => number;
    getDinnerGross: (row: EnrichedDailyRow) => number;
  }> = [
    {
      key: "venue",
      title: "Venue",
      getGross: (row) => row.totalVenueGs,
      getLunchGross: (row) => row.lunchTotalGs,
      getDinnerGross: (row) => row.dinnerTotalGs,
    },
    {
      key: "food",
      title: "Food",
      getGross: (row) => row.totalFoodGs,
      getLunchGross: (row) => row.lunch_food_gs,
      getDinnerGross: (row) => row.dinner_food_gs,
    },
    {
      key: "beverages",
      title: "Beverages",
      getGross: (row) => row.totalBeveragesGs,
      getLunchGross: (row) => row.lunch_beverages_gs,
      getDinnerGross: (row) => row.dinner_beverages_gs,
    },
    {
      key: "wine",
      title: "Wine",
      getGross: (row) => row.totalWineGs,
      getLunchGross: (row) => row.lunch_wine_gs,
      getDinnerGross: (row) => row.dinner_wine_gs,
    },
    {
      key: "shishaTobacco",
      title: "Shisha & Tobacco",
      getGross: (row) => row.totalShishaGs + row.totalTobaccoGs,
      getLunchGross: (row) => row.lunch_shisha_gs + row.lunch_tobacco_gs,
      getDinnerGross: (row) => row.dinner_shisha_gs + row.dinner_tobacco_gs,
    },
  ];

  return metrics.map(({ key, title, getGross, getLunchGross, getDinnerGross }) => {
    const currentGross = sumRowsInMonthMtd(
      rows,
      currentMonthKey,
      resolvedMtdDay,
      getGross,
    );
    const previousGross = sumRowsInMonthMtd(
      rows,
      previousMonthKey,
      resolvedMtdDay,
      getGross,
    );
    const currentCovers = sumCoversInMonthMtd(
      rows,
      currentMonthKey,
      resolvedMtdDay,
    );
    const previousCovers = sumCoversInMonthMtd(
      rows,
      previousMonthKey,
      resolvedMtdDay,
    );

    return {
      key,
      title,
      currentAsph: periodAsph(currentGross, currentCovers),
      previousAsph: periodAsph(previousGross, previousCovers),
      currentLunchAsph: sumServiceAsphInMonthMtd(
        rows,
        currentMonthKey,
        resolvedMtdDay,
        getLunchGross,
        (row) => row.lunch_covers,
      ),
      currentDinnerAsph: sumServiceAsphInMonthMtd(
        rows,
        currentMonthKey,
        resolvedMtdDay,
        getDinnerGross,
        (row) => row.dinner_covers,
      ),
      previousLunchAsph: sumServiceAsphInMonthMtd(
        rows,
        previousMonthKey,
        resolvedMtdDay,
        getLunchGross,
        (row) => row.lunch_covers,
      ),
      previousDinnerAsph: sumServiceAsphInMonthMtd(
        rows,
        previousMonthKey,
        resolvedMtdDay,
        getDinnerGross,
        (row) => row.dinner_covers,
      ),
      currentCovers,
      previousCovers,
    };
  });
}

export function buildOverviewHeadlineStats(
  rows: EnrichedDailyRow[],
  currentMonthKey: string,
  previousMonthKey: string,
) {
  const lastInputDate = getLatestDailySalesDate(rows);
  const mtdDay = resolveOverviewMtdDay(rows, currentMonthKey);
  const previousMtdDay = Math.min(mtdDay, getDaysInMonth(previousMonthKey));

  const currentGross = sumRowsInMonthMtd(
    rows,
    currentMonthKey,
    mtdDay,
    (row) => row.totalVenueGs,
  );
  const previousGross = sumRowsInMonthMtd(
    rows,
    previousMonthKey,
    mtdDay,
    (row) => row.totalVenueGs,
  );
  const currentCovers = sumCoversInMonthMtd(rows, currentMonthKey, mtdDay);
  const previousCovers = sumCoversInMonthMtd(rows, previousMonthKey, mtdDay);
  const currentBookings = sumRowsInMonthMtd(
    rows,
    currentMonthKey,
    mtdDay,
    (row) => row.totalBookings,
  );
  const previousBookings = sumRowsInMonthMtd(
    rows,
    previousMonthKey,
    mtdDay,
    (row) => row.totalBookings,
  );

  const currentVenueAsph = periodAsph(currentGross, currentCovers);
  const previousVenueAsph = periodAsph(previousGross, previousCovers);
  const currentAps = periodAps(currentCovers, currentBookings);
  const previousAps = periodAps(previousCovers, previousBookings);

  return {
    currentMonthKey,
    previousMonthKey,
    lastInputDate,
    mtdDay,
    previousMtdDay,
    currentGross,
    previousGross,
    currentVenueAsph,
    previousVenueAsph,
    currentAps,
    previousAps,
    currentCovers,
    previousCovers,
    grossGapToBeat: varianceGapToBeat(currentGross, previousGross),
    grossSurplus: varianceSurplus(currentGross, previousGross),
    venueAsphGapToBeat: varianceGapToBeat(currentVenueAsph, previousVenueAsph),
    venueAsphSurplus: varianceSurplus(currentVenueAsph, previousVenueAsph),
    coversGapToBeat: varianceGapToBeat(currentCovers, previousCovers),
    coversSurplus: varianceSurplus(currentCovers, previousCovers),
    apsGapToBeat: varianceGapToBeat(currentAps, previousAps),
    apsSurplus: varianceSurplus(currentAps, previousAps),
  };
}

export function enrichOverviewRows(
  records: VenueDailySalesRecord[],
  totalTaxPct: number,
): EnrichedDailyRow[] {
  return enrichDailySalesRows(records, totalTaxPct);
}

export function defaultOverviewMonthKey(): string {
  return getCurrentMonthKey();
}
