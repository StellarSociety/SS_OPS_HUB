import { describe, expect, it } from "vitest";
import {
  gsByMonthTick,
  revenueDayFromSalesRecord,
  sumGsForMonthTicks,
} from "@/lib/accounting/revenue-from-sales";
import {
  DEFAULT_TAX_SETTINGS,
  type VenueDailySalesRecord,
} from "@/lib/sales/daily-sales-types";

function record(
  partial: Partial<VenueDailySalesRecord> & Pick<VenueDailySalesRecord, "sale_date">,
): VenueDailySalesRecord {
  return {
    id: partial.sale_date,
    venue_id: "venue",
    lunch_food_gs: 0,
    lunch_beverages_gs: 0,
    lunch_wine_gs: 0,
    lunch_shisha_gs: 0,
    lunch_tobacco_gs: 0,
    lunch_others_gs: 0,
    lunch_service_fees_gs: 0,
    lunch_covers: 0,
    lunch_bookings: 0,
    lunch_walkin_tables: 0,
    lunch_walkin_covers: 0,
    dinner_food_gs: 0,
    dinner_beverages_gs: 0,
    dinner_wine_gs: 0,
    dinner_shisha_gs: 0,
    dinner_tobacco_gs: 0,
    dinner_others_gs: 0,
    dinner_service_fees_gs: 0,
    dinner_covers: 0,
    dinner_bookings: 0,
    dinner_walkin_tables: 0,
    dinner_walkin_covers: 0,
    all_day_discount_gs: 0,
    vat_collected_gs: 0,
    municipality_fee_collected_gs: 0,
    service_charge_collected_gs: 0,
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("revenueDayFromSalesRecord", () => {
  it("sums lunch and dinner GS per center, including all service fees", () => {
    const day = revenueDayFromSalesRecord(
      record({
        sale_date: "2026-09-21",
        lunch_food_gs: 100,
        dinner_food_gs: 40,
        lunch_beverages_gs: 10,
        dinner_beverages_gs: 5,
        lunch_wine_gs: 20,
        dinner_wine_gs: 30,
        lunch_shisha_gs: 8,
        dinner_shisha_gs: 2,
        lunch_tobacco_gs: 3,
        dinner_tobacco_gs: 1,
        lunch_others_gs: 4,
        dinner_others_gs: 6,
        lunch_service_fees_gs: 7,
        dinner_service_fees_gs: 9,
      }),
      DEFAULT_TAX_SETTINGS,
    );

    expect(day.weekDay).toBe("MON");
    expect(day.foodGs).toBe(140);
    expect(day.beveragesGs).toBe(15);
    expect(day.wineGs).toBe(50);
    expect(day.shishaGs).toBe(10);
    expect(day.tobaccoGs).toBe(4);
    expect(day.othersGs).toBe(10);
    expect(day.serviceFeesGs).toBe(16);
    expect(day.dailyTotalGs).toBe(245);
    expect(day.netRevenueGs).toBe(200);
    expect(day.municipalityGs).toBe(14);
    expect(day.vatGs).toBe(10);
    expect(day.vatOnServiceChargeGs).toBe(1);
    expect(day.serviceChargeGs).toBe(20);
    expect(
      day.netRevenueGs +
        day.municipalityGs +
        day.vatGs +
        day.vatOnServiceChargeGs +
        day.serviceChargeGs,
    ).toBe(day.dailyTotalGs);
  });
});

describe("sumGsForMonthTicks", () => {
  it("buckets daily totals onto 0-based month ticks", () => {
    const days = [
      revenueDayFromSalesRecord(
        record({ sale_date: "2026-09-01", lunch_food_gs: 100 }),
        DEFAULT_TAX_SETTINGS,
      ),
      revenueDayFromSalesRecord(
        record({ sale_date: "2026-09-02", dinner_service_fees_gs: 25 }),
        DEFAULT_TAX_SETTINGS,
      ),
      revenueDayFromSalesRecord(
        record({ sale_date: "2026-08-31", lunch_wine_gs: 10 }),
        DEFAULT_TAX_SETTINGS,
      ),
    ];
    const points = [
      { key: "2026-7" },
      { key: "2026-8" },
    ];

    expect(gsByMonthTick(days, points)).toEqual([10, 125]);
    expect(sumGsForMonthTicks(days, points)).toBe(135);
  });
});
