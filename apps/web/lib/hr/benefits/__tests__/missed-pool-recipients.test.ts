import { describe, expect, it } from "vitest";
import { calculateGratuityRun } from "../calculate-gratuity";
import { DEFAULT_HR_GRATUITY_SETTINGS } from "../types";

const settings = {
  ...DEFAULT_HR_GRATUITY_SETTINGS,
  waiterCashPoolPercent: 0,
  waiterCcCollectionTipOutPercent: 0,
  runnerHousekeeperDeductPercent: 0,
  poolOseDeductPercent: 0,
  poolStaffActivitiesDeductPercent: 0,
};

function staffRow(
  id: string,
  name: string,
  department_name: string | null,
  extra?: Partial<Parameters<typeof calculateGratuityRun>[0]["staff"][number]>,
) {
  return {
    id,
    emp_no: id.toUpperCase(),
    full_name: name,
    department_id: null,
    department_name,
    position_id: null,
    position_name: "Staff",
    joining_date: "2024-01-01",
    termination_date: null,
    employment_ended_as: null,
    tip_points: 1.5,
    ...extra,
  };
}

describe("missed pool recipients", () => {
  it("allocates Social Media & Marketing on the Office share", () => {
    const marketing = staffRow("m1", "Tasmia Banu", "Social Media & Marketing");
    const cashier = staffRow("o1", "Office Cashier", "Finance & Accounts");
    const result = calculateGratuityRun({
      settings,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      staff: [marketing, cashier],
      waiterSales: [],
      scheduleDays: [
        { staff_id: marketing.id, work_date: "2026-07-01", label_code: "SHIFT" },
        { staff_id: cashier.id, work_date: "2026-07-01", label_code: "SHIFT" },
      ],
    });

    const marketingRow = result.allocations.find(
      (a) => a.staff_id === marketing.id,
    );
    expect(marketingRow).toBeTruthy();
    expect(
      (marketingRow?.meta as { departmentKey?: string }).departmentKey,
    ).toBe("office");
    expect(
      result.warnings.some((w) => /left off Allocations/i.test(w)),
    ).toBe(false);
  });

  it("warns when an entitled employee with worked days has no pool department", () => {
    const cook = staffRow("k1", "Kitchen Cook", "Culinary", {
      position_name: "Commis Chef",
    });
    const unknown = staffRow("x1", "Facilities Lead", "Facilities");
    const result = calculateGratuityRun({
      settings,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      staff: [cook, unknown],
      waiterSales: [],
      scheduleDays: [
        { staff_id: cook.id, work_date: "2026-07-01", label_code: "SHIFT" },
        { staff_id: unknown.id, work_date: "2026-07-01", label_code: "SHIFT" },
      ],
    });

    expect(result.allocations.find((a) => a.staff_id === unknown.id)).toBeUndefined();
    const warning = result.warnings.find((w) => /left off Allocations/i.test(w));
    expect(warning).toMatch(/Facilities Lead \(X1\)/);
    expect(warning).toMatch(/Facilities/);
    expect(warning).toMatch(/1 worked day/);
  });

  it("does not warn for floor waiters or staff with no worked days", () => {
    const waiter = staffRow("w1", "Floor Waiter", "F&B Service", {
      position_name: "Waiter",
      is_floor_waiter: true,
    });
    const onLeave = staffRow("k2", "Chef On Leave", "Culinary", {
      position_name: "Commis Chef",
    });
    const result = calculateGratuityRun({
      settings,
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      staff: [waiter, onLeave],
      waiterSales: [],
      scheduleDays: [
        { staff_id: waiter.id, work_date: "2026-07-01", label_code: "SHIFT" },
        { staff_id: onLeave.id, work_date: "2026-07-01", label_code: "UPL" },
      ],
    });

    expect(
      result.warnings.some((w) => /left off Allocations/i.test(w)),
    ).toBe(false);
  });
});
