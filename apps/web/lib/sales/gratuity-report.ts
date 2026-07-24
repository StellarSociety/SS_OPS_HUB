import {
  formatMonthLabel,
  getCurrentMonthKey,
  getWeekDayLabel,
} from "@/lib/sales/daily-sales-calculations";
import { getDatesInMonth } from "@/lib/sales/sales-data-table-dates";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";

export type GratuityReportDayRow = {
  saleDate: string;
  weekDay: string;
  cashGs: number;
  ccGs: number;
  totalGs: number;
  hasActivity: boolean;
};

export type GratuityReportMonthSummary = {
  cashGs: number;
  ccGs: number;
  totalGs: number;
  activeDayCount: number;
};

export type GratuityReportMonth = {
  monthKey: string;
  monthLabel: string;
  rows: GratuityReportDayRow[];
  summary: GratuityReportMonthSummary;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildGratuityReportMonth(
  waiterRecords: Pick<
    VenueWaiterDailySalesEntry,
    "sale_date" | "gratuity_cash_gs" | "gratuity_cc_gs"
  >[],
  monthKey: string,
): GratuityReportMonth {
  const byDate = new Map<string, { cashGs: number; ccGs: number }>();

  for (const record of waiterRecords) {
    if (!record.sale_date.startsWith(monthKey)) continue;
    const current = byDate.get(record.sale_date) ?? { cashGs: 0, ccGs: 0 };
    current.cashGs = roundMoney(
      current.cashGs + Number(record.gratuity_cash_gs ?? 0),
    );
    current.ccGs = roundMoney(
      current.ccGs + Number(record.gratuity_cc_gs ?? 0),
    );
    byDate.set(record.sale_date, current);
  }

  const rows: GratuityReportDayRow[] = getDatesInMonth(monthKey).map(
    (saleDate) => {
      const totals = byDate.get(saleDate) ?? { cashGs: 0, ccGs: 0 };
      const totalGs = roundMoney(totals.cashGs + totals.ccGs);
      return {
        saleDate,
        weekDay: getWeekDayLabel(saleDate),
        cashGs: totals.cashGs,
        ccGs: totals.ccGs,
        totalGs,
        hasActivity: totalGs > 0 || byDate.has(saleDate),
      };
    },
  );

  const summary = rows.reduce<GratuityReportMonthSummary>(
    (acc, row) => ({
      cashGs: roundMoney(acc.cashGs + row.cashGs),
      ccGs: roundMoney(acc.ccGs + row.ccGs),
      totalGs: roundMoney(acc.totalGs + row.totalGs),
      activeDayCount: acc.activeDayCount + (row.hasActivity ? 1 : 0),
    }),
    { cashGs: 0, ccGs: 0, totalGs: 0, activeDayCount: 0 },
  );

  return {
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    rows,
    summary,
  };
}

export function listGratuityReportMonths(
  waiterRecords: Pick<VenueWaiterDailySalesEntry, "sale_date">[],
): string[] {
  const months = new Set<string>();
  months.add(getCurrentMonthKey());

  for (const record of waiterRecords) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(record.sale_date)) {
      months.add(record.sale_date.slice(0, 7));
    }
  }

  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

export function defaultGratuityReportMonth(availableMonths: string[]): string {
  const current = getCurrentMonthKey();
  if (availableMonths.includes(current)) return current;
  return availableMonths[0] ?? current;
}
