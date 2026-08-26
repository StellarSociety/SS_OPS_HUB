import { describe, expect, it } from "vitest";
import {
  collectedBenefitDeductionCuts,
  countPaidRecipientsAfterFloor,
  netBenefitPayout,
  sumPaidDistributedAfterFloor,
} from "../deductions";
import { payrollBenefitPayoutAmount } from "../rounding";

describe("collectedBenefitDeductionCuts", () => {
  it("takes pool-only cuts from non-contributors and retain-then-pool from contributors", () => {
    const appliedByStaff = new Map([
      ["kitchen-1", 40],
      ["waiter-1", 30],
    ]);
    const total = collectedBenefitDeductionCuts({
      appliedByStaff,
      allocations: [
        {
          staffId: "kitchen-1",
          amount: 200,
          poolShare: 200,
          retain: 0,
          excluded: false,
        },
        {
          staffId: "waiter-1",
          amount: 50,
          poolShare: 50,
          retain: 80,
          excluded: false,
        },
      ],
      contributors: [
        { staffId: "waiter-1", retain: 80, withheld: false },
      ],
    });
    // kitchen: min(40, 200) = 40
    // waiter retain cut 30, pool cut 0
    expect(total).toBe(70);
  });

  it("skips excluded allocations and withheld contributors", () => {
    const appliedByStaff = new Map([
      ["excluded-1", 25],
      ["withheld-1", 15],
    ]);
    const total = collectedBenefitDeductionCuts({
      appliedByStaff,
      allocations: [
        {
          staffId: "excluded-1",
          amount: 100,
          poolShare: 100,
          retain: 0,
          excluded: true,
        },
      ],
      contributors: [
        { staffId: "withheld-1", retain: 90, withheld: true },
      ],
    });
    expect(total).toBe(0);
  });
});

describe("sumPaidDistributedAfterFloor", () => {
  it("floors nets after pool cuts and skips withheld retain", () => {
    const paid = sumPaidDistributedAfterFloor({
      appliedByStaff: new Map([["kitchen-1", 42]]),
      allocations: [
        {
          staffId: "kitchen-1",
          amount: 200,
          poolShare: 200,
          retain: 0,
          excluded: false,
        },
        {
          staffId: "waiter-1",
          amount: 81,
          poolShare: 0,
          retain: 81,
          excluded: false,
        },
      ],
      contributors: [
        { staffId: "waiter-1", retain: 81, withheld: false },
        { staffId: "waiter-2", retain: 50, withheld: true },
      ],
    });
    // waiter 81 → 80; withheld skipped. Recipients: 2
    expect(paid).toBe(235);
    expect(
      countPaidRecipientsAfterFloor({
        appliedByStaff: new Map([["kitchen-1", 50]]),
        allocations: [
          {
            staffId: "kitchen-1",
            amount: 50,
            poolShare: 50,
            retain: 0,
            excluded: false,
          },
        ],
        contributors: [],
      }),
    ).toBe(0);
  });
});

describe("netBenefitPayout for payroll", () => {
  it("subtracts kitchen-aid cuts then floors to the rounded gratuity", () => {
    const net = netBenefitPayout({
      amount: 280.99,
      poolShare: 280.99,
      retain: 0,
      excluded: false,
      applied: 180.99,
      isContributor: false,
      withheld: false,
    });
    expect(net).toBe(100);
    expect(payrollBenefitPayoutAmount("tips", net)).toBe(100);
  });
});
