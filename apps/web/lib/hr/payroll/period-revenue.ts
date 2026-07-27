import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeDailySales,
  totalTaxRateFromSettings,
} from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
} from "@/lib/sales/daily-sales-store";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import { round2 } from "./daily-rate";
import { calendarDaysInclusive } from "./period";

export type PayrollPeriodNetRevenue = {
  netRevenue: number;
  daysWithSales: number;
  daysInPeriod: number;
};

/** Sum venue net revenue from daily sales for a payroll period (inclusive dates). */
export async function sumVenueNetRevenueForPeriod(
  supabase: SupabaseClient,
  venueId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PayrollPeriodNetRevenue> {
  const start = periodStart.slice(0, 10);
  const end = periodEnd.slice(0, 10);

  const [taxSettings, salesRes] = await Promise.all([
    getVenueSalesTaxSettings(supabase, venueId),
    supabase
      .from("venue_daily_sales")
      .select("*")
      .eq("venue_id", venueId)
      .gte("sale_date", start)
      .lte("sale_date", end),
  ]);

  if (salesRes.error) {
    throw new Error(salesRes.error.message);
  }

  const totalTaxPct = totalTaxRateFromSettings(taxSettings);
  let netRevenue = 0;
  let daysWithSales = 0;

  for (const row of salesRes.data ?? []) {
    const computed = computeDailySales(
      row as VenueDailySalesRecord,
      totalTaxPct,
    );
    netRevenue += computed.totalVenueNet;
    if (computed.totalVenueGs > 0) {
      daysWithSales += 1;
    }
  }

  return {
    netRevenue: round2(netRevenue),
    daysWithSales,
    daysInPeriod: calendarDaysInclusive(start, end),
  };
}

/** Payroll net as a percentage of period venue net revenue. */
export function payrollOverRevenuePct(
  netPayroll: number | null | undefined,
  netRevenue: number | null | undefined,
): number | null {
  const payroll = netPayroll != null ? Number(netPayroll) : null;
  const revenue = netRevenue != null ? Number(netRevenue) : null;
  if (
    payroll == null ||
    revenue == null ||
    Number.isNaN(payroll) ||
    Number.isNaN(revenue) ||
    revenue <= 0
  ) {
    return null;
  }
  return round2((payroll / revenue) * 100);
}
