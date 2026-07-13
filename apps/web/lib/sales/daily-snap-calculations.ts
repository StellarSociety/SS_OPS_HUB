import {
  computeDailySales,
  formatMonthKey,
  getIsoWeekParts,
  grossToNet,
} from "./daily-sales-calculations";
import { computeDailyDiscounts } from "./discounts-calculations";
import type { VenueDailyDiscountsRecord } from "./discounts-types";
import type { VenueDailySalesRecord } from "./daily-sales-types";
import type {
  DailySnapForecastCard,
  DailySnapPeriodComparison,
  DailySnapRevenueCenterRow,
  DailySnapSnapshot,
  DailySnapTenderRow,
  DailySnapVerification,
  DailySnapWaiterRow,
  VenueMonthlyForecast,
} from "./daily-snap-types";
import { get445WeekCountForMonthKey } from "./forecast-445-calendar";
import { getPreviousMonthKey } from "./sales-overview-aggregations";
import { getPreviousWeekFilterKey } from "./waiter-sales-insights-aggregations";
import {
  formatLocalDateFromDate,
  getDatesInIsoWeek,
  getDatesInMonth,
} from "./sales-data-table-dates";
import type { VenueTender } from "./tenders-types";
import { computeWaiterSales } from "./waiter-sales-calculations";
import type { VenueWaiterDailySalesEntry } from "./waiter-sales-types";
import type { VenueWaiter } from "./waiters-types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildForecastCard(input: {
  periodTargetGs: number;
  toDateActualGs: number;
  toDateTargetGs: number;
  hasForecast: boolean;
}): DailySnapForecastCard {
  const { periodTargetGs, toDateActualGs, toDateTargetGs, hasForecast } = input;
  const deviationGs = roundMoney(toDateActualGs - toDateTargetGs);
  const deviationPct =
    hasForecast && toDateTargetGs !== 0
      ? roundMoney((deviationGs / toDateTargetGs) * 100)
      : null;

  return {
    periodTargetGs: roundMoney(periodTargetGs),
    toDateActualGs: roundMoney(toDateActualGs),
    toDateTargetGs: roundMoney(toDateTargetGs),
    deviationGs,
    deviationPct,
    hasForecast,
  };
}

function shiftIsoDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatLocalDateFromDate(date);
}

function buildPeriodComparison(
  currentGs: number,
  previousGs: number,
  hasPreviousData: boolean,
): DailySnapPeriodComparison {
  const differenceGs = roundMoney(currentGs - previousGs);
  const differencePct =
    hasPreviousData && previousGs !== 0
      ? roundMoney((differenceGs / previousGs) * 100)
      : null;

  return {
    currentGs: roundMoney(currentGs),
    previousGs: roundMoney(previousGs),
    differenceGs,
    differencePct,
    hasPreviousData,
  };
}

/** Stored monthly revenue target (gross) for a month, or 0 when unset. */
function getMonthTargetGs(
  forecasts: VenueMonthlyForecast[],
  monthKey: string,
): number {
  const forecast = forecasts.find((row) => row.month_key === monthKey);
  if (!forecast || forecast.forecast_revenue_gs <= 0) return 0;
  return roundMoney(forecast.forecast_revenue_gs);
}

/** Week target = month target split evenly across the month's fiscal (4-4-5) weeks. */
function getWeekTargetGs(
  forecasts: VenueMonthlyForecast[],
  monthKey: string,
): number {
  const monthTargetGs = getMonthTargetGs(forecasts, monthKey);
  if (monthTargetGs <= 0) return 0;
  const fiscalWeekCount = get445WeekCountForMonthKey(monthKey);
  return fiscalWeekCount > 0 ? roundMoney(monthTargetGs / fiscalWeekCount) : 0;
}

/** ISO week filter key (e.g. `2026-W28`) for a given date. */
function getIsoWeekKeyForDate(dateStr: string): string {
  const { week, year } = getIsoWeekParts(dateStr);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * Dynamic daily target for a specific date.
 *
 * The week target is distributed across the seven weekdays using the sales
 * distribution of the previous ISO week: each weekday's target is the week
 * target multiplied by that weekday's share of the previous week's sales. When
 * the previous week has no sales, the week target is split evenly (1/7).
 */
function computeDayTargetGs(
  dateStr: string,
  forecasts: VenueMonthlyForecast[],
  gsForDate: (date: string) => number,
): number {
  const monthKey = formatMonthKey(dateStr);
  const weekTargetGs = getWeekTargetGs(forecasts, monthKey);
  if (weekTargetGs <= 0) return 0;

  const sameWeekdayPrevWeek = shiftIsoDate(dateStr, -7);
  const prevWeekDates = getDatesInIsoWeek(
    getIsoWeekKeyForDate(sameWeekdayPrevWeek),
  );
  const prevWeekTotalGs = prevWeekDates.reduce(
    (sum, date) => sum + gsForDate(date),
    0,
  );

  const share =
    prevWeekTotalGs > 0 ? gsForDate(sameWeekdayPrevWeek) / prevWeekTotalGs : 1 / 7;

  return roundMoney(weekTargetGs * share);
}

function sumDailyRevenueForDates(
  dailyRecords: VenueDailySalesRecord[],
  dates: string[],
  totalTaxPct: number,
): number {
  const dateSet = new Set(dates);
  let total = 0;

  for (const record of dailyRecords) {
    if (!dateSet.has(record.sale_date)) continue;
    total += computeDailySales(record, totalTaxPct).totalVenueGs;
  }

  return roundMoney(total);
}

function buildRevenueCenterRows(
  record: VenueDailySalesRecord,
): DailySnapRevenueCenterRow[] {
  return [
    {
      label: "Food",
      lunchGs: record.lunch_food_gs,
      dinnerGs: record.dinner_food_gs,
      totalGs: record.lunch_food_gs + record.dinner_food_gs,
    },
    {
      label: "Beverages",
      lunchGs: record.lunch_beverages_gs,
      dinnerGs: record.dinner_beverages_gs,
      totalGs: record.lunch_beverages_gs + record.dinner_beverages_gs,
    },
    {
      label: "Wine",
      lunchGs: record.lunch_wine_gs,
      dinnerGs: record.dinner_wine_gs,
      totalGs: record.lunch_wine_gs + record.dinner_wine_gs,
    },
    {
      label: "Shisha",
      lunchGs: record.lunch_shisha_gs,
      dinnerGs: record.dinner_shisha_gs,
      totalGs: record.lunch_shisha_gs + record.dinner_shisha_gs,
    },
    {
      label: "Tobacco",
      lunchGs: record.lunch_tobacco_gs,
      dinnerGs: record.dinner_tobacco_gs,
      totalGs: record.lunch_tobacco_gs + record.dinner_tobacco_gs,
    },
    {
      label: "Others",
      lunchGs: record.lunch_others_gs,
      dinnerGs: record.dinner_others_gs,
      totalGs: record.lunch_others_gs + record.dinner_others_gs,
    },
    {
      label: "Service Fees",
      lunchGs: record.lunch_service_fees_gs,
      dinnerGs: record.dinner_service_fees_gs,
      totalGs: record.lunch_service_fees_gs + record.dinner_service_fees_gs,
    },
  ];
}

function buildDiscountCategoryRows(
  record: VenueDailyDiscountsRecord,
): DailySnapRevenueCenterRow[] {
  return [
    {
      label: "Food",
      lunchGs: 0,
      dinnerGs: 0,
      totalGs: record.food_discount_gs,
    },
    {
      label: "Beverages",
      lunchGs: 0,
      dinnerGs: 0,
      totalGs: record.beverages_discount_gs,
    },
    {
      label: "Wine",
      lunchGs: 0,
      dinnerGs: 0,
      totalGs: record.wine_discount_gs,
    },
    {
      label: "Shisha",
      lunchGs: 0,
      dinnerGs: 0,
      totalGs: record.shisha_discount_gs,
    },
    {
      label: "Others",
      lunchGs: 0,
      dinnerGs: 0,
      totalGs: record.others_discount_gs,
    },
  ];
}

function totalDiscountGsFromRecord(
  record: VenueDailyDiscountsRecord,
  totalTaxPct: number,
): number {
  const computed = computeDailyDiscounts(record, totalTaxPct);
  return (
    computed.totalFoodDiscountGs +
    computed.totalBeveragesDiscountGs +
    computed.totalWineDiscountGs +
    computed.totalShishaDiscountGs +
    computed.totalOthersDiscountGs
  );
}

export function buildDailySnapSnapshot(input: {
  saleDate: string;
  dailyRecord: VenueDailySalesRecord | null;
  discountsRecord: VenueDailyDiscountsRecord | null;
  dailyRecords: VenueDailySalesRecord[];
  waiterRecords: VenueWaiterDailySalesEntry[];
  waiterRecordsForDate: VenueWaiterDailySalesEntry[];
  waiters: VenueWaiter[];
  tenders: VenueTender[];
  forecasts: VenueMonthlyForecast[];
  totalTaxPct: number;
}): DailySnapSnapshot {
  const {
    saleDate,
    dailyRecord,
    discountsRecord,
    dailyRecords,
    waiterRecords,
    waiterRecordsForDate,
    waiters,
    tenders,
    forecasts,
    totalTaxPct,
  } = input;

  const waiterById = new Map(waiters.map((waiter) => [waiter.id, waiter.name]));
  const previousWeekDate = shiftIsoDate(saleDate, -7);
  const waiterEntryByKey = new Map(
    waiterRecords.map((entry) => [`${entry.waiter_id}:${entry.sale_date}`, entry]),
  );

  function trendPct(current: number, previous: number): number | null {
    if (previous === 0) return current === 0 ? 0 : null;
    return roundMoney(((current - previous) / previous) * 100);
  }

  const dailyComputed = dailyRecord
    ? computeDailySales(dailyRecord, totalTaxPct)
    : null;

  const revenueCenters = dailyRecord ? buildRevenueCenterRows(dailyRecord) : [];
  const discountCategories = discountsRecord
    ? buildDiscountCategoryRows(discountsRecord)
    : [];

  const waiterRows: DailySnapWaiterRow[] = waiterRecordsForDate
    .map((entry) => {
      const asph = computeWaiterSales(entry).asph;
      const previousEntry = waiterEntryByKey.get(
        `${entry.waiter_id}:${previousWeekDate}`,
      );
      const previousSalesGs = previousEntry?.total_sales_gs ?? 0;
      const previousAsph = previousEntry
        ? computeWaiterSales(previousEntry).asph
        : null;

      return {
        waiterId: entry.waiter_id,
        waiterName: waiterById.get(entry.waiter_id) ?? "Unknown",
        salesGs: entry.total_sales_gs,
        covers: entry.total_covers,
        asph,
        gratuityCcGs: entry.gratuity_cc_gs,
        gratuityCashGs: entry.gratuity_cash_gs,
        salesSharePct: null,
        salesTrendPct: trendPct(entry.total_sales_gs, previousSalesGs),
        asphTrendPct:
          asph != null && previousAsph != null
            ? trendPct(asph, previousAsph)
            : null,
      };
    })
    .sort((a, b) => a.waiterName.localeCompare(b.waiterName));

  const waiterTotalSalesGs = roundMoney(
    waiterRows.reduce((sum, row) => sum + row.salesGs, 0),
  );
  for (const row of waiterRows) {
    row.salesSharePct =
      waiterTotalSalesGs > 0
        ? roundMoney((row.salesGs / waiterTotalSalesGs) * 100)
        : null;
  }
  const waiterTotalCovers = waiterRows.reduce((sum, row) => sum + row.covers, 0);
  const gratuityCcGs = roundMoney(
    waiterRows.reduce((sum, row) => sum + row.gratuityCcGs, 0),
  );
  const gratuityCashGs = roundMoney(
    waiterRows.reduce((sum, row) => sum + row.gratuityCashGs, 0),
  );

  const tenderTotals = new Map<string, number>();
  for (const entry of waiterRecordsForDate) {
    for (const [tenderId, amount] of Object.entries(entry.tender_amounts)) {
      tenderTotals.set(
        tenderId,
        roundMoney((tenderTotals.get(tenderId) ?? 0) + amount),
      );
    }
  }

  const tenderRows: DailySnapTenderRow[] = tenders
    .filter((tender) => tender.status === "active")
    .map((tender) => ({
      tenderId: tender.id,
      tenderName: tender.name,
      amountGs: tenderTotals.get(tender.id) ?? 0,
    }));

  for (const [tenderId, amountGs] of tenderTotals) {
    if (tenders.some((tender) => tender.id === tenderId)) continue;
    tenderRows.push({
      tenderId,
      tenderName: "Other",
      amountGs,
    });
  }

  const cashTender = tenders.find(
    (tender) => tender.name.toLowerCase() === "cash" && tender.status === "active",
  );
  const cashTenderGs = cashTender
    ? roundMoney(tenderTotals.get(cashTender.id) ?? 0)
    : roundMoney(
        tenderRows
          .filter((row) => row.tenderName.toLowerCase() === "cash")
          .reduce((sum, row) => sum + row.amountGs, 0),
      );

  const monthKey = formatMonthKey(saleDate);
  const dayOfMonth = Number(saleDate.slice(8, 10));

  const dailyGsByDate = new Map<string, number>();
  for (const record of dailyRecords) {
    dailyGsByDate.set(
      record.sale_date,
      computeDailySales(record, totalTaxPct).totalVenueGs,
    );
  }
  const gsForDate = (date: string): number => dailyGsByDate.get(date) ?? 0;

  const { week, year } = getIsoWeekParts(saleDate);
  const weekKey = `${year}-W${String(week).padStart(2, "0")}`;
  const weekDates = getDatesInIsoWeek(weekKey);
  const weekDatesThroughToday = weekDates.filter((date) => date <= saleDate);
  const previousWeekKey = getPreviousWeekFilterKey(weekKey);
  const previousWeekDatesThroughSameDay = getDatesInIsoWeek(previousWeekKey).slice(
    0,
    weekDatesThroughToday.length,
  );

  const dailyActualGs = dailyComputed?.totalVenueGs ?? waiterTotalSalesGs;
  const weeklyActualGs = sumDailyRevenueForDates(
    dailyRecords,
    weekDatesThroughToday,
    totalTaxPct,
  );
  const monthDatesThroughToday = getDatesInMonth(monthKey).filter(
    (date) => date <= saleDate,
  );
  const monthlyActualGs = sumDailyRevenueForDates(
    dailyRecords,
    monthDatesThroughToday,
    totalTaxPct,
  );

  const monthTargetGs = getMonthTargetGs(forecasts, monthKey);
  const weekTargetGs = getWeekTargetGs(forecasts, monthKey);
  const dayTargetGs = computeDayTargetGs(saleDate, forecasts, gsForDate);
  const hasForecast = monthTargetGs > 0;
  const weekToDateTargetGs = roundMoney(
    weekDatesThroughToday.reduce(
      (sum, date) => sum + computeDayTargetGs(date, forecasts, gsForDate),
      0,
    ),
  );
  const monthToDateTargetGs = roundMoney(
    monthDatesThroughToday.reduce(
      (sum, date) => sum + computeDayTargetGs(date, forecasts, gsForDate),
      0,
    ),
  );

  const previousWeekWtdGs = sumDailyRevenueForDates(
    dailyRecords,
    previousWeekDatesThroughSameDay,
    totalTaxPct,
  );
  const previousMonthKey = getPreviousMonthKey(monthKey);
  const previousMonthDatesThroughSameDay = getDatesInMonth(previousMonthKey).slice(
    0,
    Math.min(dayOfMonth, getDatesInMonth(previousMonthKey).length),
  );
  const previousMonthMtdGs = sumDailyRevenueForDates(
    dailyRecords,
    previousMonthDatesThroughSameDay,
    totalTaxPct,
  );
  const weekToDateRevenue = buildPeriodComparison(
    weeklyActualGs,
    previousWeekWtdGs,
    true,
  );
  const monthToDateRevenue = buildPeriodComparison(
    monthlyActualGs,
    previousMonthMtdGs,
    true,
  );

  const totalTendersGs = roundMoney(
    tenderRows.reduce((sum, row) => sum + row.amountGs, 0),
  );
  const tendersNetOfCcGratuityGs = roundMoney(totalTendersGs - gratuityCcGs);
  const totalRevenueGs = dailyActualGs;
  const totalRevenueNetGs = dailyComputed
    ? dailyComputed.totalVenueNet
    : roundMoney(grossToNet(totalRevenueGs, totalTaxPct));
  const lunchRevenueGs = dailyComputed?.lunchTotalGs ?? 0;
  const lunchRevenueNetGs = dailyComputed
    ? dailyComputed.lunchTotalNet
    : roundMoney(grossToNet(lunchRevenueGs, totalTaxPct));
  const dinnerRevenueGs = dailyComputed?.dinnerTotalGs ?? 0;
  const dinnerRevenueNetGs = dailyComputed
    ? dailyComputed.dinnerTotalNet
    : roundMoney(grossToNet(dinnerRevenueGs, totalTaxPct));

  const verification: DailySnapVerification = {
    totalRevenueGs,
    totalTendersGs,
    gratuityCcGs,
    tendersNetOfCcGratuityGs,
    totalWaiterSalesGs: waiterTotalSalesGs,
    revenueVsWaiterDifferenceGs: roundMoney(totalRevenueGs - waiterTotalSalesGs),
    revenueVsTendersNetDifferenceGs: roundMoney(
      totalRevenueGs - tendersNetOfCcGratuityGs,
    ),
    waiterVsTendersNetDifferenceGs: roundMoney(
      waiterTotalSalesGs - tendersNetOfCcGratuityGs,
    ),
    isBalanced:
      roundMoney(totalRevenueGs - waiterTotalSalesGs) === 0 &&
      roundMoney(totalRevenueGs - tendersNetOfCcGratuityGs) === 0 &&
      roundMoney(waiterTotalSalesGs - tendersNetOfCcGratuityGs) === 0,
    hasData:
      Boolean(dailyRecord) ||
      waiterRecordsForDate.length > 0 ||
      totalTendersGs > 0,
  };

  return {
    saleDate,
    hasDailySales: Boolean(dailyRecord),
    hasWaiterSales: waiterRecordsForDate.length > 0,
    hasDiscounts: Boolean(discountsRecord),
    totalRevenueGs,
    totalRevenueNetGs,
    totalCovers: dailyComputed?.totalCovers ?? waiterTotalCovers,
    totalBookings: dailyComputed?.totalBookings ?? 0,
    totalWalkinTables: dailyComputed?.totalWalkinTables ?? 0,
    totalWalkinCovers: dailyComputed?.totalWalkinCovers ?? 0,
    averageSpend:
      dailyComputed?.totalVenueAllDayAsph ??
      (waiterTotalCovers > 0
        ? roundMoney(waiterTotalSalesGs / waiterTotalCovers)
        : null),
    lunchRevenueGs,
    lunchRevenueNetGs,
    dinnerRevenueGs,
    dinnerRevenueNetGs,
    revenueCenters,
    totalDiscountGs: discountsRecord
      ? totalDiscountGsFromRecord(discountsRecord, totalTaxPct)
      : 0,
    discountCategories,
    waiterRows,
    waiterTotalSalesGs,
    waiterTotalCovers,
    gratuityCcGs,
    gratuityCashGs,
    gratuityTotalGs: roundMoney(gratuityCcGs + gratuityCashGs),
    tenderRows,
    cashTenderGs,
    verification,
    dailyForecast: buildForecastCard({
      periodTargetGs: dayTargetGs,
      toDateActualGs: dailyActualGs,
      toDateTargetGs: dayTargetGs,
      hasForecast,
    }),
    weeklyForecast: buildForecastCard({
      periodTargetGs: weekTargetGs,
      toDateActualGs: weeklyActualGs,
      toDateTargetGs: weekToDateTargetGs,
      hasForecast,
    }),
    monthlyForecast: buildForecastCard({
      periodTargetGs: monthTargetGs,
      toDateActualGs: monthlyActualGs,
      toDateTargetGs: monthToDateTargetGs,
      hasForecast,
    }),
    weekToDateRevenue,
    monthToDateRevenue,
  };
}

export function formatDeviation(value: number): string {
  if (value === 0) return "0.00";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDeviationPct(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}
