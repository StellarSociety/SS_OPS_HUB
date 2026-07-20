import {
  computeDailySales,
  grossToNet,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import type { VenueDailyTenderTotal } from "@/lib/sales/daily-tender-totals-store";
import type { WaiterSalesColumn } from "@/lib/sales/waiter-sales-columns";
import type { ComputedDailySales } from "@/lib/sales/daily-sales-types";

export function mapDailySalesToWaiterColumn(options: {
  column: WaiterSalesColumn;
  dailyComputed: ComputedDailySales | null;
  dailyTenderAmounts: Map<string, number>;
  dailyTenderTotal: number;
  totalTaxPct: number;
  hasDailyInput: boolean;
}): number | null {
  const {
    column,
    dailyComputed,
    dailyTenderAmounts,
    dailyTenderTotal,
    totalTaxPct,
    hasDailyInput,
  } = options;

  if (!hasDailyInput) return null;

  if (column.tenderId) {
    return dailyTenderAmounts.get(column.tenderId) ?? 0;
  }

  switch (column.key) {
    case "total_sales_gs":
      return dailyComputed?.totalVenueGs ?? null;
    case "total_payments_gs":
    case "tendersTotalGs":
      return dailyTenderTotal;
    case "total_covers":
      return dailyComputed?.totalCovers ?? null;
    case "asph":
      return dailyComputed?.totalVenueAllDayAsph ?? null;
    case "tendersTotalNet":
      return grossToNet(dailyTenderTotal, totalTaxPct);
    default:
      return null;
  }
}

export function buildDailyComparisonContext(
  saleDate: string,
  dailyRecords: VenueDailySalesRecord[],
  dailyTenderTotals: VenueDailyTenderTotal[],
  totalTaxPct: number,
) {
  const dailyRecord =
    dailyRecords.find((record) => record.sale_date === saleDate) ?? null;
  const dailyComputed = dailyRecord
    ? computeDailySales(dailyRecord, totalTaxPct)
    : null;
  const tenderRows = dailyTenderTotals.filter(
    (row) => row.sale_date === saleDate,
  );
  const dailyTenderAmounts = new Map(
    tenderRows.map((row) => [row.tender_id, row.amount_gs]),
  );
  const dailyTenderTotal = tenderRows.reduce(
    (total, row) => total + row.amount_gs,
    0,
  );
  const hasDailyInput = Boolean(dailyRecord) || tenderRows.length > 0;

  return {
    dailyRecord,
    dailyComputed,
    dailyTenderAmounts,
    dailyTenderTotal,
    hasDailyInput,
  };
}
