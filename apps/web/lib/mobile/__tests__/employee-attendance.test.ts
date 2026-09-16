import { describe, expect, it } from "vitest";
import { isOutsideEmploymentWindow } from "@/lib/hr/schedules";
import { buildMobileAttendanceDays } from "@/lib/mobile/employee-attendance";
import type { ScheduleDayLabel, ShiftTemplate } from "@/lib/hr/schedules";

const SHIFT: ShiftTemplate = {
  id: "shift-late",
  name: "12PM – 11PM",
  abbreviation: "12–11",
  startTime: "12:00",
  endTime: "23:00",
  spansMidnight: false,
  bgColor: "#d1fae5",
  textColor: "#065f46",
  borderColor: "#a7f3d0",
  sortOrder: 1,
  isActive: true,
};

const LABELS: ScheduleDayLabel[] = [
  {
    id: "l-shift",
    code: "SHIFT",
    abbreviation: "SH",
    name: "Shift",
    bgColor: "#d1fae5",
    textColor: "#065f46",
    borderColor: "#a7f3d0",
    sortOrder: 1,
  },
  {
    id: "l-off",
    code: "OFF",
    abbreviation: "OFF",
    name: "Off",
    bgColor: "#f3f4f6",
    textColor: "#374151",
    borderColor: "#e5e7eb",
    sortOrder: 2,
  },
];

describe("buildMobileAttendanceDays", () => {
  it("merges roster times with clock in/out for a worked SHIFT", () => {
    const days = buildMobileAttendanceDays({
      templates: [SHIFT],
      labels: LABELS,
      holidays: [],
      timezone: "Asia/Dubai",
      todayKey: "2026-09-16",
      roster: [
        {
          work_date: "2026-09-15",
          label_code: "SHIFT",
          shift_template_id: "shift-late",
        },
      ],
      attendance: [
        {
          work_date: "2026-09-15",
          clock_in: "2026-09-15T08:02:00+00:00",
          clock_out: "2026-09-15T19:05:00+00:00",
          total_hours: 11.05,
          status: "complete",
          approval_status: "approved",
        },
      ],
    });

    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      workDate: "2026-09-15",
      rosterLabel: "SHIFT",
      rosterAbbreviation: "SH",
      shiftName: "12PM – 11PM",
      scheduleStartTime: "12:00",
      scheduleEndTime: "23:00",
      clockIn: "2026-09-15T08:02:00+00:00",
      clockOut: "2026-09-15T19:05:00+00:00",
      totalHours: 11.05,
      attendanceStatus: "complete",
      approvalStatus: "approved",
      issue: null,
    });
  });

  it("hides punches on future days and keeps the planned roster", () => {
    const days = buildMobileAttendanceDays({
      templates: [SHIFT],
      labels: LABELS,
      holidays: [{ holidayDate: "2026-09-20", name: "Prophet's Birthday" }],
      timezone: "Asia/Dubai",
      todayKey: "2026-09-16",
      roster: [
        {
          work_date: "2026-09-20",
          label_code: "SHIFT",
          shift_template_id: "shift-late",
        },
      ],
      attendance: [
        {
          work_date: "2026-09-20",
          clock_in: "2026-09-20T08:00:00+00:00",
          clock_out: null,
          total_hours: null,
          status: "missing_clock_out",
          approval_status: "pending",
        },
      ],
    });

    expect(days[0]).toMatchObject({
      workDate: "2026-09-20",
      rosterLabel: "SHIFT",
      scheduleStartTime: "12:00",
      clockIn: null,
      clockOut: null,
      totalHours: null,
      attendanceStatus: null,
      holidayName: "Prophet's Birthday",
      issue: null,
    });
  });

  it("does not keep shift times on OFF days", () => {
    const days = buildMobileAttendanceDays({
      templates: [SHIFT],
      labels: LABELS,
      holidays: [],
      timezone: "Asia/Dubai",
      todayKey: "2026-09-16",
      roster: [
        {
          work_date: "2026-09-14",
          label_code: "OFF",
          shift_template_id: "shift-late",
        },
      ],
      attendance: [],
    });

    expect(days[0]).toMatchObject({
      rosterLabel: "OFF",
      rosterName: "Off",
      scheduleTime: null,
      shiftName: null,
    });
  });

  it("marks days before joining and after termination as outside employment", () => {
    expect(
      isOutsideEmploymentWindow("2026-09-08", "2026-03-01", "2026-09-07"),
    ).toBe(true);
    expect(
      isOutsideEmploymentWindow("2026-09-07", "2026-03-01", "2026-09-07"),
    ).toBe(false);
    expect(
      isOutsideEmploymentWindow("2026-02-28", "2026-03-01", null),
    ).toBe(true);
    expect(
      isOutsideEmploymentWindow("2026-09-16", "2026-03-01", null),
    ).toBe(false);
  });
});
