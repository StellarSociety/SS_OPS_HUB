import { describe, expect, it } from "vitest";
import {
  addIsoDays,
  lastTwelveMonthKeys,
  mondayOfIsoDate,
  resolveReviewPeriod,
  reviewedAtBounds,
  reviewPeriodQuery,
  shiftMonthKey,
  sundayOfIsoDate,
} from "../review-period";

describe("review period", () => {
  it("defaults to the current Dubai week when params are empty", () => {
    const resolved = resolveReviewPeriod({}, new Date("2026-08-27T12:00:00+04:00"));
    expect(resolved.period).toBe("week");
    expect(resolved.weekKey).toBe("2026-08-24");
    expect(resolved.fromDate).toBe("2026-08-24");
    expect(resolved.toDate).toBe("2026-08-30");
  });

  it("resolves a calendar month when period is month", () => {
    const resolved = resolveReviewPeriod(
      { period: "month", month: "2026-08" },
      new Date("2026-08-27T12:00:00+04:00"),
    );
    expect(resolved.period).toBe("month");
    expect(resolved.monthKey).toBe("2026-08");
    expect(resolved.fromDate).toBe("2026-08-01");
    expect(resolved.toDate).toBe("2026-08-31");
  });

  it("resolves a Monday–Sunday week from any day in that week", () => {
    expect(mondayOfIsoDate("2026-08-27")).toBe("2026-08-24");
    expect(sundayOfIsoDate("2026-08-27")).toBe("2026-08-30");
    const resolved = resolveReviewPeriod(
      { period: "week", week: "2026-08-27" },
      new Date("2026-08-27T12:00:00+04:00"),
    );
    expect(resolved.weekKey).toBe("2026-08-24");
    expect(resolved.fromDate).toBe("2026-08-24");
    expect(resolved.toDate).toBe("2026-08-30");
  });

  it("orders a reversed day range and builds Dubai timestamptz bounds", () => {
    const resolved = resolveReviewPeriod({
      period: "days",
      from: "2026-08-20",
      to: "2026-08-10",
    });
    expect(resolved.fromDate).toBe("2026-08-10");
    expect(resolved.toDate).toBe("2026-08-20");
    expect(reviewedAtBounds("2026-08-10", "2026-08-20")).toEqual({
      startIso: "2026-08-10T00:00:00+04:00",
      endExclusiveIso: "2026-08-21T00:00:00+04:00",
    });
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(addIsoDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("returns twelve months ending at the current Dubai month", () => {
    expect(lastTwelveMonthKeys(new Date("2026-08-27T12:00:00+04:00"))).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("writes only the params for the active period", () => {
    expect(
      reviewPeriodQuery({
        period: "month",
        monthKey: "2026-07",
        fromDate: "2026-07-01",
      }),
    ).toBe("period=month&month=2026-07");
    expect(reviewPeriodQuery({ period: "all" })).toBe("period=all");
  });
});
