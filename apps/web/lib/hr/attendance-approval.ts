/** Attendance day approval — payroll / leave must only use approved rows. */

import { isScheduleLeaveLabel } from "@/lib/hr/leave";
import {
  DEFAULT_SCHEDULE_VARIANCE_MINUTES,
  shiftNeedsApproval,
} from "@/lib/hr/schedule-variance";
import { DEFAULT_HR_ATTENDANCE_IMPORT_RULES } from "@/lib/hr/types";

export type AttendanceApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "flagged";

export const ATTENDANCE_APPROVED_STATUS: AttendanceApprovalStatus = "approved";

/** Roster labels that never need Validation approval (paid rest days). */
const NO_APPROVAL_ROSTER_LABELS = new Set(["OFF", "PH"]);

export type AttendanceApprovalKind = "leave" | "worked";

export type AttendanceApprovalNeed = {
  needs: boolean;
  kind: AttendanceApprovalKind | null;
  reason: string | null;
};

/** True when an attendance day may feed payroll or leave calculations. */
export function isAttendanceApprovedForPayroll(
  approvalStatus: string | null | undefined,
): boolean {
  return approvalStatus === ATTENDANCE_APPROVED_STATUS;
}

function isLeaveOrAbsenceLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return isScheduleLeaveLabel(label) || label === "ABS";
}

/**
 * Whether a Validation day still needs approval (leave / ABS / out-of-tolerance
 * worked shifts). Already-approved days return needs: false.
 */
export function attendanceDayRequiresApproval(input: {
  rosterLabel: string | null | undefined;
  approvalStatus: string | null | undefined;
  workDate: string;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  clockIn?: string | null;
  clockOut?: string | null;
  issue?: string | null;
  timezone?: string;
  varianceMinutes?: number;
}): AttendanceApprovalNeed {
  if (isAttendanceApprovedForPayroll(input.approvalStatus)) {
    return { needs: false, kind: null, reason: null };
  }

  const label = input.rosterLabel?.trim() || null;
  if (label && NO_APPROVAL_ROSTER_LABELS.has(label)) {
    return { needs: false, kind: null, reason: null };
  }

  if (isLeaveOrAbsenceLabel(label)) {
    return {
      needs: true,
      kind: "leave",
      reason: input.issue ?? `${label} awaiting approval`,
    };
  }

  if (label === "SHIFT") {
    const timezone =
      input.timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone;
    const varianceMinutes =
      input.varianceMinutes ?? DEFAULT_SCHEDULE_VARIANCE_MINUTES;
    const needs = shiftNeedsApproval({
      rosterLabel: label,
      workDate: input.workDate,
      scheduleStart: input.scheduleStart ?? null,
      scheduleEnd: input.scheduleEnd ?? null,
      clockIn: input.clockIn ?? null,
      clockOut: input.clockOut ?? null,
      timezone,
      varianceMinutes,
    });
    if (!needs) return { needs: false, kind: null, reason: null };
    return {
      needs: true,
      kind: "worked",
      reason:
        input.issue ??
        (!input.clockIn || !input.clockOut
          ? "Missing punches"
          : "Clock times outside schedule tolerance"),
    };
  }

  // Attendance with no roster (or unknown label) still needs a review when
  // there is something to approve (punches or an existing attendance row issue).
  if (input.clockIn || input.clockOut || input.issue) {
    return {
      needs: true,
      kind: "worked",
      reason: input.issue ?? "Attendance needs review",
    };
  }

  return { needs: false, kind: null, reason: null };
}
