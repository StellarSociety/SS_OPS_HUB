import { describe, expect, it } from "vitest";
import { computeDailySales } from "@/lib/sales/daily-sales-calculations";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import { buildDailyVsWaitersRows } from "@/lib/sales/daily-vs-waiters-calculations";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";

const DATE = "2026-10-12";

function daily(partial: Partial<VenueDailySalesRecord>): VenueDailySalesRecord {
  return {
    id: "d1", venue_id: "v", sale_date: DATE,
    lunch_food_gs: 0, lunch_beverages_gs: 0, lunch_wine_gs: 0, lunch_shisha_gs: 0,
    lunch_tobacco_gs: 0, lunch_others_gs: 0, lunch_service_fees_gs: 0,
    lunch_covers: 0, lunch_complimentary_covers: 0, lunch_bookings: 0,
    lunch_walkin_tables: 0, lunch_walkin_covers: 0,
    dinner_food_gs: 0, dinner_beverages_gs: 0, dinner_wine_gs: 0, dinner_shisha_gs: 0,
    dinner_tobacco_gs: 0, dinner_others_gs: 0, dinner_service_fees_gs: 0,
    dinner_covers: 0, dinner_complimentary_covers: 0, dinner_bookings: 0,
    dinner_walkin_tables: 0, dinner_walkin_covers: 0,
    all_day_discount_gs: 0, vat_collected_gs: 0, municipality_fee_collected_gs: 0,
    service_charge_collected_gs: 0, created_by: null, updated_by: null, created_at: "", updated_at: "",
    ...partial,
  };
}

function waiter(partial: Partial<VenueWaiterDailySalesEntry>): VenueWaiterDailySalesEntry {
  return {
    id: "w1", venue_id: "v", waiter_id: "a", sale_date: DATE,
    total_sales_gs: 0, total_payments_gs: 0, gratuity_cc_gs: 0, gratuity_cash_gs: 0,
    groups_service_charge_gs: 0, total_covers: 0, complimentary_covers: 0, total_discounts_gs: 0,
    voucher_comments: "", deposit_comments: "", on_accounts_comments: "",
    created_by: null, updated_by: null, created_at: "", updated_at: "", tender_amounts: {},
    ...partial,
  };
}

describe("daily complimentary covers", () => {
  it("leaves complimentary covers out of the daily ASPH but keeps them in Total Covers", () => {
    const c = computeDailySales(daily({ dinner_food_gs: 800, dinner_covers: 10, dinner_complimentary_covers: 2 }), 0);
    expect(c.totalCovers).toBe(10);
    expect(c.totalComplimentaryCovers).toBe(2);
    expect(c.totalVenueDinnerAsph).toBe(100); // 800 / 8
  });

  it("Monthly vs Waiters flags a day whose complimentary covers differ", () => {
    const rows = buildDailyVsWaitersRows(
      "2026-10",
      [daily({ dinner_food_gs: 800, dinner_covers: 10, dinner_complimentary_covers: 2 })],
      [waiter({ total_sales_gs: 800, total_covers: 10, complimentary_covers: 1 })],
      0,
    );
    const day = rows.find((r) => r.sale_date === DATE)!;
    expect(day.coversDifference).toBe(0);
    expect(day.complimentaryCoversDifference).toBe(1);
    expect(day.isMatched).toBe(false);
  });

  it("matches when complimentary covers agree", () => {
    const rows = buildDailyVsWaitersRows(
      "2026-10",
      [daily({ dinner_food_gs: 800, dinner_covers: 10, dinner_complimentary_covers: 2 })],
      [waiter({ total_sales_gs: 800, total_covers: 10, complimentary_covers: 2 })],
      0,
    );
    expect(rows.find((r) => r.sale_date === DATE)!.isMatched).toBe(true);
  });
});
