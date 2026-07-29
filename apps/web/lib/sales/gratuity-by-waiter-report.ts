import {
  formatMonthLabel,
  getWeekDayLabel,
} from "@/lib/sales/daily-sales-calculations";
import { getDatesInMonth } from "@/lib/sales/sales-data-table-dates";
import type { VenueWaiterGratuityRow } from "@/lib/sales/waiter-sales-store";

export type GratuityByWaiterContributorRow = {
  waiterId: string;
  waiterName: string;
  cashGs: number;
  ccGs: number;
  totalGs: number;
};

export type GratuityByWaiterDayRow = {
  saleDate: string;
  weekDay: string;
  cashGs: number;
  ccGs: number;
  totalGs: number;
  hasActivity: boolean;
  contributors: GratuityByWaiterContributorRow[];
};

export type GratuityByWaiterMonthSummary = {
  cashGs: number;
  ccGs: number;
  totalGs: number;
  activeDayCount: number;
  contributorCount: number;
};

export type GratuityByWaiterReportMonth = {
  monthKey: string;
  monthLabel: string;
  rows: GratuityByWaiterDayRow[];
  summary: GratuityByWaiterMonthSummary;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export const GRATUITY_BY_WAITER_ALL = "all";

export type GratuityByWaiterOption = {
  id: string;
  name: string;
};

/** Waiters who appear in the given month (or all months if monthKey omitted). */
export function listGratuityByWaiterOptions(
  waiterRecords: VenueWaiterGratuityRow[],
  monthKey?: string,
): GratuityByWaiterOption[] {
  const byId = new Map<string, string>();

  for (const record of waiterRecords) {
    if (monthKey && !record.sale_date.startsWith(monthKey)) continue;
    if (!byId.has(record.waiter_id)) {
      byId.set(record.waiter_id, record.waiter_name?.trim() || "Unknown");
    }
  }

  return Array.from(byId.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

export type BuildGratuityByWaiterReportOptions = {
  /** When set, only include this waiter's gratuity. */
  waiterId?: string | null;
  /** Drop days with no tip activity (default when filtering a single waiter). */
  omitEmptyDays?: boolean;
};

export function buildGratuityByWaiterReportMonth(
  waiterRecords: VenueWaiterGratuityRow[],
  monthKey: string,
  options: BuildGratuityByWaiterReportOptions = {},
): GratuityByWaiterReportMonth {
  const waiterFilter =
    options.waiterId && options.waiterId !== GRATUITY_BY_WAITER_ALL
      ? options.waiterId
      : null;
  const omitEmptyDays =
    options.omitEmptyDays ?? Boolean(waiterFilter);

  const byDate = new Map<
    string,
    Map<string, GratuityByWaiterContributorRow>
  >();
  const contributorIds = new Set<string>();

  for (const record of waiterRecords) {
    if (!record.sale_date.startsWith(monthKey)) continue;
    if (waiterFilter && record.waiter_id !== waiterFilter) continue;

    const cashGs = roundMoney(Number(record.gratuity_cash_gs ?? 0));
    const ccGs = roundMoney(Number(record.gratuity_cc_gs ?? 0));
    const waiterId = record.waiter_id;
    const waiterName = record.waiter_name?.trim() || "Unknown";

    let dayMap = byDate.get(record.sale_date);
    if (!dayMap) {
      dayMap = new Map();
      byDate.set(record.sale_date, dayMap);
    }

    // Keep the day marked active even when this waiter's tips are zero.
    if (cashGs === 0 && ccGs === 0) continue;

    contributorIds.add(waiterId);

    const existing = dayMap.get(waiterId);
    if (existing) {
      existing.cashGs = roundMoney(existing.cashGs + cashGs);
      existing.ccGs = roundMoney(existing.ccGs + ccGs);
      existing.totalGs = roundMoney(existing.cashGs + existing.ccGs);
    } else {
      dayMap.set(waiterId, {
        waiterId,
        waiterName,
        cashGs,
        ccGs,
        totalGs: roundMoney(cashGs + ccGs),
      });
    }
  }

  const calendarDates = omitEmptyDays
    ? Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b))
    : getDatesInMonth(monthKey);

  const rows: GratuityByWaiterDayRow[] = calendarDates.map((saleDate) => {
    const dayMap = byDate.get(saleDate);
    const contributors = dayMap
      ? Array.from(dayMap.values()).sort((a, b) =>
          a.waiterName.localeCompare(b.waiterName, undefined, {
            sensitivity: "base",
          }),
        )
      : [];

    const cashGs = roundMoney(
      contributors.reduce((sum, row) => sum + row.cashGs, 0),
    );
    const ccGs = roundMoney(
      contributors.reduce((sum, row) => sum + row.ccGs, 0),
    );
    const totalGs = roundMoney(cashGs + ccGs);

    return {
      saleDate,
      weekDay: getWeekDayLabel(saleDate),
      cashGs,
      ccGs,
      totalGs,
      hasActivity: Boolean(dayMap) && contributors.length > 0,
      contributors,
    };
  });

  // When omitting empty days, also drop days that only had zero-tip sales rows.
  const visibleRows = omitEmptyDays
    ? rows.filter((row) => row.contributors.length > 0)
    : rows;

  const summary = visibleRows.reduce<GratuityByWaiterMonthSummary>(
    (acc, row) => ({
      cashGs: roundMoney(acc.cashGs + row.cashGs),
      ccGs: roundMoney(acc.ccGs + row.ccGs),
      totalGs: roundMoney(acc.totalGs + row.totalGs),
      activeDayCount: acc.activeDayCount + (row.hasActivity ? 1 : 0),
      contributorCount: acc.contributorCount,
    }),
    {
      cashGs: 0,
      ccGs: 0,
      totalGs: 0,
      activeDayCount: 0,
      contributorCount: contributorIds.size,
    },
  );

  return {
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    rows: visibleRows,
    summary,
  };
}

/** Flatten day × waiter rows for export tables. */
export function flattenGratuityByWaiterReportRows(
  report: GratuityByWaiterReportMonth,
): Array<{
  saleDate: string;
  weekDay: string;
  waiterName: string;
  cashGs: number;
  ccGs: number;
  totalGs: number;
  isEmptyDay: boolean;
}> {
  const flat: Array<{
    saleDate: string;
    weekDay: string;
    waiterName: string;
    cashGs: number;
    ccGs: number;
    totalGs: number;
    isEmptyDay: boolean;
  }> = [];

  for (const day of report.rows) {
    if (day.contributors.length === 0) {
      flat.push({
        saleDate: day.saleDate,
        weekDay: day.weekDay,
        waiterName: "—",
        cashGs: 0,
        ccGs: 0,
        totalGs: 0,
        isEmptyDay: true,
      });
      continue;
    }

    for (const contributor of day.contributors) {
      flat.push({
        saleDate: day.saleDate,
        weekDay: day.weekDay,
        waiterName: contributor.waiterName,
        cashGs: contributor.cashGs,
        ccGs: contributor.ccGs,
        totalGs: contributor.totalGs,
        isEmptyDay: false,
      });
    }
  }

  return flat;
}
