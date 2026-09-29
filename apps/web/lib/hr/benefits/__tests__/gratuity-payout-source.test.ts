import { describe, expect, it } from "vitest";
import { calculateGratuityRun } from "../calculate-gratuity";
import { DEFAULT_HR_GRATUITY_SETTINGS } from "../types";
import type { GratuityPayoutSource } from "../staff-overrides";

function calculateFor(source: GratuityPayoutSource) {
  const contributor = {
    id: "collector",
    emp_no: "ORL0014",
    full_name: "Collector",
    department_id: null,
    department_name: "F&B Service",
    position_id: null,
    position_name: "F&B Supervisor",
    joining_date: "2024-01-01",
    termination_date: null,
    employment_ended_as: null,
    tip_points: 2,
    gratuity_payout_source: source,
  } as const;
  const colleague = {
    ...contributor,
    id: "colleague",
    emp_no: "ORL0099",
    full_name: "Colleague",
    gratuity_payout_source: "both" as const,
  };

  return calculateGratuityRun({
    settings: {
      ...DEFAULT_HR_GRATUITY_SETTINGS,
      waiterCcTipOutMode: "collection_percent",
      waiterCcCollectionTipOutPercent: 30,
      runnerHousekeeperDeductPercent: 0,
      poolOseDeductPercent: 0,
      poolStaffActivitiesDeductPercent: 0,
    },
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    staff: [contributor, colleague],
    waiterSales: [
      {
        waiter_id: "waiter-1",
        staff_id: contributor.id,
        waiter_name: contributor.full_name,
        position: contributor.position_name,
        cash_gs: 100,
        cc_gs: 100,
        total_sales_gs: 1_000,
        total_covers: 10,
      },
    ],
    scheduleDays: [
      { staff_id: contributor.id, work_date: "2026-08-01", label_code: "SHIFT" },
      { staff_id: colleague.id, work_date: "2026-08-01", label_code: "SHIFT" },
    ],
  }).allocations.find((row) => row.staff_id === contributor.id)!;
}

describe("gratuity payout source", () => {
  it("pays both components by default and supports either component alone", () => {
    const both = calculateFor("both");
    const retained = calculateFor("retained");
    const allocation = calculateFor("allocation");
    const retain = Number(both.meta.retain);
    const poolShare = Number(both.meta.poolShare);

    expect(retain).toBeGreaterThan(0);
    expect(poolShare).toBeGreaterThan(0);
    expect(both.amount).toBeCloseTo(retain + poolShare, 2);
    expect(retained.amount).toBe(retain);
    expect(allocation.amount).toBe(poolShare);
    expect(retained.meta.gratuityPayoutSource).toBe("retained");
    expect(allocation.meta.gratuityPayoutSource).toBe("allocation");
  });
});
