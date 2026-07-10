import {
  computeDailySales,
  getIsoWeekNumber,
  getWeekDayLabel,
} from "./daily-sales-calculations";
import type { VenueDailySalesRecord } from "./daily-sales-types";
import type { VenueWaiterDailySalesEntry } from "./waiter-sales-types";

export type DailyVsWaitersDayRow = {
  sale_date: string;
  weekNumber: number;
  weekDay: string;
  dailyCovers: number;
  waiterCovers: number;
  coversDifference: number;
  dailyGrossSales: number;
  waiterGrossSales: number;
  grossSalesDifference: number;
  hasDailyRecord: boolean;
  hasWaiterRecords: boolean;
  isMatched: boolean;
};

export type DailyVsWaitersMonthSummary = {
  dailyCovers: number;
  waiterCovers: number;
  coversDifference: number;
  dailyGrossSales: number;
  waiterGrossSales: number;
  grossSalesDifference: number;
  matchedDays: number;
  discrepancyDays: number;
};

export function getDatesInMonth(monthKey: string): string[] {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStr = String(month).padStart(2, "0");

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${year}-${monthStr}-${day}`;
  });
}

export function aggregateWaiterSalesByDate(
  records: VenueWaiterDailySalesEntry[],
): Map<string, { covers: number; grossSales: number }> {
  const byDate = new Map<string, { covers: number; grossSales: number }>();

  for (const record of records) {
    const current = byDate.get(record.sale_date) ?? { covers: 0, grossSales: 0 };
    current.covers += Number(record.total_covers);
    current.grossSales += Number(record.total_sales_gs);
    byDate.set(record.sale_date, current);
  }

  return byDate;
}

export function buildDailyVsWaitersRows(
  monthKey: string,
  dailyRecords: VenueDailySalesRecord[],
  waiterRecords: VenueWaiterDailySalesEntry[],
  totalTaxPct: number,
): DailyVsWaitersDayRow[] {
  const dailyByDate = new Map(
    dailyRecords.map((record) => [record.sale_date, record]),
  );
  const waiterByDate = aggregateWaiterSalesByDate(waiterRecords);

  return getDatesInMonth(monthKey).map((saleDate) => {
    const dailyRecord = dailyByDate.get(saleDate);
    const waiterTotals = waiterByDate.get(saleDate) ?? {
      covers: 0,
      grossSales: 0,
    };

    const dailyComputed = dailyRecord
      ? computeDailySales(dailyRecord, totalTaxPct)
      : null;
    const dailyCovers = dailyComputed?.totalCovers ?? 0;
    const dailyGrossSales = dailyComputed?.totalVenueGs ?? 0;

    const coversDifference = dailyCovers - waiterTotals.covers;
    const grossSalesDifference = dailyGrossSales - waiterTotals.grossSales;

    return {
      sale_date: saleDate,
      weekNumber: getIsoWeekNumber(saleDate),
      weekDay: getWeekDayLabel(saleDate),
      dailyCovers,
      waiterCovers: waiterTotals.covers,
      coversDifference,
      dailyGrossSales,
      waiterGrossSales: waiterTotals.grossSales,
      grossSalesDifference,
      hasDailyRecord: Boolean(dailyRecord),
      hasWaiterRecords: waiterByDate.has(saleDate),
      isMatched: coversDifference === 0 && grossSalesDifference === 0,
    };
  });
}

export function summarizeDailyVsWaitersRows(
  rows: DailyVsWaitersDayRow[],
): DailyVsWaitersMonthSummary {
  const activeRows = rows.filter(
    (row) => row.hasDailyRecord || row.hasWaiterRecords,
  );

  const summary = activeRows.reduce(
    (acc, row) => ({
      dailyCovers: acc.dailyCovers + row.dailyCovers,
      waiterCovers: acc.waiterCovers + row.waiterCovers,
      coversDifference: acc.coversDifference + row.coversDifference,
      dailyGrossSales: acc.dailyGrossSales + row.dailyGrossSales,
      waiterGrossSales: acc.waiterGrossSales + row.waiterGrossSales,
      grossSalesDifference:
        acc.grossSalesDifference + row.grossSalesDifference,
      matchedDays: acc.matchedDays + (row.isMatched ? 1 : 0),
      discrepancyDays: acc.discrepancyDays + (row.isMatched ? 0 : 1),
    }),
    {
      dailyCovers: 0,
      waiterCovers: 0,
      coversDifference: 0,
      dailyGrossSales: 0,
      waiterGrossSales: 0,
      grossSalesDifference: 0,
      matchedDays: 0,
      discrepancyDays: 0,
    },
  );

  return summary;
}
