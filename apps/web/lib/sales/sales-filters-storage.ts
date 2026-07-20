import {
  getCurrentMonthKey,
  getIsoWeekMonday,
} from "@/lib/sales/daily-sales-calculations";
import {
  formatLocalDateFromDate,
  getCurrentWeekFilterKey,
  getCurrentYearKey,
  parseWeekFilterKey,
  type SalesTableDateFilters,
} from "@/lib/sales/sales-data-table-dates";
import { getLocalTodayIsoDate } from "@/lib/sales/sales-entry-dates";
import {
  readPersistedJson,
  readPersistedString,
  scopedPersistenceKey,
  writePersistedJson,
  writePersistedString,
  deletePersistedValue,
} from "@/lib/ui/client-persistence";

export const SALES_TABLE_DATE_FILTERS_KEY = "ss-ops-sales-table-date-filters";
export const SALES_INSIGHTS_FILTERS_KEY = "ss-ops-sales-insights-filters";
export const SALES_ENTRY_DATE_KEY = "ss-ops-sales-entry-date";
export const SALES_WAITER_SELECTION_KEY = "ss-ops-sales-waiter-selection";
export const SALES_FIGURES_ALERTS_FILTERS_KEY =
  "ss-ops-sales-figures-alerts-filters";
export const SALES_DAILY_SNAP_DATE_KEY = "ss-ops-sales-daily-snap-date";

export type SalesInsightsPeriodMode = "week" | "month" | "year";

export type SalesInsightsFilters = {
  periodMode: SalesInsightsPeriodMode;
  weekFilter: string;
  monthFilter: string;
  yearFilter: string;
  toDateOnly: boolean;
};

export type FiguresAlertsPeriodMode = "day" | "week" | "month";

export type FiguresAlertsFilters = {
  periodMode: FiguresAlertsPeriodMode;
  selectedDate: string;
  weekFilter: string;
  monthFilter: string;
};

export function salesFiltersStorageKey(
  base: string,
  venueKey: string | null | undefined,
): string {
  return scopedPersistenceKey(base, venueKey);
}

export function isValidIsoDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function isValidMonthFilterKey(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function isValidYearFilterKey(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function isValidWeekFilterKey(value: string): boolean {
  return parseWeekFilterKey(value) !== null;
}

export function defaultSalesTableDateFilters(): SalesTableDateFilters {
  return {
    fromDate: "",
    toDate: "",
    weekFilter: getCurrentWeekFilterKey(),
    monthFilter: "",
    yearFilter: "",
  };
}

export function defaultSalesInsightsFilters(): SalesInsightsFilters {
  return {
    periodMode: "week",
    weekFilter: getCurrentWeekFilterKey(),
    monthFilter: getCurrentMonthKey(),
    yearFilter: getCurrentYearKey(),
    toDateOnly: false,
  };
}

export function defaultFiguresAlertsFilters(): FiguresAlertsFilters {
  return {
    periodMode: "day",
    selectedDate: getLocalTodayIsoDate(),
    weekFilter: getCurrentWeekFilterKey(),
    monthFilter: getCurrentMonthKey(),
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

export function sanitizeSalesTableDateFilters(
  value: unknown,
): SalesTableDateFilters {
  const defaults = defaultSalesTableDateFilters();
  if (!value || typeof value !== "object") return defaults;

  const raw = value as Record<string, unknown>;
  const fromDate = asString(raw.fromDate);
  const toDate = asString(raw.toDate);
  const weekFilter = asString(raw.weekFilter);
  const monthFilter = asString(raw.monthFilter);
  const yearFilter = asString(raw.yearFilter);

  return {
    fromDate: fromDate && isValidIsoDateKey(fromDate) ? fromDate : "",
    toDate: toDate && isValidIsoDateKey(toDate) ? toDate : "",
    weekFilter:
      weekFilter && isValidWeekFilterKey(weekFilter) ? weekFilter : "",
    monthFilter:
      monthFilter && isValidMonthFilterKey(monthFilter) ? monthFilter : "",
    yearFilter:
      yearFilter && isValidYearFilterKey(yearFilter) ? yearFilter : "",
  };
}

export function readSalesTableDateFilters(
  storageKey: string,
): SalesTableDateFilters | null {
  const parsed = readPersistedJson(storageKey);
  if (parsed == null) return null;
  const filters = sanitizeSalesTableDateFilters(parsed);
  const hasAny =
    Boolean(filters.fromDate) ||
    Boolean(filters.toDate) ||
    Boolean(filters.weekFilter) ||
    Boolean(filters.monthFilter) ||
    Boolean(filters.yearFilter);
  return hasAny ? filters : defaultSalesTableDateFilters();
}

export function writeSalesTableDateFilters(
  storageKey: string,
  filters: SalesTableDateFilters,
): void {
  writePersistedJson(storageKey, sanitizeSalesTableDateFilters(filters));
}

export function sanitizeSalesInsightsFilters(
  value: unknown,
): SalesInsightsFilters {
  const defaults = defaultSalesInsightsFilters();
  if (!value || typeof value !== "object") return defaults;

  const raw = value as Record<string, unknown>;
  const periodModeRaw = asString(raw.periodMode);
  const periodMode: SalesInsightsPeriodMode =
    periodModeRaw === "month" ||
    periodModeRaw === "year" ||
    periodModeRaw === "week"
      ? periodModeRaw
      : defaults.periodMode;

  const weekFilter = asString(raw.weekFilter);
  const monthFilter = asString(raw.monthFilter);
  const yearFilter = asString(raw.yearFilter);

  return {
    periodMode,
    weekFilter:
      weekFilter && isValidWeekFilterKey(weekFilter)
        ? weekFilter
        : defaults.weekFilter,
    monthFilter:
      monthFilter && isValidMonthFilterKey(monthFilter)
        ? monthFilter
        : defaults.monthFilter,
    yearFilter:
      yearFilter && isValidYearFilterKey(yearFilter)
        ? yearFilter
        : defaults.yearFilter,
    toDateOnly: asBoolean(raw.toDateOnly),
  };
}

export function readSalesInsightsFilters(
  storageKey: string,
): SalesInsightsFilters | null {
  const parsed = readPersistedJson(storageKey);
  if (parsed == null) return null;
  return sanitizeSalesInsightsFilters(parsed);
}

export function writeSalesInsightsFilters(
  storageKey: string,
  filters: SalesInsightsFilters,
): void {
  writePersistedJson(storageKey, sanitizeSalesInsightsFilters(filters));
}

export function sanitizeFiguresAlertsFilters(
  value: unknown,
): FiguresAlertsFilters {
  const defaults = defaultFiguresAlertsFilters();
  if (!value || typeof value !== "object") return defaults;

  const raw = value as Record<string, unknown>;
  const periodModeRaw = asString(raw.periodMode);
  const periodMode: FiguresAlertsPeriodMode =
    periodModeRaw === "week" ||
    periodModeRaw === "month" ||
    periodModeRaw === "day"
      ? periodModeRaw
      : defaults.periodMode;

  const selectedDate = asString(raw.selectedDate);
  const weekFilter = asString(raw.weekFilter);
  const monthFilter = asString(raw.monthFilter);

  return {
    periodMode,
    selectedDate:
      selectedDate && isValidIsoDateKey(selectedDate)
        ? selectedDate
        : defaults.selectedDate,
    weekFilter:
      weekFilter && isValidWeekFilterKey(weekFilter)
        ? weekFilter
        : defaults.weekFilter,
    monthFilter:
      monthFilter && isValidMonthFilterKey(monthFilter)
        ? monthFilter
        : defaults.monthFilter,
  };
}

export function readFiguresAlertsFilters(
  storageKey: string,
): FiguresAlertsFilters | null {
  const parsed = readPersistedJson(storageKey);
  if (parsed == null) return null;
  return sanitizeFiguresAlertsFilters(parsed);
}

export function writeFiguresAlertsFilters(
  storageKey: string,
  filters: FiguresAlertsFilters,
): void {
  writePersistedJson(storageKey, sanitizeFiguresAlertsFilters(filters));
}

export function readSalesEntryDate(storageKey: string): string | null {
  const raw = readPersistedString(storageKey);
  if (!raw) return null;
  try {
    const value = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
    return typeof value === "string" && isValidIsoDateKey(value) ? value : null;
  } catch {
    return isValidIsoDateKey(raw) ? raw : null;
  }
}

export function writeSalesEntryDate(storageKey: string, date: string): void {
  if (!isValidIsoDateKey(date)) return;
  writePersistedString(storageKey, date);
}

export function readSalesWaiterSelection(storageKey: string): string | null {
  const raw = readPersistedString(storageKey);
  if (!raw) return null;
  try {
    const value = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return raw.length > 0 ? raw : null;
  }
}

export function writeSalesWaiterSelection(
  storageKey: string,
  waiterId: string,
): void {
  if (!waiterId) {
    deletePersistedValue(storageKey);
    return;
  }
  writePersistedString(storageKey, waiterId);
}

/** Resolve a display month when shared table filters are week/year oriented. */
export function resolveMonthFilterForDisplay(
  filters: SalesTableDateFilters,
): string {
  if (filters.monthFilter) return filters.monthFilter;
  if (filters.fromDate && isValidIsoDateKey(filters.fromDate)) {
    return filters.fromDate.slice(0, 7);
  }
  const weekParts = parseWeekFilterKey(filters.weekFilter);
  if (weekParts) {
    const monday = getIsoWeekMonday(weekParts.year, weekParts.week);
    return formatLocalDateFromDate(monday).slice(0, 7);
  }
  if (filters.yearFilter) {
    const currentMonth = getCurrentMonthKey();
    if (currentMonth.startsWith(`${filters.yearFilter}-`)) return currentMonth;
    return `${filters.yearFilter}-01`;
  }
  return getCurrentMonthKey();
}

export function defaultSalesEntryDate(): string {
  return getLocalTodayIsoDate();
}
