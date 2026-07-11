import { computeDailySales } from "./daily-sales-calculations";
import { getLocalTodayIsoDate } from "./sales-entry-dates";
import type { VenueDailySalesRecord } from "./daily-sales-types";
import type { VenueDailyDiscountsRecord } from "./discounts-types";
import type { VenueWaiterDailySalesEntry } from "./waiter-sales-types";
import type { VenueWaiter } from "./waiters-types";

export type SalesEntryStatusWaiter = {
  name: string;
  salesGs: number;
};

export type SalesEntryStatusDay = {
  isoDate: string;
  ddmm: string;
  dailySales: {
    hasEntry: boolean;
    lunchGs: number;
    dinnerGs: number;
  };
  waiterSales: {
    hasEntry: boolean;
    waiters: SalesEntryStatusWaiter[];
  };
  dailyVsWaiters: {
    hasData: boolean;
    coversDiff: number;
    revenueDiff: number;
  };
  discounts: {
    hasEntry: boolean;
    totalGs: number;
    discrepancyGs: number;
  };
  dailySnap: {
    hasReport: boolean;
    editorName: string | null;
  };
};

export type SnapReportStatusForDay = {
  hasReport: boolean;
  editorName: string | null;
};

function lastNDates(todayIso: string, count: number): string[] {
  const [year, month, day] = todayIso.split("-").map(Number);
  const base = new Date(year, month - 1, day);
  const dates: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() - i);
    dates.push(getLocalTodayIsoDate(date));
  }
  return dates;
}

function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

export function getSalesEntryStatusDates(
  count = 10,
  todayIso = getLocalTodayIsoDate(),
): string[] {
  return lastNDates(todayIso, count);
}

export function buildSalesEntryStatusDays(input: {
  dailyRecords: VenueDailySalesRecord[];
  waiterRecords: VenueWaiterDailySalesEntry[];
  waiters: VenueWaiter[];
  discountsRecords: VenueDailyDiscountsRecord[];
  snapStatusByDate: Map<string, SnapReportStatusForDay>;
  totalTaxPct: number;
  count?: number;
  todayIso?: string;
}): SalesEntryStatusDay[] {
  const {
    dailyRecords,
    waiterRecords,
    waiters,
    discountsRecords,
    snapStatusByDate,
    totalTaxPct,
    count = 10,
    todayIso = getLocalTodayIsoDate(),
  } = input;

  const dailyByDate = new Map(
    dailyRecords.map((record) => [record.sale_date, record]),
  );
  const discountsByDate = new Map(
    discountsRecords.map((record) => [record.sale_date, record]),
  );
  const waiterNameById = new Map(
    waiters.map((waiter) => [waiter.id, waiter.name]),
  );

  const waiterSalesByDate = new Map<
    string,
    { waiters: Map<string, number>; covers: number; grossSales: number }
  >();
  for (const entry of waiterRecords) {
    const current =
      waiterSalesByDate.get(entry.sale_date) ??
      { waiters: new Map<string, number>(), covers: 0, grossSales: 0 };
    const prevSales = current.waiters.get(entry.waiter_id) ?? 0;
    current.waiters.set(
      entry.waiter_id,
      prevSales + Number(entry.total_sales_gs),
    );
    current.covers += Number(entry.total_covers);
    current.grossSales += Number(entry.total_sales_gs);
    waiterSalesByDate.set(entry.sale_date, current);
  }

  return lastNDates(todayIso, count).map((isoDate) => {
    const dailyRecord = dailyByDate.get(isoDate);
    const dailyComputed = dailyRecord
      ? computeDailySales(dailyRecord, totalTaxPct)
      : null;

    const waiterTotals = waiterSalesByDate.get(isoDate);
    const waiterList: SalesEntryStatusWaiter[] = waiterTotals
      ? Array.from(waiterTotals.waiters.entries())
          .map(([waiterId, salesGs]) => ({
            name: waiterNameById.get(waiterId) ?? "Unknown waiter",
            salesGs,
          }))
          .sort((a, b) => b.salesGs - a.salesGs)
      : [];

    const dailyCovers = dailyComputed?.totalCovers ?? 0;
    const dailyGross = dailyComputed?.totalVenueGs ?? 0;
    const waiterCovers = waiterTotals?.covers ?? 0;
    const waiterGross = waiterTotals?.grossSales ?? 0;

    const discountRecord = discountsByDate.get(isoDate);
    const discountsTotal = discountRecord
      ? discountRecord.food_discount_gs +
        discountRecord.beverages_discount_gs +
        discountRecord.wine_discount_gs +
        discountRecord.shisha_discount_gs +
        discountRecord.others_discount_gs
      : 0;
    const allDayDiscount = dailyRecord?.all_day_discount_gs ?? 0;
    const discrepancy =
      Math.round((discountsTotal - allDayDiscount) * 100) / 100;

    const snapStatus = snapStatusByDate.get(isoDate);

    return {
      isoDate,
      ddmm: formatDayMonth(isoDate),
      dailySales: {
        hasEntry: Boolean(dailyRecord),
        lunchGs: dailyComputed?.lunchTotalGs ?? 0,
        dinnerGs: dailyComputed?.dinnerTotalGs ?? 0,
      },
      waiterSales: {
        hasEntry: waiterList.length > 0,
        waiters: waiterList,
      },
      dailyVsWaiters: {
        hasData: Boolean(dailyRecord) || Boolean(waiterTotals),
        coversDiff: dailyCovers - waiterCovers,
        revenueDiff: dailyGross - waiterGross,
      },
      discounts: {
        hasEntry: Boolean(discountRecord),
        totalGs: discountsTotal,
        discrepancyGs: discrepancy,
      },
      dailySnap: {
        hasReport: snapStatus?.hasReport ?? false,
        editorName: snapStatus?.editorName ?? null,
      },
    };
  });
}
