/** Month-key helpers for attendance (YYYY-MM). */

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export function isValidMonthKey(value: string): boolean {
  return MONTH_KEY_RE.test(value);
}

export function monthKeyFromWorkDate(workDate: string): string | null {
  const key = workDate.slice(0, 7);
  return isValidMonthKey(key) ? key : null;
}

export function currentMonthKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Inclusive YYYY-MM-DD range for a month key. */
export function rangeForMonthKey(monthKey: string): {
  fromDate: string;
  toDate: string;
} {
  const [y, m] = monthKey.split("-").map(Number);
  const fromDate = `${monthKey}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const toDate = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  return { fromDate, toDate };
}

/** Inclusive range spanning one or more month keys (max 6). */
export function rangeForMonthKeys(monthKeys: string[]): {
  fromDate: string;
  toDate: string;
  monthKeys: string[];
} {
  const unique = [
    ...new Set(monthKeys.filter(isValidMonthKey)),
  ].sort();
  const capped = unique.slice(0, 6);
  if (capped.length === 0) {
    const key = currentMonthKey();
    const range = rangeForMonthKey(key);
    return { ...range, monthKeys: [key] };
  }
  const first = rangeForMonthKey(capped[0]!);
  const last = rangeForMonthKey(capped[capped.length - 1]!);
  return {
    fromDate: first.fromDate,
    toDate: last.toDate,
    monthKeys: capped,
  };
}

/**
 * Resolve which months to fetch. Explicit URL selection wins; otherwise use up
 * to 6 newest indexed months (or the current calendar month as last resort).
 */
export function resolveFetchMonthKeys(
  selectedMonthKeys: string[],
  indexedMonthKeysNewestFirst: string[],
): string[] {
  const selected = [
    ...new Set(selectedMonthKeys.filter(isValidMonthKey)),
  ]
    .sort()
    .slice(0, 6);
  if (selected.length > 0) return selected;

  const recent = indexedMonthKeysNewestFirst
    .filter(isValidMonthKey)
    .slice(0, 6);
  if (recent.length > 0) return [...new Set(recent)].sort();

  return [currentMonthKey()];
}

export function formatMonthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/**
 * Parse `?month=` or `?months=a,b` from search params.
 * Empty when unset — months are optional; callers resolve a fetch fallback.
 */
export function monthKeysFromSearchParams(
  searchParams: { month?: string; months?: string } | undefined,
): string[] {
  if (!searchParams) return [];
  if (searchParams.months != null && searchParams.months !== "") {
    const keys = searchParams.months
      .split(",")
      .map((k) => k.trim())
      .filter(isValidMonthKey);
    if (keys.length > 0) return [...new Set(keys)].sort().slice(0, 6);
    return [];
  }
  if (searchParams.month && isValidMonthKey(searchParams.month)) {
    return [searchParams.month];
  }
  return [];
}

export function monthKeysHref(
  pathname: string,
  monthKeys: string[],
): string {
  const unique = [...new Set(monthKeys.filter(isValidMonthKey))].sort();
  if (unique.length === 0) return pathname;
  if (unique.length === 1) return `${pathname}?month=${unique[0]}`;
  return `${pathname}?months=${unique.join(",")}`;
}
