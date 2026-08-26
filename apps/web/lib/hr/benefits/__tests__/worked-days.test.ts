import { describe, expect, it } from "vitest";
import {
  countBenefitsWorkedDays,
  countBenefitsWorkedDaysFromSchedule,
} from "../worked-days";

const sop = {
  includeRegularDaysOffInWorkedDays: true,
  includePublicHolidaysInWorkedDays: false,
  excludeLeaveFromWorkedDays: true,
};

describe("countBenefitsWorkedDays", () => {
  it("never counts PH / PH-REPL even when the holiday flag is on", () => {
    const includePh = {
      ...sop,
      includePublicHolidaysInWorkedDays: true,
    };
    expect(
      countBenefitsWorkedDays(["SHIFT", "OFF", "PH", "PH-REPL"], includePh),
    ).toBe(2);
  });

  it("counts SHIFT + OFF and skips PH / PH-REPL / leave", () => {
    const labels = [
      "SHIFT",
      "SHIFT",
      "OFF",
      "PH",
      "PH-REPL",
      "AL",
      "SHIFT",
    ];
    expect(countBenefitsWorkedDays(labels, sop)).toBe(4);
  });

  it("matches ORL0021 July 2026 roster: 26 SHIFT + 4 OFF", () => {
    const days = [
      ["2026-07-01", "SHIFT"],
      ["2026-07-02", "SHIFT"],
      ["2026-07-03", "SHIFT"],
      ["2026-07-04", "SHIFT"],
      ["2026-07-05", "SHIFT"],
      ["2026-07-06", "OFF"],
      ["2026-07-07", "SHIFT"],
      ["2026-07-08", "PH-REPL"],
      ["2026-07-09", "SHIFT"],
      ["2026-07-10", "SHIFT"],
      ["2026-07-11", "SHIFT"],
      ["2026-07-12", "SHIFT"],
      ["2026-07-13", "OFF"],
      ["2026-07-14", "SHIFT"],
      ["2026-07-15", "SHIFT"],
      ["2026-07-16", "SHIFT"],
      ["2026-07-17", "SHIFT"],
      ["2026-07-18", "SHIFT"],
      ["2026-07-19", "SHIFT"],
      ["2026-07-20", "OFF"],
      ["2026-07-21", "SHIFT"],
      ["2026-07-22", "SHIFT"],
      ["2026-07-23", "SHIFT"],
      ["2026-07-24", "SHIFT"],
      ["2026-07-25", "SHIFT"],
      ["2026-07-26", "SHIFT"],
      ["2026-07-27", "OFF"],
      ["2026-07-28", "SHIFT"],
      ["2026-07-29", "SHIFT"],
      ["2026-07-30", "SHIFT"],
      ["2026-07-31", "SHIFT"],
    ].map(([work_date, label_code]) => ({ work_date, label_code }));

    expect(countBenefitsWorkedDaysFromSchedule(days, sop)).toBe(30);
  });
});
