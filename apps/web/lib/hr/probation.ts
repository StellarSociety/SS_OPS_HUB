/**
 * Probation period rules (UAE-style legal max of six calendar months).
 *
 * - Duration is configurable but never exceeds six calendar months.
 * - Window starts on employment commencement (joining date).
 * - End date uses consecutive calendar time — leave/absence never pauses it.
 * - Leave codes from the roster are tallied separately for attendance metrics.
 */

export const PROBATION_MAX_MONTHS = 6;

/** Default contractual probation for new and unset staff records. */
export const DEFAULT_PROBATION_DURATION_VALUE = 6;
export const DEFAULT_PROBATION_DURATION_UNIT: ProbationDurationUnit = "months";

export type ProbationDurationUnit = "days" | "months";

export type ProbationStatus =
  | "Pending"
  | "Confirmed"
  | "Terminated"
  | "Expired";

export const PROBATION_STATUSES: ProbationStatus[] = [
  "Pending",
  "Confirmed",
  "Terminated",
  "Expired",
];

export type ProbationScheduleTallies = {
  /** Rostered SHIFT days in the probation window. */
  scheduledWorkingDays: number;
  /** SHIFT days on or before today (proxy for days worked until attendance exists). */
  actualDaysWorked: number;
  unpaidLeaveDays: number;
  sickLeaveDays: number;
  /** No dedicated authorised-absence roster code yet — reserved for AA/etc. */
  authorisedAbsenceDays: number;
  unauthorisedAbsenceDays: number;
  /** AL + ML + PL + BL (+ other non-working leave codes). */
  otherLeaveDays: number;
};

export const EMPTY_PROBATION_TALLIES: ProbationScheduleTallies = {
  scheduledWorkingDays: 0,
  actualDaysWorked: 0,
  unpaidLeaveDays: 0,
  sickLeaveDays: 0,
  authorisedAbsenceDays: 0,
  unauthorisedAbsenceDays: 0,
  otherLeaveDays: 0,
};

export type ProbationCalculation = {
  commencementDate: string | null;
  durationValue: number | null;
  durationUnit: ProbationDurationUnit | null;
  durationLabel: string | null;
  /** Contractual end before legal clamp. */
  contractualEndDate: string | null;
  /** Legal end = min(contractual end, commencement + 6 months). */
  legalEndDate: string | null;
  clampedToLegalMax: boolean;
  remainingDays: number | null;
  calendarDaysElapsed: number | null;
  status: ProbationStatus | null;
  /** Auto-derived when stored status is empty or Pending. */
  suggestedStatus: ProbationStatus | null;
} & ProbationScheduleTallies;

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addCalendarDays(start: Date, days: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + days);
  return d;
}

function addCalendarMonths(start: Date, months: number): Date {
  const d = new Date(start);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Clamp overflow (e.g. Jan 31 + 1 month → Feb 28/29).
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function diffCalendarDays(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/** Inclusive day count from start through end. */
function inclusiveDays(from: Date, to: Date): number {
  return Math.max(0, diffCalendarDays(from, to) + 1);
}

export function legalMaxEndDate(commencement: Date): Date {
  return addCalendarMonths(commencement, PROBATION_MAX_MONTHS);
}

/**
 * Contractual end from commencement + duration, then clamped to the 6-month legal max.
 * Duration of N months/days means the last day of probation is commencement + N
 * (calendar), inclusive of the commencement day in elapsed counts.
 */
export function computeProbationEndDate(
  commencementIso: string,
  durationValue: number,
  unit: ProbationDurationUnit,
): { contractual: string; legal: string; clamped: boolean } {
  const start = parseDateOnly(commencementIso)!;
  const contractual =
    unit === "months"
      ? addCalendarMonths(start, durationValue)
      : addCalendarDays(start, durationValue);
  const legalMax = legalMaxEndDate(start);
  const clamped = contractual.getTime() > legalMax.getTime();
  const legal = clamped ? legalMax : contractual;
  return {
    contractual: formatDateIso(contractual),
    legal: formatDateIso(legal),
    clamped,
  };
}

/** True when duration would exceed six calendar months from commencement. */
export function durationExceedsLegalMax(
  commencementIso: string | null | undefined,
  durationValue: number | null | undefined,
  unit: ProbationDurationUnit | null | undefined,
): boolean {
  if (!commencementIso || durationValue == null || durationValue <= 0 || !unit) {
    return false;
  }
  const start = parseDateOnly(commencementIso);
  if (!start) return false;
  if (unit === "months") return durationValue > PROBATION_MAX_MONTHS;
  const end = addCalendarDays(start, durationValue);
  return end.getTime() > legalMaxEndDate(start).getTime();
}

export function formatProbationDuration(
  value: number | null | undefined,
  unit: ProbationDurationUnit | null | undefined,
): string | null {
  if (value == null || value <= 0 || !unit) return null;
  const label = unit === "months" ? (value === 1 ? "month" : "months") : value === 1 ? "day" : "days";
  return `${value} ${label}`;
}

export function suggestProbationStatus(input: {
  legalEndDate: string | null;
  terminationDate?: string | null;
  storedStatus?: string | null;
}): ProbationStatus | null {
  const stored = input.storedStatus?.trim() || null;
  if (stored === "Confirmed" || stored === "Terminated") {
    return stored;
  }
  if (!input.legalEndDate) return stored === "Pending" || stored === "Expired" ? stored : null;

  const today = startOfToday();
  const end = parseDateOnly(input.legalEndDate)!;
  const termination = parseDateOnly(input.terminationDate ?? null);

  if (termination && termination.getTime() <= end.getTime()) {
    return "Terminated";
  }
  if (today.getTime() > end.getTime()) {
    return "Expired";
  }
  return "Pending";
}

export function tallyProbationScheduleDays(
  days: { work_date: string; label_code: string }[],
  window: { from: string; to: string },
  asOf: Date = startOfToday(),
): ProbationScheduleTallies {
  const tallies = { ...EMPTY_PROBATION_TALLIES };
  const asOfIso = formatDateIso(asOf);

  for (const day of days) {
    if (day.work_date < window.from || day.work_date > window.to) continue;
    const code = day.label_code;

    switch (code) {
      case "SHIFT":
        tallies.scheduledWorkingDays += 1;
        if (day.work_date <= asOfIso) tallies.actualDaysWorked += 1;
        break;
      case "UPL":
        tallies.unpaidLeaveDays += 1;
        break;
      case "SL":
        tallies.sickLeaveDays += 1;
        break;
      case "ABS":
        tallies.unauthorisedAbsenceDays += 1;
        break;
      case "AL":
      case "ML":
      case "PL":
      case "BL":
        tallies.otherLeaveDays += 1;
        break;
      default:
        break;
    }
  }

  return tallies;
}

export function computeProbation(input: {
  joiningDate: string | null | undefined;
  durationValue: number | string | null | undefined;
  durationUnit: string | null | undefined;
  probationStatus?: string | null;
  terminationDate?: string | null;
  tallies?: ProbationScheduleTallies;
  asOf?: Date;
}): ProbationCalculation {
  const tallies = input.tallies ?? EMPTY_PROBATION_TALLIES;
  const asOf = input.asOf ?? startOfToday();
  const commencementDate = parseDateOnly(input.joiningDate ?? null)
    ? String(input.joiningDate).slice(0, 10)
    : null;

  const rawValue =
    input.durationValue === "" || input.durationValue == null
      ? null
      : Number(input.durationValue);
  const durationValue =
    rawValue != null && Number.isFinite(rawValue) && rawValue > 0
      ? Math.floor(rawValue)
      : null;
  const durationUnit =
    input.durationUnit === "days" || input.durationUnit === "months"
      ? input.durationUnit
      : null;

  const empty: ProbationCalculation = {
    commencementDate,
    durationValue,
    durationUnit,
    durationLabel: formatProbationDuration(durationValue, durationUnit),
    contractualEndDate: null,
    legalEndDate: null,
    clampedToLegalMax: false,
    remainingDays: null,
    calendarDaysElapsed: null,
    status: null,
    suggestedStatus: null,
    ...tallies,
  };

  if (!commencementDate || durationValue == null || !durationUnit) {
    return empty;
  }

  const ends = computeProbationEndDate(
    commencementDate,
    durationValue,
    durationUnit,
  );
  const start = parseDateOnly(commencementDate)!;
  const legalEnd = parseDateOnly(ends.legal)!;
  const windowEnd = asOf.getTime() < legalEnd.getTime() ? asOf : legalEnd;
  const elapsed = inclusiveDays(start, windowEnd);
  const remaining = Math.max(0, diffCalendarDays(asOf, legalEnd));

  const suggestedStatus = suggestProbationStatus({
    legalEndDate: ends.legal,
    terminationDate: input.terminationDate,
    storedStatus: input.probationStatus,
  });

  const stored = input.probationStatus?.trim() || null;
  const status =
    stored === "Confirmed" || stored === "Terminated"
      ? (stored as ProbationStatus)
      : suggestedStatus;

  return {
    commencementDate,
    durationValue,
    durationUnit,
    durationLabel: formatProbationDuration(durationValue, durationUnit),
    contractualEndDate: ends.contractual,
    legalEndDate: ends.legal,
    clampedToLegalMax: ends.clamped,
    remainingDays: Math.max(0, remaining),
    calendarDaysElapsed: elapsed,
    status,
    suggestedStatus,
    ...tallies,
  };
}

export type OnProbationItem = {
  staffId: string;
  empNo: string;
  fullName: string;
  departmentName: string | null;
  positionName: string | null;
  commencementDate: string;
  durationLabel: string;
  legalEndDate: string;
  remainingDays: number;
  calendarDaysElapsed: number | null;
};

const ON_BOARD_STATUS_NAME = "ON Board";

/**
 * True when staff is ON Board and still within their probation window
 * (Pending) — same rules as the Staff Directory “On probation” widget.
 */
export function isStaffOnProbation(member: {
  joining_date: string | null;
  termination_date: string | null;
  probation_duration_value: number | null;
  probation_duration_unit: string | null;
  probation_status: string | null;
  employment_status?: { name: string } | null;
}): boolean {
  if (member.employment_status?.name !== ON_BOARD_STATUS_NAME) return false;
  if (!member.joining_date) return false;

  const calc = computeProbation({
    joiningDate: member.joining_date,
    durationValue:
      member.probation_duration_value ?? DEFAULT_PROBATION_DURATION_VALUE,
    durationUnit:
      member.probation_duration_unit ?? DEFAULT_PROBATION_DURATION_UNIT,
    probationStatus: member.probation_status,
    terminationDate: member.termination_date,
  });

  return calc.status === "Pending";
}

/**
 * Staff still within their probation window (Pending), sorted soonest-ending
 * first. Defaults unset duration to the contractual 6-month default so rows
 * match the staff entry form.
 */
export function listOnProbationItems(
  staff: {
    id: string;
    emp_no: string;
    full_name: string;
    joining_date: string | null;
    termination_date: string | null;
    probation_duration_value: number | null;
    probation_duration_unit: string | null;
    probation_status: string | null;
    department?: { name: string } | null;
    position?: { name: string } | null;
    employment_status?: { name: string } | null;
  }[],
): OnProbationItem[] {
  const items: OnProbationItem[] = [];

  for (const member of staff) {
    if (!isStaffOnProbation(member)) continue;

    const calc = computeProbation({
      joiningDate: member.joining_date,
      durationValue:
        member.probation_duration_value ?? DEFAULT_PROBATION_DURATION_VALUE,
      durationUnit:
        member.probation_duration_unit ?? DEFAULT_PROBATION_DURATION_UNIT,
      probationStatus: member.probation_status,
      terminationDate: member.termination_date,
    });

    if (
      !calc.legalEndDate ||
      !calc.commencementDate ||
      !calc.durationLabel ||
      calc.remainingDays == null
    ) {
      continue;
    }

    items.push({
      staffId: member.id,
      empNo: member.emp_no,
      fullName: member.full_name,
      departmentName: member.department?.name ?? null,
      positionName: member.position?.name ?? null,
      commencementDate: calc.commencementDate,
      durationLabel: calc.durationLabel,
      legalEndDate: calc.legalEndDate,
      remainingDays: calc.remainingDays,
      calendarDaysElapsed: calc.calendarDaysElapsed,
    });
  }

  return items.sort(
    (a, b) =>
      a.remainingDays - b.remainingDays ||
      a.fullName.localeCompare(b.fullName),
  );
}
