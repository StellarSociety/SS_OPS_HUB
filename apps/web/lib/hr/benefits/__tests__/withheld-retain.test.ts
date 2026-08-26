import { describe, expect, it } from "vitest";
import { calculateGratuityRun } from "../calculate-gratuity";
import { DEFAULT_HR_GRATUITY_SETTINGS } from "../types";

const settings = {
  ...DEFAULT_HR_GRATUITY_SETTINGS,
  waiterCashRetainPercent: 100,
  waiterCashPoolPercent: 0,
  waiterCcCollectionTipOutPercent: 0,
  runnerHousekeeperDeductPercent: 0,
  poolOseDeductPercent: 0,
  poolStaffActivitiesDeductPercent: 0,
  departmentShares: [{ key: "kitchen", label: "Kitchen", percent: 100 }],
};

const waiter = {
  id: "waiter-1",
  emp_no: "W1",
  full_name: "Terminated Waiter",
  department_id: null,
  department_name: "F&B Service",
  position_id: null,
  position_name: "Waiter",
  joining_date: "2024-01-01",
  termination_date: "2026-07-15",
  employment_ended_as: "termination" as const,
  is_floor_waiter: true,
};

const cook = {
  id: "cook-1",
  emp_no: "K1",
  full_name: "Kitchen Cook",
  department_id: null,
  department_name: "Kitchen",
  position_id: null,
  position_name: "Commis Chef",
  joining_date: "2024-01-01",
  termination_date: null,
  employment_ended_as: null,
  tip_points: 1.5,
};

const waiterSales = [
  {
    waiter_id: "pos-waiter-1",
    staff_id: waiter.id,
    waiter_name: waiter.full_name,
    position: "Waiter",
    cash_gs: 1000,
    cc_gs: 0,
    total_sales_gs: 10000,
    total_covers: 100,
  },
];

const scheduleDays = [
  { staff_id: cook.id, work_date: "2026-07-01", label_code: "SHIFT" },
];

function run(opts?: {
  waiveWithheldRetain?: boolean;
  withheldRetainToPool?: boolean;
}) {
  return calculateGratuityRun({
    settings,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    staff: [waiter, cook],
    waiterSales,
    scheduleDays,
    ...opts,
  });
}

describe("withheld retain destinations", () => {
  it("books not-entitled retain to collections by default", () => {
    const result = run();
    expect(result.pool.withheldRetain).toBe(1000);
    expect(result.pool.withheldRetainToPool).toBe(0);
    expect(result.pool.net).toBe(0);
    expect(result.allocations.find((a) => a.staff_id === waiter.id)).toBeUndefined();
    expect(result.warnings.some((w) => /moved to collections/i.test(w))).toBe(
      true,
    );
  });

  it("pays not-entitled retain to the collector when waived", () => {
    const result = run({ waiveWithheldRetain: true });
    expect(result.pool.withheldRetain).toBe(0);
    expect(result.pool.withheldRetainToPool).toBe(0);
    expect(result.pool.net).toBe(0);
    expect(
      result.allocations.find((a) => a.staff_id === waiter.id)?.amount,
    ).toBe(1000);
  });

  it("adds not-entitled retain to the allocation share pool", () => {
    const result = run({ withheldRetainToPool: true });
    expect(result.pool.withheldRetain).toBe(0);
    expect(result.pool.withheldRetainToPool).toBe(1000);
    expect(result.pool.net).toBe(1000);
    expect(result.allocations.find((a) => a.staff_id === waiter.id)).toBeUndefined();
    expect(
      result.allocations.find((a) => a.staff_id === cook.id)?.amount,
    ).toBe(1000);
    expect(
      result.warnings.some((w) => /moved to the allocation share pool/i.test(w)),
    ).toBe(true);
  });
});
