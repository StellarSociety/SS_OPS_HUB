/**
 * Work anniversary helpers for Staff Directory Insights.
 * Surfaces ON Board staff approaching a full year of service.
 */

import { daysUntil } from "./derived";

const ON_BOARD_STATUS_NAME = "ON Board";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Default look-ahead window for anniversary celebrations. */
export const DEFAULT_ANNIVERSARY_LEAD_DAYS = 30;

export type WorkAnniversaryItem = {
  staffId: string;
  empNo: string;
  fullName: string;
  joiningDate: string;
  /** Next anniversary date `YYYY-MM-DD`. */
  anniversaryDate: string;
  /** Whole years completed on that date (1+). */
  years: number;
  /** Calendar days until the anniversary (0 = today). */
  daysUntil: number;
};

function isoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 10);
  return ISO_DATE.test(trimmed) ? trimmed : null;
}

function dubaiTodayParts(asOf: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(asOf);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year, month, day };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Last valid day of month (1–12) in a given year. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Next joining anniversary on/after Dubai today.
 * Feb 29 joiners land on Feb 28 in non-leap years.
 */
export function nextWorkAnniversary(
  joiningDate: string,
  asOf: Date = new Date(),
): { anniversaryDate: string; years: number } | null {
  const join = isoDateOnly(joiningDate);
  if (!join) return null;

  const [jy, jm, jd] = join.split("-").map(Number) as [number, number, number];
  if (!jy || !jm || !jd) return null;

  const today = dubaiTodayParts(asOf);
  const todayKey = `${today.year}-${pad2(today.month)}-${pad2(today.day)}`;

  function anniversaryInYear(year: number): string {
    const day = Math.min(jd, daysInMonth(year, jm));
    return `${year}-${pad2(jm)}-${pad2(day)}`;
  }

  let year = today.year;
  let anniversaryDate = anniversaryInYear(year);
  if (anniversaryDate < todayKey) {
    year += 1;
    anniversaryDate = anniversaryInYear(year);
  }

  const years = year - jy;
  if (years < 1) return null;

  return { anniversaryDate, years };
}

/**
 * ON Board staff with a work anniversary within `leadDays` (inclusive of today).
 * Sorted soonest anniversary first, then by years descending.
 */
export function listWorkAnniversaryItems(
  staff: {
    id: string;
    emp_no: string;
    full_name: string;
    joining_date: string | null;
    employment_status?: { name: string } | null;
  }[],
  leadDays: number = DEFAULT_ANNIVERSARY_LEAD_DAYS,
  asOf: Date = new Date(),
): WorkAnniversaryItem[] {
  const items: WorkAnniversaryItem[] = [];

  for (const member of staff) {
    if (member.employment_status?.name !== ON_BOARD_STATUS_NAME) continue;
    const joiningDate = isoDateOnly(member.joining_date);
    if (!joiningDate) continue;

    const next = nextWorkAnniversary(joiningDate, asOf);
    if (!next) continue;

    const until = daysUntil(next.anniversaryDate);
    if (until == null || until < 0 || until > leadDays) continue;

    items.push({
      staffId: member.id,
      empNo: member.emp_no,
      fullName: member.full_name,
      joiningDate,
      anniversaryDate: next.anniversaryDate,
      years: next.years,
      daysUntil: until,
    });
  }

  return items.sort(
    (a, b) =>
      a.daysUntil - b.daysUntil ||
      b.years - a.years ||
      a.fullName.localeCompare(b.fullName),
  );
}
