import {
  formatCount,
  formatMoney,
} from "@/lib/sales/daily-sales-calculations";
import type { DailySalesColumn } from "@/lib/sales/daily-sales-columns";
import type { DiscountsColumn } from "@/lib/sales/discounts-columns";
import type { VenueDailySalesRow } from "@/lib/sales/daily-sales-types";
import type { VenueDailyDiscountsRow } from "@/lib/sales/discounts-types";
import type { WaiterSalesColumn } from "@/lib/sales/waiter-sales-columns";
import type { VenueWaiterDailySalesRow } from "@/lib/sales/waiter-sales-types";

export type SalesColumnAggregate = "skip" | "sum" | "average";
export type SalesColumnValueFormat = "money" | "count";

export function aggregateColumnValues<TRow>(
  rows: TRow[],
  getValue: (row: TRow) => number | null,
  aggregate: SalesColumnAggregate,
): number | null {
  if (aggregate === "skip" || rows.length === 0) return null;

  const values = rows
    .map(getValue)
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (values.length === 0) return null;
  if (aggregate === "sum") {
    return values.reduce((sum, value) => sum + value, 0);
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatAggregateValue(
  value: number | null,
  format: SalesColumnValueFormat,
): string {
  if (value == null) return "—";
  if (format === "count") return formatCount(value);
  return formatMoney(value);
}

function readNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dailySalesColumnAggregate(
  column: DailySalesColumn,
): SalesColumnAggregate {
  if (column.kind === "date" || column.kind === "meta") return "skip";
  if (column.kind === "ratio") return "average";
  return "sum";
}

export function dailySalesColumnFormat(
  column: DailySalesColumn,
): SalesColumnValueFormat {
  if (column.kind === "count") return "count";
  if (
    column.kind === "input" &&
    column.field &&
    (column.field.endsWith("_covers") || column.field.endsWith("_bookings"))
  ) {
    return "count";
  }
  return "money";
}

export function dailySalesColumnValue(
  row: VenueDailySalesRow,
  column: DailySalesColumn,
): number | null {
  if (column.kind === "input" && column.field) {
    return readNumber(row[column.field]);
  }
  if (column.computedKey) {
    return readNumber(row[column.computedKey]);
  }
  return null;
}

export function discountsColumnAggregate(
  column: DiscountsColumn,
): SalesColumnAggregate {
  if (column.kind === "date" || column.kind === "meta") return "skip";
  return "sum";
}

export function discountsColumnFormat(
  column: DiscountsColumn,
): SalesColumnValueFormat {
  return "money";
}

export function discountsColumnValue(
  row: VenueDailyDiscountsRow,
  column: DiscountsColumn,
): number | null {
  if (column.kind === "input" && column.field) {
    return readNumber(row[column.field]);
  }
  if (column.computedKey) {
    return readNumber(row[column.computedKey]);
  }
  return null;
}

export function waiterSalesColumnAggregate(
  column: WaiterSalesColumn,
): SalesColumnAggregate {
  if (
    column.kind === "date" ||
    column.kind === "meta" ||
    column.kind === "text" ||
    column.kind === "status"
  ) {
    return "skip";
  }
  if (column.key === "asph") return "average";
  return "sum";
}

export function waiterSalesColumnFormat(
  column: WaiterSalesColumn,
): SalesColumnValueFormat {
  if (column.kind === "count") return "count";
  return "money";
}

export function waiterSalesColumnValue(
  row: VenueWaiterDailySalesRow,
  column: WaiterSalesColumn,
): number | null {
  if (column.tenderId) {
    return readNumber(row.tender_amounts[column.tenderId] ?? 0);
  }
  if (column.kind === "input" && column.field) {
    return readNumber(row[column.field as keyof VenueWaiterDailySalesRow]);
  }
  if (column.computedKey) {
    return readNumber(row[column.computedKey]);
  }
  return null;
}
