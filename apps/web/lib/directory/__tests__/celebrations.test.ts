import { describe, expect, it } from "vitest";
import {
  addCalendarMonths,
  celebrationWindow,
  formatDayMonth,
  formatOrdinalDayMonth,
  listAnniversaryCelebrations,
  listBirthdayCelebrations,
} from "@/lib/directory/celebrations";
import type { DirectoryStaffMember } from "@/lib/directory/types";

function member(
  overrides: Partial<DirectoryStaffMember> & Pick<DirectoryStaffMember, "id">,
): DirectoryStaffMember {
  return {
    empNo: "E1",
    fullName: "Ada Lovelace",
    photoUrl: null,
    departmentName: "Kitchen",
    departmentSortOrder: 1,
    positionName: "Chef",
    positionId: null,
    employmentStatusName: "ON Board",
    workingStatusName: null,
    nationalityName: "United Kingdom",
    dob: null,
    joiningDate: null,
    contactPhone: null,
    whatsapp: null,
    personalEmail: null,
    workEmail: null,
    ...overrides,
  };
}

/** 17 Sep 2026 12:00 UTC = 16:00 Dubai. */
const AS_OF = new Date("2026-09-17T12:00:00.000Z");

describe("celebrationWindow", () => {
  it("spans one calendar month before and after Dubai today", () => {
    const window = celebrationWindow(AS_OF);
    expect(window.startIso).toBe("2026-08-17");
    expect(window.endIso).toBe("2026-10-17");
    expect(window.today).toEqual({ year: 2026, month: 9, day: 17 });
  });

  it("clamps month-end days", () => {
    expect(addCalendarMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });
});

describe("listBirthdayCelebrations", () => {
  it("includes birthdays one month before and after, and skips the rest", () => {
    const staff = [
      member({ id: "past", fullName: "Past", dob: "1990-08-20" }),
      member({ id: "today", fullName: "Today", dob: "1991-09-17" }),
      member({ id: "soon", fullName: "Soon", dob: "1992-10-01" }),
      member({ id: "far", fullName: "Far", dob: "1993-11-01" }),
      member({ id: "out", fullName: "Out", dob: "1990-09-17", employmentStatusName: "OUT" }),
      member({ id: "hiring", fullName: "Hiring", dob: "1990-09-17", employmentStatusName: "Hiring" }),
      member({ id: "off", fullName: "Off", dob: "1990-09-18", employmentStatusName: "OFF Boarding" }),
    ];

    const items = listBirthdayCelebrations(staff, AS_OF);
    expect(items.map((item) => item.staffId)).toEqual([
      "past",
      "today",
      "off",
      "soon",
    ]);
    expect(items.find((item) => item.staffId === "today")?.daysFromToday).toBe(0);
    expect(items.find((item) => item.staffId === "past")?.daysFromToday).toBeLessThan(0);
    expect(items.find((item) => item.staffId === "soon")?.daysFromToday).toBeGreaterThan(0);
  });
});

describe("listAnniversaryCelebrations", () => {
  it("includes completed work years inside the two-month window", () => {
    const staff = [
      member({ id: "year-2", fullName: "Two", joiningDate: "2024-09-17" }),
      member({ id: "recent", fullName: "Recent", joiningDate: "2025-08-20" }),
      member({ id: "new", fullName: "New", joiningDate: "2026-08-20" }),
      member({ id: "far", fullName: "Far", joiningDate: "2020-01-01" }),
    ];

    const items = listAnniversaryCelebrations(staff, AS_OF);
    expect(items.map((item) => item.staffId)).toEqual(["recent", "year-2"]);
    expect(items.find((item) => item.staffId === "year-2")?.years).toBe(2);
    expect(items.find((item) => item.staffId === "recent")?.years).toBe(1);
  });
});

describe("formatDayMonth", () => {
  it("shows day and month only", () => {
    expect(formatDayMonth("1990-03-15")).toBe("15/03");
    expect(formatDayMonth(null)).toBe("—");
  });
});

describe("formatOrdinalDayMonth", () => {
  it("shows ordinal day and month name", () => {
    expect(formatOrdinalDayMonth("1990-11-03")).toBe("3rd November");
    expect(formatOrdinalDayMonth("1990-01-01")).toBe("1st January");
    expect(formatOrdinalDayMonth("1990-02-02")).toBe("2nd February");
    expect(formatOrdinalDayMonth("1990-11-11")).toBe("11th November");
    expect(formatOrdinalDayMonth("1990-11-21")).toBe("21st November");
    expect(formatOrdinalDayMonth(null)).toBe("—");
  });
});
