import {
  getIsoWeekParts,
  getWeekDayLabel,
} from "@/lib/sales/daily-sales-calculations";
import { computeDailyDiscounts } from "@/lib/sales/discounts-calculations";
import type {
  VenueDailyDiscountsRecord,
  VenueDailyDiscountsRow,
} from "@/lib/sales/discounts-types";

export type PeriodMode = "week" | "month" | "year";

export type DiscountsEnrichedRow = VenueDailyDiscountsRow;

export type DiscountCategoryMetric = {
  key: string;
  title: string;
  color: string;
  getValue: (row: DiscountsEnrichedRow) => number;
};

export const TOTAL_DISCOUNTS_METRIC: DiscountCategoryMetric = {
  key: "totalDiscountGs",
  title: "Total Discounts",
  color: "#3D421F",
  getValue: getTotalDiscountGs,
};

export const DISCOUNT_CATEGORY_METRICS: DiscountCategoryMetric[] = [
  {
    key: "totalFoodDiscountGs",
    title: "Food",
    color: "#5C6330",
    getValue: (row) => row.totalFoodDiscountGs,
  },
  {
    key: "totalBeveragesDiscountGs",
    title: "Beverages",
    color: "#7A8240",
    getValue: (row) => row.totalBeveragesDiscountGs,
  },
  {
    key: "totalWineDiscountGs",
    title: "Wine",
    color: "#98A050",
    getValue: (row) => row.totalWineDiscountGs,
  },
  {
    key: "totalShishaDiscountGs",
    title: "Shisha",
    color: "#B6BE68",
    getValue: (row) => row.totalShishaDiscountGs,
  },
  {
    key: "totalOthersDiscountGs",
    title: "Other",
    color: "#D4D8BC",
    getValue: (row) => row.totalOthersDiscountGs,
  },
];

export function enrichDiscountsRows(
  records: VenueDailyDiscountsRecord[],
  totalTaxPct: number,
): DiscountsEnrichedRow[] {
  return records.map((record) => ({
    ...record,
    ...computeDailyDiscounts(record, totalTaxPct),
  }));
}

export function getTotalDiscountGs(row: DiscountsEnrichedRow): number {
  return (
    row.totalFoodDiscountGs +
    row.totalBeveragesDiscountGs +
    row.totalWineDiscountGs +
    row.totalShishaDiscountGs +
    row.totalOthersDiscountGs
  );
}

export function getPeriodBucketKey(
  saleDate: string,
  periodMode: PeriodMode,
): string {
  if (periodMode === "week") {
    const { week, year } = getIsoWeekParts(saleDate);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }
  if (periodMode === "month") {
    return saleDate.slice(0, 7);
  }
  return saleDate.slice(0, 4);
}

export function buildHistoricalPeriodAverage(
  allRows: DiscountsEnrichedRow[],
  periodMode: PeriodMode,
  getValue: (row: DiscountsEnrichedRow) => number,
): number {
  const buckets = new Map<string, number>();
  for (const row of allRows) {
    const key = getPeriodBucketKey(row.sale_date, periodMode);
    buckets.set(key, (buckets.get(key) ?? 0) + getValue(row));
  }

  const bucketTotals = Array.from(buckets.values());
  if (bucketTotals.length === 0) return 0;
  return bucketTotals.reduce((sum, value) => sum + value, 0) / bucketTotals.length;
}

export function buildHistoricalWeekdayAverages(
  allRows: DiscountsEnrichedRow[],
  getValue: (row: DiscountsEnrichedRow) => number,
): Record<string, number> {
  const totals = new Map<string, number>();
  const counts = new Map<string, number>();

  for (const row of allRows) {
    const weekday = getWeekDayLabel(row.sale_date);
    totals.set(weekday, (totals.get(weekday) ?? 0) + getValue(row));
    counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
  }

  const averages: Record<string, number> = {};
  for (const [weekday, total] of totals) {
    const count = counts.get(weekday) ?? 0;
    averages[weekday] = count > 0 ? total / count : 0;
  }
  return averages;
}

export function buildHistoricalMonthAverages(
  allRows: DiscountsEnrichedRow[],
  getValue: (row: DiscountsEnrichedRow) => number,
): Record<string, number> {
  const monthYearTotals = new Map<string, number>();
  for (const row of allRows) {
    const monthKey = row.sale_date.slice(0, 7);
    monthYearTotals.set(monthKey, (monthYearTotals.get(monthKey) ?? 0) + getValue(row));
  }

  const totalsByMonthNumber = new Map<string, number[]>();
  for (const [monthKey, total] of monthYearTotals) {
    const monthNumber = monthKey.slice(5, 7);
    const existing = totalsByMonthNumber.get(monthNumber) ?? [];
    existing.push(total);
    totalsByMonthNumber.set(monthNumber, existing);
  }

  const averages: Record<string, number> = {};
  for (const [monthNumber, totals] of totalsByMonthNumber) {
    averages[monthNumber] =
      totals.reduce((sum, value) => sum + value, 0) / totals.length;
  }
  return averages;
}

export function computeComparisonPct(
  current: number,
  average: number,
): number | null {
  if (average <= 0) {
    if (current <= 0) return null;
    return 100;
  }
  return ((current - average) / average) * 100;
}

export type CategoryPeriodSummary = {
  name: string;
  color: string;
  periodTotal: number;
  historicalAverage: number;
  comparisonPct: number | null;
};

export function buildCategoryPeriodSummaries(
  allRows: DiscountsEnrichedRow[],
  periodMode: PeriodMode,
  categoryPeriodTotals: Array<{ title: string; color: string; periodTotal: number }>,
): CategoryPeriodSummary[] {
  if (allRows.length === 0) return [];

  return DISCOUNT_CATEGORY_METRICS.map((metric) => {
    const buckets = new Map<string, number>();
    for (const row of allRows) {
      const key = getPeriodBucketKey(row.sale_date, periodMode);
      buckets.set(key, (buckets.get(key) ?? 0) + metric.getValue(row));
    }

    const bucketTotals = Array.from(buckets.values());
    const historicalAverage =
      bucketTotals.length > 0
        ? bucketTotals.reduce((sum, value) => sum + value, 0) / bucketTotals.length
        : 0;

    const categoryTotal =
      categoryPeriodTotals.find((category) => category.title === metric.title)
        ?.periodTotal ?? 0;

    return {
      name: metric.title,
      color: metric.color,
      periodTotal: categoryTotal,
      historicalAverage,
      comparisonPct: computeComparisonPct(categoryTotal, historicalAverage),
    };
  });
}
