import { civilPartsToIso } from "@/lib/hr/attendance-import";

/** Default grace between scheduled times and clock in/out (Validation). */
export const DEFAULT_SCHEDULE_VARIANCE_MINUTES = 40;

function parseHhMm(
  value: string | null | undefined,
): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
}

function parseWorkDate(
  workDate: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workDate.trim());
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  };
}

function addCalendarDays(
  parts: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days);
  const d = new Date(utc);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** Expected shift start/end as ISO timestamps in the venue timezone. */
export function scheduledShiftBoundsIso(input: {
  workDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
}): { startIso: string; endIso: string } | null {
  const date = parseWorkDate(input.workDate);
  const start = parseHhMm(input.startTime);
  const end = parseHhMm(input.endTime);
  if (!date || !start || !end) return null;

  const startIso = civilPartsToIso(
    { ...date, ...start, second: 0 },
    input.timezone,
  );

  const startMins = start.hour * 60 + start.minute;
  const endMins = end.hour * 60 + end.minute;
  const endDate = endMins <= startMins ? addCalendarDays(date, 1) : date;
  const endIso = civilPartsToIso(
    { ...endDate, ...end, second: 0 },
    input.timezone,
  );

  return { startIso, endIso };
}

function absDiffMinutes(aIso: string, bIso: string): number | null {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round(Math.abs(a - b) / 60_000);
}

export type ShiftVarianceResult = {
  inDiffMinutes: number | null;
  outDiffMinutes: number | null;
  /** Largest of in/out diffs when both known. */
  maxDiffMinutes: number | null;
};

export function measureShiftPunchVariance(input: {
  workDate: string;
  scheduleStart: string;
  scheduleEnd: string;
  clockIn: string | null | undefined;
  clockOut: string | null | undefined;
  timezone: string;
}): ShiftVarianceResult {
  const bounds = scheduledShiftBoundsIso({
    workDate: input.workDate,
    startTime: input.scheduleStart,
    endTime: input.scheduleEnd,
    timezone: input.timezone,
  });
  if (!bounds) {
    return { inDiffMinutes: null, outDiffMinutes: null, maxDiffMinutes: null };
  }

  const inDiff = input.clockIn
    ? absDiffMinutes(input.clockIn, bounds.startIso)
    : null;
  const outDiff = input.clockOut
    ? absDiffMinutes(input.clockOut, bounds.endIso)
    : null;

  const diffs = [inDiff, outDiff].filter(
    (n): n is number => n != null && Number.isFinite(n),
  );
  return {
    inDiffMinutes: inDiff,
    outDiffMinutes: outDiff,
    maxDiffMinutes: diffs.length > 0 ? Math.max(...diffs) : null,
  };
}

/**
 * Whether a SHIFT day needs Validation approval.
 * Within tolerance (both punches present and close to schedule) → no.
 * Missing punches / missing schedule / over tolerance → yes.
 */
export function shiftNeedsApproval(input: {
  rosterLabel: string | null | undefined;
  workDate: string;
  scheduleStart: string | null | undefined;
  scheduleEnd: string | null | undefined;
  clockIn: string | null | undefined;
  clockOut: string | null | undefined;
  timezone: string;
  varianceMinutes?: number;
}): boolean {
  if (input.rosterLabel !== "SHIFT") return false;

  const limit =
    input.varianceMinutes != null && Number.isFinite(input.varianceMinutes)
      ? Math.max(0, input.varianceMinutes)
      : DEFAULT_SCHEDULE_VARIANCE_MINUTES;

  if (!input.clockIn || !input.clockOut) return true;
  if (!input.scheduleStart || !input.scheduleEnd) return true;

  const { maxDiffMinutes } = measureShiftPunchVariance({
    workDate: input.workDate,
    scheduleStart: input.scheduleStart,
    scheduleEnd: input.scheduleEnd,
    clockIn: input.clockIn,
    clockOut: input.clockOut,
    timezone: input.timezone,
  });

  if (maxDiffMinutes == null) return true;
  return maxDiffMinutes > limit;
}
