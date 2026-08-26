import { describe, expect, it } from "vitest";
import { listPhReplacementCreditDates } from "@/lib/hr/leave";

const holidays = [
  "2026-01-01",
  "2026-03-19",
  "2026-03-20",
  "2026-03-21",
  "2026-03-22",
  "2026-05-26",
  "2026-05-27",
  "2026-05-28",
  "2026-05-29",
  "2026-06-15",
  "2026-08-28",
  "2026-12-02",
  "2026-12-03",
];

const nimchieRoster = [
  { work_date: "2026-01-01", label_code: "SHIFT" },
  { work_date: "2026-03-19", label_code: "SHIFT" },
  { work_date: "2026-03-20", label_code: "PH" },
  { work_date: "2026-03-21", label_code: "SHIFT" },
  { work_date: "2026-03-22", label_code: "SHIFT" },
  { work_date: "2026-05-26", label_code: "SHIFT" },
  { work_date: "2026-05-27", label_code: "SHIFT" },
  { work_date: "2026-05-28", label_code: "SHIFT" },
  { work_date: "2026-05-29", label_code: "SHIFT" },
  { work_date: "2026-06-15", label_code: "ABS" },
  { work_date: "2026-08-28", label_code: "SHIFT" },
];

describe("PH-REPL credits", () => {
  it("ignores public holidays before joining, even if the year roster has SHIFT", () => {
    const dates = listPhReplacementCreditDates({
      holidayDates: holidays,
      scheduleDays: nimchieRoster,
      joiningDate: "2026-07-09",
      asOf: new Date(2026, 7, 26),
    });
    expect(dates).toEqual([]);
  });

  it("credits a holiday worked on or after joining", () => {
    const dates = listPhReplacementCreditDates({
      holidayDates: holidays,
      scheduleDays: nimchieRoster,
      joiningDate: "2026-07-09",
      asOf: new Date(2026, 7, 28),
    });
    expect(dates).toEqual(["2026-08-28"]);
  });

  it("does not credit a future rostered holiday that has not been worked yet", () => {
    const dates = listPhReplacementCreditDates({
      holidayDates: holidays,
      scheduleDays: nimchieRoster,
      joiningDate: "2026-07-09",
      asOf: new Date(2026, 7, 26),
    });
    expect(dates).not.toContain("2026-08-28");
    expect(dates).not.toContain("2026-12-02");
  });

  it("does not credit holidays after termination", () => {
    const dates = listPhReplacementCreditDates({
      holidayDates: holidays,
      scheduleDays: [
        { work_date: "2026-01-01", label_code: "SHIFT" },
        { work_date: "2026-08-28", label_code: "SHIFT" },
      ],
      joiningDate: "2025-01-01",
      terminationDate: "2026-06-01",
      asOf: new Date(2026, 7, 26),
    });
    expect(dates).toEqual(["2026-01-01"]);
  });

  it("does not credit PH taken or absence on a holiday", () => {
    const dates = listPhReplacementCreditDates({
      holidayDates: holidays,
      scheduleDays: [
        { work_date: "2026-03-20", label_code: "PH" },
        { work_date: "2026-06-15", label_code: "ABS" },
      ],
      joiningDate: "2025-01-01",
      asOf: new Date(2026, 7, 26),
    });
    expect(dates).toEqual([]);
  });
});
