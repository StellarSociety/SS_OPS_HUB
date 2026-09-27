import type { MonthTick } from "@/lib/accounting/cash-flow-periods";
import { roundMoney } from "@/lib/accounting/money";
import {
  getIsoWeekNumber,
  getWeekDayLabel,
  totalTaxRatePct,
} from "@/lib/sales/daily-sales-calculations";
import { computeTaxCollectionExpected } from "@/lib/sales/figures-alerts-calculations";
import type {
  TaxSettingsInput,
  VenueDailySalesRecord,
} from "@/lib/sales/daily-sales-types";

/** One day of gross sales, lunch and dinner combined, by revenue center. */
export type AccountingRevenueDay = {
  saleDate: string;
  weekNumber: number;
  weekDay: string;
  foodGs: number;
  beveragesGs: number;
  wineGs: number;
  shishaGs: number;
  tobaccoGs: number;
  othersGs: number;
  serviceFeesGs: number;
  dailyTotalGs: number;
  /** Municipality fee on net revenue. */
  municipalityGs: number;
  /** VAT on net revenue, excluding VAT charged on the service charge. */
  vatGs: number;
  /** VAT charged on the service charge amount. */
  vatOnServiceChargeGs: number;
  /** Service charge on net revenue, before VAT on that charge. */
  serviceChargeGs: number;
  /** Daily total after municipality, VAT, VAT on service charge, and service charge. */
  netRevenueGs: number;
};

function num(value: number | null | undefined): number {
  const parsed = Number(value);
  return roundMoney(Number.isFinite(parsed) ? parsed : 0, 2);
}

/**
 * GS subtotals from a daily sales row. Service fees are lunch + dinner.
 * The daily total is the amount counted as receivables and income.
 * Tax, service charge, and net revenue use the same split as Daily Sales
 * tax collection.
 */
export function revenueDayFromSalesRecord(
  record: VenueDailySalesRecord,
  taxSettings: TaxSettingsInput,
): AccountingRevenueDay {
  const foodGs = num(record.lunch_food_gs) + num(record.dinner_food_gs);
  const beveragesGs =
    num(record.lunch_beverages_gs) + num(record.dinner_beverages_gs);
  const wineGs = num(record.lunch_wine_gs) + num(record.dinner_wine_gs);
  const shishaGs = num(record.lunch_shisha_gs) + num(record.dinner_shisha_gs);
  const tobaccoGs =
    num(record.lunch_tobacco_gs) + num(record.dinner_tobacco_gs);
  const othersGs = num(record.lunch_others_gs) + num(record.dinner_others_gs);
  const serviceFeesGs =
    num(record.lunch_service_fees_gs) + num(record.dinner_service_fees_gs);
  const dailyTotalGs = roundMoney(
    foodGs +
      beveragesGs +
      wineGs +
      shishaGs +
      tobaccoGs +
      othersGs +
      serviceFeesGs,
    2,
  );
  const split = computeTaxCollectionExpected(
    dailyTotalGs,
    taxSettings,
    totalTaxRatePct(taxSettings),
  );
  const vatOnServiceChargeGs = roundMoney(
    split.serviceChargeExpected *
      (taxSettings.vat_on_service_charge_pct / 100),
    2,
  );
  const vatGs = roundMoney(split.vatExpected - vatOnServiceChargeGs, 2);

  return {
    saleDate: record.sale_date,
    weekNumber: getIsoWeekNumber(record.sale_date),
    weekDay: getWeekDayLabel(record.sale_date),
    foodGs,
    beveragesGs,
    wineGs,
    shishaGs,
    tobaccoGs,
    othersGs,
    serviceFeesGs,
    dailyTotalGs,
    municipalityGs: split.municipalityExpected,
    vatGs,
    vatOnServiceChargeGs,
    serviceChargeGs: split.serviceChargeExpected,
    netRevenueGs: split.netSales,
  };
}

export function revenueDaysFromSales(
  records: VenueDailySalesRecord[],
  taxSettings: TaxSettingsInput,
): AccountingRevenueDay[] {
  return records
    .map((record) => revenueDayFromSalesRecord(record, taxSettings))
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate));
}

/** Cash-flow month ticks use a 0-based month index: `2026-8` is September. */
export function monthTickKeyFromSaleDate(saleDate: string): string {
  const [year, month] = saleDate.split("-").map(Number);
  return `${year}-${(month || 1) - 1}`;
}

export function gsByMonthTick(
  days: AccountingRevenueDay[],
  points: Pick<MonthTick, "key">[],
): number[] {
  const totals = new Map<string, number>();
  for (const day of days) {
    const key = monthTickKeyFromSaleDate(day.saleDate);
    totals.set(
      key,
      roundMoney((totals.get(key) ?? 0) + day.dailyTotalGs, 2),
    );
  }
  return points.map((point) => totals.get(point.key) ?? 0);
}

export function sumGsForMonthTicks(
  days: AccountingRevenueDay[],
  points: Pick<MonthTick, "key">[],
): number {
  return roundMoney(
    gsByMonthTick(days, points).reduce((sum, value) => sum + value, 0),
    2,
  );
}
