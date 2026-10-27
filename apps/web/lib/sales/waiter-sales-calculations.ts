import {
  getIsoWeekNumber,
  getWeekDayLabel,
  grossToNet,
} from "./daily-sales-calculations";
import { FIGURES_ALERTS_TOLERANCE } from "./figures-alerts-calculations";
import {
  sumTenderAmounts,
  sumWaiterTendersForBalance,
} from "./tenders-calculations";
import type { VenueTender } from "./tenders-types";
import type {
  ComputedWaiterSales,
  VenueWaiterDailySalesEntry,
  VenueWaiterDailySalesRecord,
  WaiterSalesReconciliation,
  WaiterSalesTableComputed,
} from "./waiter-sales-types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Covers that count towards ASPH: Total Covers minus complimentary covers
 * (guests on tables given away for free don't pull the waiter's ASPH down).
 */
export function asphCovers(
  record: Pick<VenueWaiterDailySalesRecord, "total_covers"> &
    Partial<Pick<VenueWaiterDailySalesRecord, "complimentary_covers">>,
): number {
  const total = Number(record.total_covers) || 0;
  const comp = Math.min(total, Math.max(0, Number(record.complimentary_covers) || 0));
  return total - comp;
}

export function computeWaiterSales(
  record: Pick<VenueWaiterDailySalesRecord, "total_sales_gs" | "total_covers"> &
    Partial<Pick<VenueWaiterDailySalesRecord, "complimentary_covers">>,
): ComputedWaiterSales {
  const { total_sales_gs } = record;
  const covers = asphCovers(record);
  return {
    asph:
      covers > 0 && total_sales_gs > 0
        ? Math.round((total_sales_gs / covers) * 100) / 100
        : covers > 0
          ? 0
          : null,
  };
}

export function enrichWaiterSalesEntry(
  entry: VenueWaiterDailySalesEntry,
): VenueWaiterDailySalesEntry & ComputedWaiterSales {
  return {
    ...entry,
    ...computeWaiterSales(entry),
  };
}

export function computeWaiterSalesReconciliation(
  record: Pick<
    VenueWaiterDailySalesRecord,
    "total_sales_gs" | "total_payments_gs" | "gratuity_cc_gs"
  >,
  /**
   * Tender sum used for the balance check. Pass the sales-matching total
   * (excludes Voucher Issue & Redeem); Payment Total is still compared as entered.
   */
  tendersTotalForBalanceGs: number,
): WaiterSalesReconciliation {
  const expectedPaymentsGs = roundMoney(
    record.total_sales_gs + record.gratuity_cc_gs,
  );
  const paymentsDifferenceGs = roundMoney(
    record.total_payments_gs - expectedPaymentsGs,
  );
  const tendersDifferenceGs = roundMoney(
    tendersTotalForBalanceGs - expectedPaymentsGs,
  );

  return {
    expectedPaymentsGs,
    paymentsDifferenceGs,
    tendersDifferenceGs,
    isBalanced:
      Math.abs(paymentsDifferenceGs) <= FIGURES_ALERTS_TOLERANCE &&
      Math.abs(tendersDifferenceGs) <= FIGURES_ALERTS_TOLERANCE,
  };
}

export function computeWaiterSalesTableRow(
  entry: VenueWaiterDailySalesEntry,
  totalTaxPct: number,
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">> = [],
): WaiterSalesTableComputed {
  const tendersTotalGs = sumTenderAmounts(entry.tender_amounts);
  const tendersTotalForBalanceGs = sumWaiterTendersForBalance(
    entry.tender_amounts,
    tenders,
  );
  const reconciliation = computeWaiterSalesReconciliation(
    entry,
    tendersTotalForBalanceGs,
  );

  return {
    ...computeWaiterSales(entry),
    weekNumber: getIsoWeekNumber(entry.sale_date),
    weekDay: getWeekDayLabel(entry.sale_date),
    tendersTotalGs,
    tendersTotalNet: roundMoney(grossToNet(tendersTotalGs, totalTaxPct)),
    ...reconciliation,
  };
}
