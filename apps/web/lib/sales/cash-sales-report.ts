import {
  formatMonthLabel,
  getCurrentMonthKey,
  getWeekDayLabel,
} from "@/lib/sales/daily-sales-calculations";
import { getDatesInMonth } from "@/lib/sales/sales-data-table-dates";
import { normalizeTenderName } from "@/lib/sales/tenders-calculations";

export type CashSalesReportDayRow = {
  saleDate: string;
  weekDay: string;
  cashGs: number;
  hasActivity: boolean;
};

export type CashSalesReportMonthSummary = {
  cashGs: number;
  activeDayCount: number;
};

export type CashSalesReportMonth = {
  monthKey: string;
  monthLabel: string;
  rows: CashSalesReportDayRow[];
  summary: CashSalesReportMonthSummary;
};

/** Minimal daily cash tender rows for the report. */
export type CashSalesRecord = {
  sale_date: string;
  amount_gs: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isCashTenderName(name: string): boolean {
  return normalizeTenderName(name) === "cash";
}

export function buildCashSalesReportMonth(
  records: CashSalesRecord[],
  monthKey: string,
): CashSalesReportMonth {
  const byDate = new Map<string, number>();

  for (const record of records) {
    if (!record.sale_date.startsWith(monthKey)) continue;
    byDate.set(
      record.sale_date,
      roundMoney((byDate.get(record.sale_date) ?? 0) + Number(record.amount_gs ?? 0)),
    );
  }

  const rows: CashSalesReportDayRow[] = getDatesInMonth(monthKey).map(
    (saleDate) => {
      const cashGs = byDate.get(saleDate) ?? 0;
      return {
        saleDate,
        weekDay: getWeekDayLabel(saleDate),
        cashGs,
        hasActivity: cashGs > 0 || byDate.has(saleDate),
      };
    },
  );

  const summary = rows.reduce<CashSalesReportMonthSummary>(
    (acc, row) => ({
      cashGs: roundMoney(acc.cashGs + row.cashGs),
      activeDayCount: acc.activeDayCount + (row.hasActivity ? 1 : 0),
    }),
    { cashGs: 0, activeDayCount: 0 },
  );

  return {
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    rows,
    summary,
  };
}

export function listCashSalesReportMonths(
  records: Pick<CashSalesRecord, "sale_date">[],
): string[] {
  const months = new Set<string>();
  months.add(getCurrentMonthKey());

  for (const record of records) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(record.sale_date)) {
      months.add(record.sale_date.slice(0, 7));
    }
  }

  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

export function defaultCashSalesReportMonth(availableMonths: string[]): string {
  const current = getCurrentMonthKey();
  if (availableMonths.includes(current)) return current;
  return availableMonths[0] ?? current;
}
