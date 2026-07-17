/** Attendance day approval — payroll / leave must only use approved rows. */

export type AttendanceApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "flagged";

export const ATTENDANCE_APPROVED_STATUS: AttendanceApprovalStatus = "approved";

/** True when an attendance day may feed payroll or leave calculations. */
export function isAttendanceApprovedForPayroll(
  approvalStatus: string | null | undefined,
): boolean {
  return approvalStatus === ATTENDANCE_APPROVED_STATUS;
}
