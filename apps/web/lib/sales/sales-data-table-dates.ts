import { getIsoWeekMonday, getIsoWeekParts } from "@/lib/sales/daily-sales-calculations";
import type { VenueDailyDiscountsRecord } from "@/lib/sales/discounts-types";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";

export const SALES_TABLE_EMPTY_ROW_ID_PREFIX = "empty:";

export const SALES_TABLE_EMPTY_ROW_CLASS =
  "bg-red-50/80 text-black/45";

export type SalesTableDateFilters = {
  fromDate: string;
  toDate: string;
  weekFilter: string;
  monthFilter: string;
  yearFilter: string;
};

export function formatLocalDateFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDatesInMonth(monthKey: string): string[] {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStr = String(month).padStart(2, "0");

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${year}-${monthStr}-${day}`;
  });
}

export function parseWeekFilterKey(
  key: string,
): { week: number; year: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), week: Number(match[2]) };
}

export function getDatesInIsoWeek(weekKey: string): string[] {
  const parsed = parseWeekFilterKey(weekKey);
  if (!parsed) return [];

  const monday = getIsoWeekMonday(parsed.year, parsed.week);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return formatLocalDateFromDate(date);
  });
}

export function getDatesInRange(fromDate: string, toDate: string): string[] {
  const start = fromDate <= toDate ? fromDate : toDate;
  const end = fromDate <= toDate ? toDate : fromDate;
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const current = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(endYear, endMonth - 1, endDay);
  const dates: string[] = [];

  while (current <= endDate) {
    dates.push(formatLocalDateFromDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function getCurrentYearKey(): string {
  return String(new Date().getFullYear());
}

/** ISO week filter key for the current week, e.g. `2026-W28`. */
export function getCurrentWeekFilterKey(): string {
  const today = formatLocalDateFromDate(new Date());
  const { week, year } = getIsoWeekParts(today);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function getDatesInYear(yearKey: string): string[] {
  const year = Number(yearKey);
  if (!Number.isFinite(year)) return [];

  const dates: string[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    dates.push(...getDatesInMonth(monthKey));
  }
  return dates;
}

export function resolveSalesTableCalendarDates(
  filters: SalesTableDateFilters,
): string[] | null {
  if (filters.monthFilter) {
    return getDatesInMonth(filters.monthFilter);
  }

  if (filters.weekFilter) {
    return getDatesInIsoWeek(filters.weekFilter);
  }

  if (filters.yearFilter) {
    return getDatesInYear(filters.yearFilter);
  }

  if (filters.fromDate && filters.toDate) {
    return getDatesInRange(filters.fromDate, filters.toDate);
  }

  return null;
}

export function salesTableEmptyRowId(saleDate: string): string {
  return `${SALES_TABLE_EMPTY_ROW_ID_PREFIX}${saleDate}`;
}

export function isSalesTableEmptyRowId(id: string): boolean {
  return id.startsWith(SALES_TABLE_EMPTY_ROW_ID_PREFIX);
}

export function createEmptyDailySalesRecord(
  saleDate: string,
  venueId: string,
): VenueDailySalesRecord {
  return {
    id: salesTableEmptyRowId(saleDate),
    venue_id: venueId,
    sale_date: saleDate,
    lunch_food_gs: 0,
    lunch_beverages_gs: 0,
    lunch_wine_gs: 0,
    lunch_shisha_gs: 0,
    lunch_tobacco_gs: 0,
    lunch_others_gs: 0,
    lunch_service_fees_gs: 0,
    lunch_covers: 0,
    lunch_bookings: 0,
    lunch_walkin_tables: 0,
    lunch_walkin_covers: 0,
    dinner_food_gs: 0,
    dinner_beverages_gs: 0,
    dinner_wine_gs: 0,
    dinner_shisha_gs: 0,
    dinner_tobacco_gs: 0,
    dinner_others_gs: 0,
    dinner_service_fees_gs: 0,
    dinner_covers: 0,
    dinner_bookings: 0,
    dinner_walkin_tables: 0,
    dinner_walkin_covers: 0,
    all_day_discount_gs: 0,
    vat_collected_gs: 0,
    municipality_fee_collected_gs: 0,
    service_charge_collected_gs: 0,
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
  };
}

export function createEmptyDiscountsRecord(
  saleDate: string,
  venueId: string,
): VenueDailyDiscountsRecord {
  return {
    id: salesTableEmptyRowId(saleDate),
    venue_id: venueId,
    sale_date: saleDate,
    food_discount_gs: 0,
    beverages_discount_gs: 0,
    wine_discount_gs: 0,
    shisha_discount_gs: 0,
    others_discount_gs: 0,
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
  };
}

export function createEmptyWaiterSalesEntry(
  saleDate: string,
  venueId: string,
  waiterId: string,
): VenueWaiterDailySalesEntry {
  return {
    id: salesTableEmptyRowId(saleDate),
    venue_id: venueId,
    waiter_id: waiterId,
    sale_date: saleDate,
    total_sales_gs: 0,
    total_payments_gs: 0,
    gratuity_cc_gs: 0,
    gratuity_cash_gs: 0,
    groups_service_charge_gs: 0,
    total_covers: 0,
    total_discounts_gs: 0,
    voucher_comments: "",
    deposit_comments: "",
    on_accounts_comments: "",
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
    tender_amounts: {},
  };
}

export function countSalesTableRowsWithData<T extends { id: string }>(
  rows: T[],
): number {
  return rows.filter((row) => !isSalesTableEmptyRowId(row.id)).length;
}

export function compareWeekFilterKeys(a: string, b: string): number {
  const parsedA = parseWeekFilterKey(a);
  const parsedB = parseWeekFilterKey(b);
  if (!parsedA || !parsedB) return b.localeCompare(a);
  if (parsedA.year !== parsedB.year) return parsedB.year - parsedA.year;
  return parsedB.week - parsedA.week;
}

export function compareMonthFilterKeys(a: string, b: string): number {
  return b.localeCompare(a);
}

export function sortWeekFilterOptions(
  options: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  return [...options].sort((a, b) => compareWeekFilterKeys(a.value, b.value));
}

export function sortMonthFilterOptions(
  options: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  return [...options].sort((a, b) => compareMonthFilterKeys(a.value, b.value));
}

export function buildSalesTableWeekOptions(
  saleDates: string[],
  formatLabel: (year: number, week: number) => string,
  getIsoWeekParts: (date: string) => { week: number; year: number },
): Array<{ value: string; label: string }> {
  const map = new Map<string, string>();

  for (const saleDate of saleDates) {
    const { week, year } = getIsoWeekParts(saleDate);
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    map.set(key, formatLabel(year, week));
  }

  const today = formatLocalDateFromDate(new Date());
  const { week, year } = getIsoWeekParts(today);
  const currentWeekKey = `${year}-W${String(week).padStart(2, "0")}`;
  map.set(currentWeekKey, formatLabel(year, week));

  return sortWeekFilterOptions(
    Array.from(map.entries()).map(([value, label]) => ({ value, label })),
  );
}

export function buildSalesTableMonthOptions(
  saleDates: string[],
  formatLabel: (monthKey: string) => string,
  getCurrentMonthKey: () => string,
): Array<{ value: string; label: string }> {
  const months = new Set(saleDates.map((saleDate) => saleDate.slice(0, 7)));
  months.add(getCurrentMonthKey());

  return sortMonthFilterOptions(
    Array.from(months).map((value) => ({
      value,
      label: formatLabel(value),
    })),
  );
}
