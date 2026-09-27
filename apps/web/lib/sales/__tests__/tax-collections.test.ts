import { describe, expect, it } from "vitest";
import {
  splitCollectedVat,
  taxCollectionDayFromSalesRecord,
} from "@/lib/sales/tax-collections";
import {
  DEFAULT_TAX_SETTINGS,
  type VenueDailySalesRecord,
} from "@/lib/sales/daily-sales-types";

function record(
  partial: Partial<VenueDailySalesRecord> &
    Pick<VenueDailySalesRecord, "sale_date">,
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

describe("splitCollectedVat", () => {
  it("splits entered VAT into VAT and VAT on service using the venue rates", () => {
    const split = splitCollectedVat(268.4, DEFAULT_TAX_SETTINGS);
    expect(split.vatGs).toBe(244);
    expect(split.vatOnServiceChargeGs).toBe(24.4);
    expect(split.vatGs + split.vatOnServiceChargeGs).toBe(268.4);
  });
});

describe("taxCollectionDayFromSalesRecord", () => {
  it("uses the collected municipality, VAT, and service charge", () => {
    const day = taxCollectionDayFromSalesRecord(
      record({
        sale_date: "2026-09-21",
        municipality_fee_collected_gs: 341.6,
        vat_collected_gs: 268.4,
        service_charge_collected_gs: 488,
      }),
      DEFAULT_TAX_SETTINGS,
    );

    expect(day.weekDay).toBe("MON");
    expect(day.municipalityGs).toBe(341.6);
    expect(day.vatGs).toBe(244);
    expect(day.vatOnServiceChargeGs).toBe(24.4);
    expect(day.taxTotalGs).toBe(610);
    expect(day.serviceChargeGs).toBe(488);
    expect(day.totalCollectedGs).toBe(1098);
  });
});
