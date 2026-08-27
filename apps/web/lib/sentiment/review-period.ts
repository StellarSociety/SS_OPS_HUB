import { formatDisplayDate } from "@/lib/dates/display";
import { dubaiCalendarDateIso } from "@/lib/hr/payroll/period";

export const REVIEW_PERIODS = ["days", "week", "month", "all"] as const;

export type ReviewPeriod = (typeof REVIEW_PERIODS)[number];

export const DEFAULT_REVIEW_PERIOD: ReviewPeriod = "week";

export const REVIEW_PERIOD_QUERY_KEYS = [
  "period",
  "from",
  "to",
  "week",
  "month",
] as const;

export type ReviewPeriodSearchParams = {
  period?: string;
  from?: string;
  to?: string;
  week?: string;
  month?: string;
};

export type ResolvedReviewPeriod = {
  period: ReviewPeriod;
  fromDate: string | null;
  toDate: string | null;
  weekKey: string | null;
  monthKey: string | null;
  label: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

export function isIsoDate(value: string | undefined | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isIsoMonth(value: string | undefined | null): value is string {
  if (!value || !ISO_MONTH.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function addIsoDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function mondayOfIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function sundayOfIsoDate(isoDate: string): string {
  return addIsoDays(mondayOfIsoDate(isoDate), 6);
}

export function monthKeyOfIsoDate(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function firstDayOfMonth(monthKey: string): string {
  return `${monthKey}-01`;
}

export function lastDayOfMonth(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${String(last).padStart(2, "0")}`;
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function todayIsoInDubai(asOf = new Date()): string {
  return dubaiCalendarDateIso(asOf) ?? asOf.toISOString().slice(0, 10);
}

export function currentMonthKeyInDubai(asOf = new Date()): string {
  return monthKeyOfIsoDate(todayIsoInDubai(asOf));
}

export function currentWeekMondayInDubai(asOf = new Date()): string {
  return mondayOfIsoDate(todayIsoInDubai(asOf));
}

export function lastDaysRangeInDubai(dayCount = 7, asOf = new Date()) {
  const toDate = todayIsoInDubai(asOf);
  return { fromDate: addIsoDays(toDate, 1 - dayCount), toDate };
}

export function formatMonthKeyLabel(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatMonthKeyShort(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
}

/** Inclusive rolling window of 12 months ending at the current Dubai month. */
export function lastTwelveMonthKeys(asOf = new Date()): string[] {
  const end = currentMonthKeyInDubai(asOf);
  return Array.from({ length: 12 }, (_, index) => shiftMonthKey(end, index - 11));
}

export function lastTwelveMonthsRange(asOf = new Date()) {
  const monthKeys = lastTwelveMonthKeys(asOf);
  return {
    monthKeys,
    fromDate: firstDayOfMonth(monthKeys[0]!),
    toDate: lastDayOfMonth(monthKeys[monthKeys.length - 1]!),
  };
}

function orderedRange(fromDate: string, toDate: string) {
  return fromDate <= toDate
    ? { fromDate, toDate }
    : { fromDate: toDate, toDate: fromDate };
}

function rangeLabel(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return formatDisplayDate(fromDate);
  return `${formatDisplayDate(fromDate)} – ${formatDisplayDate(toDate)}`;
}

export function isReviewPeriod(value: string | undefined | null): value is ReviewPeriod {
  return REVIEW_PERIODS.includes(value as ReviewPeriod);
}

export function resolveReviewPeriod(
  params: ReviewPeriodSearchParams | undefined,
  asOf = new Date(),
): ResolvedReviewPeriod {
  const period = isReviewPeriod(params?.period)
    ? params.period
    : DEFAULT_REVIEW_PERIOD;

  if (period === "all") {
    return {
      period,
      fromDate: null,
      toDate: null,
      weekKey: null,
      monthKey: null,
      label: "All reviews",
    };
  }

  if (period === "days") {
    const fallback = lastDaysRangeInDubai(7, asOf);
    const fromRaw = isIsoDate(params?.from) ? params.from : fallback.fromDate;
    const toRaw = isIsoDate(params?.to) ? params.to : fallback.toDate;
    const { fromDate, toDate } = orderedRange(fromRaw, toRaw);
    return {
      period,
      fromDate,
      toDate,
      weekKey: null,
      monthKey: null,
      label: rangeLabel(fromDate, toDate),
    };
  }

  if (period === "week") {
    const weekKey = isIsoDate(params?.week)
      ? mondayOfIsoDate(params.week)
      : currentWeekMondayInDubai(asOf);
    const fromDate = weekKey;
    const toDate = sundayOfIsoDate(weekKey);
    return {
      period,
      fromDate,
      toDate,
      weekKey,
      monthKey: null,
      label: rangeLabel(fromDate, toDate),
    };
  }

  const monthKey = isIsoMonth(params?.month)
    ? params.month
    : currentMonthKeyInDubai(asOf);
  const fromDate = firstDayOfMonth(monthKey);
  const toDate = lastDayOfMonth(monthKey);
  return {
    period: "month",
    fromDate,
    toDate,
    weekKey: null,
    monthKey,
    label: formatMonthKeyLabel(monthKey),
  };
}

/** Inclusive civil-date range as Dubai-local timestamptz bounds for Postgres. */
export function reviewedAtBounds(fromDate: string, toDate: string) {
  const { fromDate: start, toDate: end } = orderedRange(fromDate, toDate);
  return {
    startIso: `${start}T00:00:00+04:00`,
    endExclusiveIso: `${addIsoDays(end, 1)}T00:00:00+04:00`,
  };
}

export function reviewPeriodQuery(resolved: {
  period: ReviewPeriod;
  fromDate?: string | null;
  toDate?: string | null;
  weekKey?: string | null;
  monthKey?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("period", resolved.period);
  if (resolved.period === "days" && resolved.fromDate && resolved.toDate) {
    const { fromDate, toDate } = orderedRange(resolved.fromDate, resolved.toDate);
    params.set("from", fromDate);
    params.set("to", toDate);
  }
  if (resolved.period === "week" && resolved.weekKey) {
    params.set("week", mondayOfIsoDate(resolved.weekKey));
  }
  if (resolved.period === "month" && resolved.monthKey) {
    params.set("month", resolved.monthKey);
  }
  return params.toString();
}

export function reviewPeriodQueryFromSearch(
  searchParams: URLSearchParams,
): string {
  const next = new URLSearchParams();
  for (const key of REVIEW_PERIOD_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) next.set(key, value);
  }
  return next.toString();
}
