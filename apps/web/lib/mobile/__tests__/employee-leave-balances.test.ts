import { describe, expect, it } from "vitest";
import { buildMobileLeaveBalances } from "@/lib/mobile/employee-leave-balances";
import type { HrLeaveBalance } from "@/lib/hr/types";

function row(
  code: string,
  values: Partial<HrLeaveBalance> = {},
): HrLeaveBalance {
  return {
    id: code,
    venue_id: "venue",
    staff_id: "staff",
    leave_year: 2026,
    leave_type_code: code,
    entitled: 0,
    accrued: 0,
    used: 0,
    scheduled: 0,
    pending: 0,
    carried_forward: 0,
    expired: 0,
    adjusted: 0,
    created_at: "",
    updated_at: "",
    ...values,
  };
}

describe("buildMobileLeaveBalances", () => {
  it("groups sick stages into one primary card", () => {
    const result = buildMobileLeaveBalances({
      year: 2026,
      balances: [
        row("SL-FP", { entitled: 15, used: 2 }),
        row("SL-HP", { entitled: 30, used: 0 }),
        row("SL-UP", { entitled: 45, used: 0 }),
      ],
    });
    const sick = result.primary.find((card) => card.code === "SL");
    expect(sick?.label).toBe("Sick Leave");
    expect(sick?.entitled).toBe(90);
    expect(sick?.used).toBe(2);
    expect(sick?.available).toBe(88);
    expect(sick?.stages).toEqual([
      expect.objectContaining({
        code: "SL-FP",
        label: "Full pay",
        used: 2,
        entitled: 15,
        available: 13,
      }),
      expect.objectContaining({
        code: "SL-HP",
        label: "Half pay",
        entitled: 30,
        available: 30,
      }),
      expect.objectContaining({
        code: "SL-UP",
        label: "Unpaid",
        entitled: 45,
        available: 45,
      }),
    ]);
  });

  it("hides empty other kinds and keeps primary slots", () => {
    const result = buildMobileLeaveBalances({
      year: 2026,
      balances: [
        row("AL", { accrued: 30, used: 37 }),
        row("PL", { entitled: 5 }),
      ],
    });
    expect(result.primary.map((card) => card.code)).toEqual([
      "AL",
      "PH-REPL",
      "SL",
      "UPL",
    ]);
    expect(result.other.map((card) => card.code)).toEqual(["PL"]);
  });

  it("attaches the annual leave calculation only to the AL card", () => {
    const calculation = {
      joiningDate: "2025-09-15",
      asOfDate: "2026-09-17",
      terminationDate: null,
      calendarServiceDays: 367,
      unpaidLeaveDays: 0,
      absenceDays: 0,
      qualifyingServiceDays: 367,
      qualifyingServiceMonths: 367 / 30,
      band: "full" as const,
      rateLabel: "30 days per completed year",
      completedYears: 1,
      remainingMonths: 0.2333,
      careerGrossEntitlement: 30,
      grossAnnualLeaveEntitlement: 30,
      roundedGrossAnnualLeaveEntitlement: 30,
      annualLeaveAlreadyTaken: 0,
      previousCarryForwardBalance: 0,
      adjusted: 0,
      scheduled: 0,
      pending: 0,
      expired: 0,
      finalAnnualLeaveBalance: 30,
      roundedFinalAnnualLeaveBalance: 30,
    };
    const result = buildMobileLeaveBalances({
      year: 2026,
      balances: [row("AL", { accrued: 30 })],
      annualLeaveCalculation: calculation,
    });
    const al = result.primary.find((card) => card.code === "AL");
    const sick = result.primary.find((card) => card.code === "SL");
    expect(al?.annualLeaveCalculation).toBe(calculation);
    expect(sick?.annualLeaveCalculation).toBeUndefined();
  });
});
