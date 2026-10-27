import { describe, expect, it } from "vitest";
import { calculateGratuityRun } from "../calculate-gratuity";
import { DEFAULT_HR_GRATUITY_SETTINGS, type BarFlowKey } from "../types";

describe("bar cash equal split", () => {
  it("gives nothing to staff with a 100% disciplinary deduction", () => {
    const bartender = {
      id: "bartender",
      emp_no: "ORL0001",
      full_name: "Bartender",
      department_id: null,
      department_name: "Beverage",
      position_id: null,
      position_name: "Bartender",
      joining_date: "2024-01-01",
      termination_date: null,
      employment_ended_as: null,
      tip_points: 1.5,
    } as const;
    const penalised = {
      ...bartender,
      id: "penalised",
      emp_no: "ORL0052",
      full_name: "Penalised",
      warning_level: "final" as const,
    };

    const result = calculateGratuityRun({
      settings: {
        ...DEFAULT_HR_GRATUITY_SETTINGS,
        barCashEqualSplit: true,
        disciplinaryDeductions: [{ level: "final", percent: 100 }],
        runnerHousekeeperDeductPercent: 0,
        poolOseDeductPercent: 0,
        poolStaffActivitiesDeductPercent: 0,
      },
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      staff: [bartender, penalised],
      waiterSales: [
        {
          waiter_id: "bar-1",
          staff_id: bartender.id,
          waiter_name: bartender.full_name,
          position: "Bartender",
          cash_gs: 1_000,
          cc_gs: 0,
          total_sales_gs: 5_000,
          total_covers: 50,
        },
      ],
      scheduleDays: [
        { staff_id: bartender.id, work_date: "2026-09-01", label_code: "SHIFT" },
        { staff_id: penalised.id, work_date: "2026-09-01", label_code: "SHIFT" },
      ],
    });

    const byId = new Map(result.allocations.map((a) => [a.staff_id, a]));
    expect(byId.get(penalised.id)?.amount ?? 0).toBe(0);
    expect(byId.get(bartender.id)?.amount).toBe(1_000);
  });

  it("books unticked bar lines to collections instead of distributing them", () => {
    const bartender = {
      id: "bartender",
      emp_no: "ORL0001",
      full_name: "Bartender",
      department_id: null,
      department_name: "Beverage",
      position_id: null,
      position_name: "Bartender",
      joining_date: "2024-01-01",
      termination_date: null,
      employment_ended_as: null,
      tip_points: 1.5,
    } as const;
    const run = (excludedBarFlows: BarFlowKey[]) =>
      calculateGratuityRun({
        settings: {
          ...DEFAULT_HR_GRATUITY_SETTINGS,
          barCashEqualSplit: true,
          barCcPoolPercent: 50,
          barCcBarStaffPercent: 50,
          runnerHousekeeperDeductPercent: 0,
          poolOseDeductPercent: 0,
          poolStaffActivitiesDeductPercent: 0,
        },
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        staff: [bartender],
        waiterSales: [
          {
            waiter_id: "bar-1",
            staff_id: bartender.id,
            waiter_name: bartender.full_name,
            position: "Bartender",
            cash_gs: 300,
            cc_gs: 1_000,
            total_sales_gs: 5_000,
            total_covers: 50,
          },
        ],
        scheduleDays: [
          { staff_id: bartender.id, work_date: "2026-09-01", label_code: "SHIFT" },
        ],
        excludedBarFlows,
      });

    const all = run([]);
    expect(all.pool.barExcluded).toBe(0);
    expect(all.pool.gross).toBe(500);

    const noCash = run(["bar_cash"]);
    expect(noCash.pool.barExcluded).toBe(300);
    expect(noCash.pool.barCashToBarStaff).toBe(0);

    const noPool = run(["bar_cc_pool"]);
    expect(noPool.pool.barExcluded).toBe(500);
    expect(noPool.pool.gross).toBe(0);

    const noStaffCc = run(["bar_cc_bar_staff"]);
    expect(noStaffCc.pool.barExcluded).toBe(500);
    const paid = noStaffCc.allocations.find((a) => a.staff_id === bartender.id);
    expect((paid?.meta.waiter as { barCcFundShare?: number } | null)?.barCcFundShare ?? 0).toBe(0);
  });
});
