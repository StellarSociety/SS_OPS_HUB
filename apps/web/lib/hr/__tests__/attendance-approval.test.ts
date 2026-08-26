import { describe, expect, it } from "vitest";
import {
  attendanceDayRequiresApproval,
  isDayClearedForPayroll,
} from "@/lib/hr/attendance-approval";

const LATE_SHIFT = {
  rosterLabel: "SHIFT",
  workDate: "2026-07-31",
  attendanceId: "att-1",
  scheduleStart: "12:00",
  scheduleEnd: "22:00",
  // 11:52 Dubai in / 01:07 Dubai next-day out — ~3h past scheduled 22:00.
  clockIn: "2026-07-31T07:52:42+00:00",
  clockOut: "2026-07-31T21:07:05+00:00",
  timezone: "Asia/Dubai",
  varianceMinutes: 40,
} as const;

describe("isDayClearedForPayroll", () => {
  it("clears an out-of-tolerance SHIFT once Validation has approved it", () => {
    expect(
      isDayClearedForPayroll({
        ...LATE_SHIFT,
        approvalStatus: "approved",
      }),
    ).toBe(true);
  });

  it("does not clear an out-of-tolerance SHIFT that is still pending", () => {
    expect(
      isDayClearedForPayroll({
        ...LATE_SHIFT,
        approvalStatus: "pending",
      }),
    ).toBe(false);
    expect(
      attendanceDayRequiresApproval({
        ...LATE_SHIFT,
        approvalStatus: "pending",
      }).needs,
    ).toBe(true);
  });

  it("clears a SHIFT within schedule variance without explicit approval", () => {
    expect(
      isDayClearedForPayroll({
        rosterLabel: "SHIFT",
        approvalStatus: "pending",
        workDate: "2026-07-31",
        attendanceId: "att-2",
        scheduleStart: "12:00",
        scheduleEnd: "22:00",
        clockIn: "2026-07-31T08:10:00+00:00",
        clockOut: "2026-07-31T18:15:00+00:00",
        timezone: "Asia/Dubai",
        varianceMinutes: 40,
      }),
    ).toBe(true);
  });
});
