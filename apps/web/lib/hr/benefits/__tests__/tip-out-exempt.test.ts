import { describe, expect, it } from "vitest";
import { calculateGratuityRun } from "../calculate-gratuity";
import { DEFAULT_HR_GRATUITY_SETTINGS } from "../types";

const settings = {
  ...DEFAULT_HR_GRATUITY_SETTINGS,
  waiterCcTipOutMode: "collection_percent" as const,
  waiterCashRetainPercent: 70,
  waiterCashPoolPercent: 30,
  waiterCcCollectionTipOutPercent: 30,
  runnerHousekeeperDeductPercent: 10,
  poolOseDeductPercent: 0,
  poolStaffActivitiesDeductPercent: 0,
};

const waiter = {
  id: "waiter-1",
  emp_no: "W1",
  full_name: "Floor Waiter",
  department_id: null,
  department_name: "F&B Service",
  position_id: null,
  position_name: "Waiter",
  joining_date: "2024-01-01",
  termination_date: null,
  employment_ended_as: null,
  is_floor_waiter: true,
};

const waiterSales = [
  {
    waiter_id: "pos-waiter-1",
    staff_id: waiter.id,
    waiter_name: waiter.full_name,
    position: "Waiter",
    cash_gs: 500,
    cc_gs: 1000,
    total_sales_gs: 10000,
    total_covers: 100,
  },
];

function run(tipOutExemptStaffIds?: string[]) {
  return calculateGratuityRun({
    settings,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    staff: [waiter],
    waiterSales,
    scheduleDays: [],
    tipOutExemptStaffIds,
  });
}

describe("tip-out exempt contributors", () => {
  it("tips out normally by default", () => {
    const contributor = run().contributors.find((c) => c.staffId === waiter.id);
    expect(contributor?.contributedToPool).toBeGreaterThan(0);
    expect(contributor?.retain).toBeLessThan(1500);
    expect(contributor?.tipOutExempt).toBe(false);
  });

  it("keeps everything collected when exempt", () => {
    const result = run([waiter.id]);
    const contributor = result.contributors.find((c) => c.staffId === waiter.id);
    expect(contributor?.contributedToPool).toBe(0);
    expect(contributor?.retain).toBe(1500);
    expect(contributor?.tipOutExempt).toBe(true);
    expect(result.pool.waiterCashTipOut).toBe(0);
    expect(result.pool.waiterCcTipOut).toBe(0);
  });
});
