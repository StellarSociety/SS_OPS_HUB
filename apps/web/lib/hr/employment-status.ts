/** Employment statuses derived from joining / termination dates. */
export const EMPLOYMENT_STATUS_NAMES = {
  hiring: "Hiring",
  onBoard: "ON Board",
  offBoard: "OFF Board",
  out: "OUT",
} as const;

export type SuggestedEmploymentStatusName =
  (typeof EMPLOYMENT_STATUS_NAMES)[keyof typeof EMPLOYMENT_STATUS_NAMES];

/**
 * Shared surface styles for status badges, selects, and filter chips.
 * Hiring = pink, ON Board = green, OFF Board = amber, OUT = red.
 */
export const EMPLOYMENT_STATUS_SURFACE: Record<string, string> = {
  Hiring: "border-pink-200 bg-pink-100 text-pink-800",
  "ON Board": "border-emerald-200 bg-emerald-100 text-emerald-800",
  "OFF Board": "border-amber-200 bg-amber-100 text-amber-800",
  OUT: "border-red-200 bg-red-100 text-red-800",
};

/** Display / filter order: Hiring → ON Board → OFF Board → OUT. */
export const EMPLOYMENT_STATUS_SORT_ORDER: readonly string[] = [
  EMPLOYMENT_STATUS_NAMES.hiring,
  EMPLOYMENT_STATUS_NAMES.onBoard,
  EMPLOYMENT_STATUS_NAMES.offBoard,
  EMPLOYMENT_STATUS_NAMES.out,
];

export function compareEmploymentStatusNames(a: string, b: string): number {
  const ai = EMPLOYMENT_STATUS_SORT_ORDER.indexOf(a);
  const bi = EMPLOYMENT_STATUS_SORT_ORDER.indexOf(b);
  const aRank = ai === -1 ? EMPLOYMENT_STATUS_SORT_ORDER.length : ai;
  const bRank = bi === -1 ? EMPLOYMENT_STATUS_SORT_ORDER.length : bi;
  if (aRank !== bRank) return aRank - bRank;
  return a.localeCompare(b);
}

export function employmentStatusSurfaceClass(
  statusName: string | null | undefined,
): string {
  if (!statusName) return "";
  return EMPLOYMENT_STATUS_SURFACE[statusName] ?? "";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function yearMonthIndex(year: number, month: number): number {
  return year * 12 + month;
}

/** Calendar year-month of a stored `YYYY-MM-DD` date. */
function dateYearMonth(iso: string): number | null {
  if (!ISO_DATE.test(iso)) return null;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  return yearMonthIndex(year, month);
}

/** Current calendar year-month in Asia/Dubai. */
function asOfYearMonth(asOf: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(asOf);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return yearMonthIndex(year, month);
}

/**
 * Suggest employment status from dates:
 * - Hiring — no joining (start) date
 * - ON Board — joining date set, no termination date
 * - OFF Board — termination date set, still in that calendar month
 * - OUT — calendar month after the termination date (and later)
 */
export function suggestEmploymentStatusName(input: {
  joiningDate?: string | null;
  terminationDate?: string | null;
  asOf?: Date;
}): SuggestedEmploymentStatusName {
  const joining = input.joiningDate?.trim() || "";
  const termination = input.terminationDate?.trim() || "";

  if (!joining) return EMPLOYMENT_STATUS_NAMES.hiring;

  if (termination) {
    const termYm = dateYearMonth(termination);
    if (termYm != null && asOfYearMonth(input.asOf ?? new Date()) > termYm) {
      return EMPLOYMENT_STATUS_NAMES.out;
    }
    return EMPLOYMENT_STATUS_NAMES.offBoard;
  }

  return EMPLOYMENT_STATUS_NAMES.onBoard;
}

export function findStatusIdByName(
  statuses: { id: string; name: string }[],
  name: string,
): string | null {
  const needle = name.toLowerCase();
  return statuses.find((s) => s.name.toLowerCase() === needle)?.id ?? null;
}

export function findStatusNameById(
  statuses: { id: string; name: string }[],
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return statuses.find((s) => s.id === id)?.name ?? null;
}
