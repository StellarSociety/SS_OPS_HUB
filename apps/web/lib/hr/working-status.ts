import { findLeaveType, normalizeScheduleLeaveCode } from "@/lib/hr/leave";
import { DEFAULT_HR_LEAVE_POLICY_SETTINGS } from "@/lib/hr/types";

export const WORKING_STATUS = {
  active: "Active",
  paidLeave: "Paid Leave",
  unpaidLeave: "Unpaid Leave",
  offBoarding: "OFF-Boarding",
} as const;

export type WorkingStatusLabel =
  (typeof WORKING_STATUS)[keyof typeof WORKING_STATUS];

export type ResolveWorkingStatusInput = {
  /** Staff directory working status name. */
  workingStatus?: string | null;
  /** Payroll leaver or schedule termination in the visible week. */
  isOffBoarding?: boolean;
  /** Payroll: paid days in period. */
  paidDays?: number;
  /** Payroll: unpaid days in period. */
  unpaidDays?: number;
  /** Schedule: roster label codes for employed days in the visible week. */
  weekLabelCodes?: string[];
};

type RosterLabelBucket = "duty" | "paid_leave" | "unpaid_leave" | "unknown" | "empty";

function rosterLabelBucket(code: string): RosterLabelBucket {
  const normalized = normalizeScheduleLeaveCode(code.trim().toUpperCase());
  if (!normalized) return "empty";

  if (
    normalized === "SHIFT" ||
    normalized === "OFF" ||
    normalized === "PH-REPL"
  ) {
    return "duty";
  }

  if (normalized === "UPL" || normalized === "ABS") {
    return "unpaid_leave";
  }

  let type = findLeaveType(DEFAULT_HR_LEAVE_POLICY_SETTINGS, normalized);
  if (!type && normalized === "SL") {
    type = findLeaveType(DEFAULT_HR_LEAVE_POLICY_SETTINGS, "SL-FP");
  }
  if (!type && normalized === "ML") {
    type = findLeaveType(DEFAULT_HR_LEAVE_POLICY_SETTINGS, "ML-FP");
  }
  if (!type) return "unknown";

  switch (type.paidStatus) {
    case "unpaid":
      return "unpaid_leave";
    case "paid":
    case "half_pay":
    case "paid_plus_compensation":
    case "variable":
      return "paid_leave";
    default:
      return "unknown";
  }
}

/** Infer working status from roster labels when staff status is still Active. */
export function inferWorkingStatusFromWeekLabels(
  codes: string[],
): WorkingStatusLabel | null {
  let hasLabeled = false;
  let hasDuty = false;
  let hasPaidLeave = false;
  let hasUnpaidLeave = false;

  for (const raw of codes) {
    const bucket = rosterLabelBucket(raw);
    if (bucket === "empty") continue;
    hasLabeled = true;
    if (bucket === "duty") hasDuty = true;
    else if (bucket === "paid_leave") hasPaidLeave = true;
    else hasUnpaidLeave = true;
  }

  if (!hasLabeled) return null;
  if (!hasDuty && !hasPaidLeave && hasUnpaidLeave) {
    return WORKING_STATUS.unpaidLeave;
  }
  if (!hasDuty && hasPaidLeave && !hasUnpaidLeave) {
    return WORKING_STATUS.paidLeave;
  }
  return null;
}

/** True when termination falls inside the visible schedule week. */
export function isOffBoardingForWeek(
  terminationDate: string | null | undefined,
  weekStart: string,
  weekEnd: string,
): boolean {
  const termination = terminationDate?.trim();
  if (!termination || !weekStart || !weekEnd) return false;
  if (termination < weekStart) return false;
  return termination <= weekEnd;
}

/**
 * Resolve the working status badge label for payroll, schedules, and exports.
 * Prefers explicit staff working status, then off-boarding, then period/week inference.
 */
export function resolveWorkingStatus(
  input: ResolveWorkingStatusInput,
): WorkingStatusLabel {
  if (input.isOffBoarding) return WORKING_STATUS.offBoarding;

  const status = input.workingStatus?.trim();
  if (status && status !== WORKING_STATUS.active) {
    return status as WorkingStatusLabel;
  }

  if (
    input.paidDays != null &&
    input.unpaidDays != null &&
    input.paidDays === 0 &&
    input.unpaidDays > 0
  ) {
    return WORKING_STATUS.unpaidLeave;
  }

  const fromWeek = input.weekLabelCodes
    ? inferWorkingStatusFromWeekLabels(input.weekLabelCodes)
    : null;
  if (fromWeek) return fromWeek;

  return (status as WorkingStatusLabel) || WORKING_STATUS.active;
}

export function weekLabelCodesForMember(input: {
  staffId: string;
  joiningDate: string | null;
  terminationDate: string | null;
  weekDates: string[];
  cells: Record<string, { labelCode?: string | null } | null | undefined>;
  cellKey: (staffId: string, dateKey: string) => string;
}): string[] {
  const codes: string[] = [];
  for (const dateKey of input.weekDates) {
    if (input.joiningDate && dateKey < input.joiningDate) continue;
    if (input.terminationDate && dateKey > input.terminationDate) continue;
    const labelCode = input.cells[input.cellKey(input.staffId, dateKey)]?.labelCode;
    if (labelCode?.trim()) codes.push(labelCode.trim());
  }
  return codes;
}
