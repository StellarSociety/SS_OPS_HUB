import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeDailySales,
  grossToNet,
  totalTaxRatePct,
} from "@/lib/sales/daily-sales-calculations";
import {
  DEFAULT_TAX_SETTINGS,
  type VenueDailySalesRecord,
} from "@/lib/sales/daily-sales-types";
import type { VenueDailyDiscountsRecord } from "@/lib/sales/discounts-types";
import type { CostCentre, CosWeekSalesSnapshot } from "@/lib/sales/cos-types";

/** Revenue-app gross columns that make up each cost centre's sales. */
export const CENTRE_SALES_FIELDS: Record<CostCentre, (keyof VenueDailySalesRecord)[]> =
  {
    food: ["lunch_food_gs", "dinner_food_gs"],
    beverage: ["lunch_beverages_gs", "dinner_beverages_gs"],
    wine: ["lunch_wine_gs", "dinner_wine_gs"],
    other: [
      "lunch_shisha_gs",
      "dinner_shisha_gs",
      "lunch_tobacco_gs",
      "dinner_tobacco_gs",
      "lunch_others_gs",
      "dinner_others_gs",
    ],
  };

const CENTRE_DISCOUNT_FIELDS: Record<
  CostCentre,
  (keyof VenueDailyDiscountsRecord)[]
> = {
  food: ["food_discount_gs"],
  beverage: ["beverages_discount_gs"],
  wine: ["wine_discount_gs"],
  other: ["shisha_discount_gs", "others_discount_gs"],
};

const ALL_DISCOUNT_FIELDS = [
  ...new Set(Object.values(CENTRE_DISCOUNT_FIELDS).flat()),
];

export type CosDailySalesRow = {
  date: string;
  /** False when the Revenue app has no daily sales entry for the date. */
  hasSales: boolean;
  restaurantSalesNet: number;
  centreSalesNet: number;
  /** Null when the Discounts page has no category breakdown for the date. */
  centreDiscountNet: number | null;
  /**
   * The day's total discounts: the all-day discount from the daily sales
   * entry, falling back to the Discounts page breakdown when there isn't one.
   */
  totalDiscountNet: number;
};

export type CosDailySalesResult = {
  rows: CosDailySalesRow[];
  totalTaxPct: number;
};

function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  // Guard against inverted or huge ranges.
  for (let i = 0; d <= end && i < 400; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** The venue's total tax % (VAT + municipality + service), read-only. */
export async function getVenueTotalTaxPct(
  supabase: SupabaseClient,
  venueId: string,
): Promise<number> {
  // Read-only: don't create default settings from a GP & COS page.
  const { data } = await supabase
    .from("venue_sales_tax_settings")
    .select("*")
    .eq("venue_id", venueId)
    .maybeSingle();
  return totalTaxRatePct({
    ...DEFAULT_TAX_SETTINGS,
    ...(data
      ? {
          municipality_fee_pct: num(data.municipality_fee_pct),
          vat_pct: num(data.vat_pct),
          service_charge_pct: num(data.service_charge_pct),
          vat_on_service_charge_pct: num(data.vat_on_service_charge_pct),
        }
      : {}),
  });
}

/**
 * Daily NET restaurant sales, cost-centre sales and cost-centre discounts
 * from the Revenue app (venue_daily_sales + venue_daily_discounts).
 * Net = gross ÷ (1 + total tax %), the same conversion the Revenue app uses.
 */
export async function getCosDailySales(
  supabase: SupabaseClient,
  venueId: string,
  centre: CostCentre,
  from: string,
  to: string,
): Promise<CosDailySalesResult> {
  const [salesRes, discountRes, totalTaxPct] = await Promise.all([
    supabase
      .from("venue_daily_sales")
      .select("*")
      .eq("venue_id", venueId)
      .gte("sale_date", from)
      .lte("sale_date", to),
    supabase
      .from("venue_daily_discounts")
      .select("*")
      .eq("venue_id", venueId)
      .gte("sale_date", from)
      .lte("sale_date", to),
    getVenueTotalTaxPct(supabase, venueId),
  ]);
  if (salesRes.error) throw salesRes.error;
  if (discountRes.error) throw discountRes.error;

  const salesByDate = new Map<string, VenueDailySalesRecord>();
  for (const row of (salesRes.data ?? []) as VenueDailySalesRecord[]) {
    // Normalise numeric strings / nulls so computeDailySales can add them.
    const clean = { ...row } as Record<string, unknown>;
    for (const [k, v] of Object.entries(clean)) {
      if (
        k.endsWith("_gs") ||
        k.endsWith("_covers") ||
        k.endsWith("_bookings") ||
        k.endsWith("_tables")
      ) {
        clean[k] = num(v);
      }
    }
    salesByDate.set(
      String(row.sale_date).slice(0, 10),
      clean as VenueDailySalesRecord,
    );
  }
  const discountByDate = new Map<string, VenueDailyDiscountsRecord>();
  for (const row of (discountRes.data ?? []) as VenueDailyDiscountsRecord[]) {
    discountByDate.set(String(row.sale_date).slice(0, 10), row);
  }

  const rows = eachDate(from, to).map((date) => {
    const sales = salesByDate.get(date);
    const discount = discountByDate.get(date);
    const restaurantGs = sales
      ? computeDailySales(sales, totalTaxPct).totalVenueGs
      : 0;
    const centreGs = sales
      ? CENTRE_SALES_FIELDS[centre].reduce((s, f) => s + num(sales[f]), 0)
      : 0;
    const totalDiscountGs = sales
      ? num(sales.all_day_discount_gs)
      : discount
        ? ALL_DISCOUNT_FIELDS.reduce((s, f) => s + num(discount[f]), 0)
        : 0;
    const discountGs = discount
      ? CENTRE_DISCOUNT_FIELDS[centre].reduce((s, f) => s + num(discount[f]), 0)
      : null;
    return {
      date,
      hasSales: Boolean(sales),
      restaurantSalesNet: grossToNet(restaurantGs, totalTaxPct),
      centreSalesNet: grossToNet(centreGs, totalTaxPct),
      centreDiscountNet:
        discountGs == null ? null : grossToNet(discountGs, totalTaxPct),
      totalDiscountNet: grossToNet(totalDiscountGs, totalTaxPct),
    };
  });

  return { rows, totalTaxPct };
}

/**
 * The week's NET sales figures a cost run imports (restaurant sales, centre
 * sales, centre discounts). Days without a discounts breakdown count as 0.
 */
export async function getCosWeekImportSnapshot(
  supabase: SupabaseClient,
  venueId: string,
  centre: CostCentre,
  weekStart: string,
  weekEnd: string,
): Promise<CosWeekSalesSnapshot> {
  const { rows } = await getCosDailySales(
    supabase,
    venueId,
    centre,
    weekStart,
    weekEnd,
  );
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    restaurant_sales_gs: round2(
      rows.reduce((s, r) => s + r.restaurantSalesNet, 0),
    ),
    sales_gs: round2(rows.reduce((s, r) => s + r.centreSalesNet, 0)),
    sales_discount_gs: round2(
      rows.reduce((s, r) => s + (r.centreDiscountNet ?? 0), 0),
    ),
  };
}
