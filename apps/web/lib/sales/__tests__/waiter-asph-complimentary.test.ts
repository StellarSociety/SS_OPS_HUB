import { describe, expect, it } from "vitest";
import { asphCovers, computeWaiterSales } from "../waiter-sales-calculations";

describe("complimentary covers and waiter ASPH", () => {
  it("leaves complimentary covers out of ASPH", () => {
    // 10 guests, 2 on a free table: 1000 / 8 = 125
    expect(computeWaiterSales({ total_sales_gs: 1000, total_covers: 10, complimentary_covers: 2 }).asph).toBe(125);
  });

  it("matches the old ASPH when there are no complimentary covers", () => {
    expect(computeWaiterSales({ total_sales_gs: 1000, total_covers: 10 }).asph).toBe(100);
    expect(computeWaiterSales({ total_sales_gs: 1000, total_covers: 10, complimentary_covers: 0 }).asph).toBe(100);
  });

  it("never counts more complimentary covers than total covers", () => {
    expect(asphCovers({ total_covers: 3, complimentary_covers: 5 })).toBe(0);
    expect(computeWaiterSales({ total_sales_gs: 0, total_covers: 3, complimentary_covers: 3 }).asph).toBeNull();
  });
});
