import { describe, expect, it } from "vitest";
import {
  autoDiscountAdjustment,
  deriveCosRun,
  sumAdjustments,
} from "@/lib/sales/cos-calculations";
import type { VenueCosAdjustment } from "@/lib/sales/cos-types";

function adj(amount_gs: number, source: VenueCosAdjustment["source"]) {
  return { amount_gs, source } as VenueCosAdjustment;
}

describe("cost run adjustments", () => {
  it("adds additions, subtracts deductions and ignores neutral rows", () => {
    const total = sumAdjustments([
      adj(100, "manual"), // (+) addition
      adj(-40, "manual"), // (-) deduction
      adj(-622.23, "auto_discount"), // auto deduction
      adj(250, "transfer"), // transfer in
      adj(999, "neutral"), // recorded only
    ]);
    expect(total).toBeCloseTo(100 - 40 - 622.23 + 250, 2);
  });

  it("cost of sales = purchases + opening − closing + adjustments", () => {
    const d = deriveCosRun(
      { sales_gs: 30000, purchases_gs: 12500, opening_stock_gs: 1000, closing_stock_gs: 800 },
      -522.23,
    );
    expect(d.costOfSales).toBeCloseTo(12500 + 1000 - 800 - 522.23, 2);
    expect(d.grossProfit).toBeCloseTo(30000 - d.costOfSales, 2);
  });

  it("auto adjustment is a deduction of the configured % of discounts", () => {
    expect(autoDiscountAdjustment(2074.11, 30)).toBeCloseTo(-622.23, 2);
    expect(autoDiscountAdjustment(2074.11, 0)).toBe(0);
  });
});
