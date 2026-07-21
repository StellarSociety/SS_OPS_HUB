import {
  getIsoWeekNumber,
  getWeekDayLabel,
  grossToNet,
} from "./daily-sales-calculations";
import { FIGURES_ALERTS_TOLERANCE } from "./figures-alerts-calculations";
import {
  sumSalesMatchingTenderAmounts,
  sumTenderAmounts,
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

export function computeWaiterSales(
  record: Pick<VenueWaiterDailySalesRecord, "total_sales_gs" | "total_covers">,
): ComputedWaiterSales {
  const { total_sales_gs, total_covers } = record;
  return {
    asph:
      total_covers > 0 && total_sales_gs > 0
        ? Math.round((total_sales_gs / total_covers) * 100) / 100
        : total_covers > 0
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
   * (excludes Voucher Issue); Payment Total is still compared as entered.
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
  const tendersTotalForBalanceGs = sumSalesMatchingTenderAmounts(
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
