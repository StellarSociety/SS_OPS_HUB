/**
 * Attendance day approval rules shared by Validation UI and payroll.
 *
 * Payroll pays a day when Validation does not require approval for that day
 * (same `attendanceDayRequiresApproval` gate). Leave usage still mirrors
 * approved attendance rows when recording leave balances.
 */

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

export type AttendanceClearanceInput = {
  rosterLabel: string | null | undefined;
  approvalStatus: string | null | undefined;
  workDate: string;
  attendanceId?: string | null;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  clockIn?: string | null;
  clockOut?: string | null;
  issue?: string | null;
  timezone?: string;
  varianceMinutes?: number;
};

/** True when an attendance day was explicitly approved in Validation. */
export function isAttendanceApprovedForPayroll(
  approvalStatus: string | null | undefined,
): boolean {
  return approvalStatus === ATTENDANCE_APPROVED_STATUS;
}

/**
 * Whether a roster day is cleared for payroll pay.
 *
 * Same gate as Validation: if `attendanceDayRequiresApproval` says the day
 * does **not** need approval, it is cleared to pay. That includes:
 *
 * - Explicitly approved days
 * - OFF / calendar PH
 * - SHIFT within schedule variance
 * - Roster SHIFT with no attendance row yet (not selectable in Validation —
 *   pay unless HR marks ABS/leave; those leave labels then need approval)
 *
 * Not cleared when Validation still requires approval (leave/ABS pending,
 * out-of-tolerance punches) or when the day was rejected.
 */
export function isDayClearedForPayroll(
  input: AttendanceClearanceInput,
): boolean {
  if (input.approvalStatus === "rejected") return false;
  return !attendanceDayRequiresApproval(input).needs;
}

function isLeaveOrAbsenceLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return isScheduleLeaveLabel(label) || label === "ABS";
}

/**
 * Whether a Validation day still needs approval (leave / ABS / out-of-tolerance
 * worked shifts). Already-approved days return needs: false.
 *
 * Matches Validation selectability:
 * - OFF / calendar PH → never
 * - Leave / ABS → yes (even without an attendance row — stub created on approve)
 * - SHIFT within schedule tolerance → no
 * - SHIFT missing punches / over tolerance → only when an attendance row exists
 *   (roster-only no-shows must be marked ABS/leave first)
 * - Other punch rows → only when an attendance row exists
 */
export function attendanceDayRequiresApproval(
  input: AttendanceClearanceInput,
): AttendanceApprovalNeed {
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
    // Roster-only SHIFT (no attendance row) is not approvable yet — mark ABS
    // or leave in Validation first.
    if (!input.attendanceId) {
      return { needs: false, kind: null, reason: null };
    }
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

  // Attendance with no roster (or unknown label) — only when a row exists.
  if (input.attendanceId && (input.clockIn || input.clockOut || input.issue)) {
    return {
      needs: true,
      kind: "worked",
      reason: input.issue ?? "Attendance needs review",
    };
  }

  return { needs: false, kind: null, reason: null };
}
