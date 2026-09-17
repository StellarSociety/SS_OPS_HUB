import { isVisibleDirectoryStaff } from "./store";
import type {
  DirectoryCelebration,
  DirectoryStaffMember,
} from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Ymd = { year: number; month: number; day: number };

function isoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 10);
  return ISO_DATE.test(trimmed) ? trimmed : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdKey(parts: Ymd): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function parseIso(iso: string): Ymd | null {
  if (!ISO_DATE.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function dubaiTodayParts(asOf: Date = new Date()): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(asOf);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Shift a calendar date by whole months, clamping the day (31 Jan → 28 Feb). */
export function addCalendarMonths(parts: Ymd, delta: number): Ymd {
  const index = parts.year * 12 + (parts.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return { year, month, day };
}

function daysBetween(from: Ymd, to: Ymd): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Visible window: one calendar month before today through one month after,
 * inclusive, in Asia/Dubai.
 */
export function celebrationWindow(asOf: Date = new Date()): {
  start: Ymd;
  end: Ymd;
  today: Ymd;
  startIso: string;
  endIso: string;
} {
  const today = dubaiTodayParts(asOf);
  const start = addCalendarMonths(today, -1);
  const end = addCalendarMonths(today, 1);
  return {
    start,
    end,
    today,
    startIso: ymdKey(start),
    endIso: ymdKey(end),
  };
}

function occurrenceInWindow(
  month: number,
  day: number,
  start: Ymd,
  end: Ymd,
): Ymd | null {
  const startKey = ymdKey(start);
  const endKey = ymdKey(end);
  for (let year = start.year - 1; year <= end.year + 1; year += 1) {
    const candidate: Ymd = {
      year,
      month,
      day: Math.min(day, daysInMonth(year, month)),
    };
    const key = ymdKey(candidate);
    if (key >= startKey && key <= endKey) return candidate;
  }
  return null;
}

export function isDirectoryActiveStaff(
  member: Pick<DirectoryStaffMember, "employmentStatusName">,
): boolean {
  return isVisibleDirectoryStaff(member);
}

export function formatDayMonth(iso: string | null | undefined): string {
  const date = isoDateOnly(iso);
  if (!date) return "—";
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function dayOrdinal(day: number): string {
  const teen = day % 100;
  if (teen >= 11 && teen <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** Birthday display: `3rd November` (no year). */
export function formatOrdinalDayMonth(
  iso: string | null | undefined,
): string {
  const date = isoDateOnly(iso);
  if (!date) return "—";
  const parsed = parseIso(date);
  if (!parsed) return "—";
  return `${dayOrdinal(parsed.day)} ${MONTH_NAMES[parsed.month - 1]}`;
}

export function celebrationCaption(daysFromToday: number): string {
  if (daysFromToday === 0) return "Today";
  if (daysFromToday === 1) return "Tomorrow";
  if (daysFromToday === -1) return "Yesterday";
  if (daysFromToday > 1) return `In ${daysFromToday} days`;
  return `${Math.abs(daysFromToday)} days ago`;
}

function activeDirectoryStaff(
  staff: DirectoryStaffMember[],
): DirectoryStaffMember[] {
  return staff.filter(isDirectoryActiveStaff);
}

export function listBirthdayCelebrations(
  staff: DirectoryStaffMember[],
  asOf: Date = new Date(),
): Array<DirectoryCelebration & { member: DirectoryStaffMember }> {
  const { start, end, today } = celebrationWindow(asOf);
  const items: Array<DirectoryCelebration & { member: DirectoryStaffMember }> =
    [];

  for (const member of activeDirectoryStaff(staff)) {
    const dob = isoDateOnly(member.dob);
    if (!dob) continue;
    const parsed = parseIso(dob);
    if (!parsed) continue;

    const occurrence = occurrenceInWindow(parsed.month, parsed.day, start, end);
    if (!occurrence) continue;

    items.push({
      staffId: member.id,
      kind: "birthday",
      occurrenceDate: ymdKey(occurrence),
      daysFromToday: daysBetween(today, occurrence),
      years: null,
      member,
    });
  }

  return items.sort(compareCelebrations);
}

export function listAnniversaryCelebrations(
  staff: DirectoryStaffMember[],
  asOf: Date = new Date(),
): Array<DirectoryCelebration & { member: DirectoryStaffMember }> {
  const { start, end, today } = celebrationWindow(asOf);
  const items: Array<DirectoryCelebration & { member: DirectoryStaffMember }> =
    [];

  for (const member of activeDirectoryStaff(staff)) {
    const joining = isoDateOnly(member.joiningDate);
    if (!joining) continue;
    const parsed = parseIso(joining);
    if (!parsed) continue;

    const occurrence = occurrenceInWindow(parsed.month, parsed.day, start, end);
    if (!occurrence) continue;

    const years = occurrence.year - parsed.year;
    if (years < 1) continue;

    items.push({
      staffId: member.id,
      kind: "anniversary",
      occurrenceDate: ymdKey(occurrence),
      daysFromToday: daysBetween(today, occurrence),
      years,
      member,
    });
  }

  return items.sort(compareCelebrations);
}

function compareCelebrations(
  a: DirectoryCelebration & { member: DirectoryStaffMember },
  b: DirectoryCelebration & { member: DirectoryStaffMember },
): number {
  return (
    a.occurrenceDate.localeCompare(b.occurrenceDate) ||
    a.member.fullName.localeCompare(b.member.fullName)
  );
}
