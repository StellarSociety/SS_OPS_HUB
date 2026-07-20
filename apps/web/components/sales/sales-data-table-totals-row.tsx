"use client";

import type { ReactNode } from "react";
import {
  SALES_TABLE_ACTION_COLUMN_WIDTH,
  SALES_TABLE_ACTION_STICKY_CLASS,
  SALES_TABLE_CELL_BORDER,
  SALES_TABLE_STICKY_BORDER,
  SALES_TABLE_TOTALS_ROW_BG,
  type SalesTableStickyColumn,
  isSalesTableCoversOrBookingsKey,
  salesTableNumericCellClass,
} from "@/lib/sales/sales-data-table-ui";
import {
  aggregateColumnValues,
  formatAggregateValue,
  type SalesColumnAggregate,
  type SalesColumnValueFormat,
} from "@/lib/sales/sales-data-table-totals";
import { cn } from "@/lib/utils";

type SalesDataTableTotalsRowProps<TRow, TColumn, TSection extends string> = {
  rows: TRow[];
  sections: readonly TSection[];
  getColumnsForSection: (section: TSection) => TColumn[];
  getColumnKey: (column: TColumn) => string;
  getAggregate: (column: TColumn) => SalesColumnAggregate;
  getFormat: (column: TColumn) => SalesColumnValueFormat;
  getValue: (row: TRow, column: TColumn) => number | null;
  isDateColumn?: (column: TColumn) => boolean;
  stickyMeta?: (columnKey: string) => SalesTableStickyColumn | null;
  includeActions?: boolean;
  totalsLabel?: string;
  additionalRows?: ReactNode;
};

export function SalesDataTableTotalsRow<TRow, TColumn, TSection extends string>({
  rows,
  sections,
  getColumnsForSection,
  getColumnKey,
  getAggregate,
  getFormat,
  getValue,
  isDateColumn,
  stickyMeta,
  includeActions = true,
  totalsLabel = "Totals",
  additionalRows,
}: SalesDataTableTotalsRowProps<TRow, TColumn, TSection>) {
  const totalsLabelColumn = sections
    .flatMap((section) => getColumnsForSection(section))
    .find(
      (column) =>
        (isDateColumn?.(column) ?? false) &&
        getAggregate(column) === "skip",
    );
  const totalsLabelColumnKey = totalsLabelColumn
    ? getColumnKey(totalsLabelColumn)
    : null;

  return (
    <tfoot>
      <tr
        className={cn(
          "border-t-2 border-black/20 text-xs font-bold uppercase tracking-wide text-[#3D421F]",
          SALES_TABLE_TOTALS_ROW_BG,
        )}
      >
        {sections.flatMap((section) =>
          getColumnsForSection(section).map((column) => {
            const columnKey = getColumnKey(column);
            const sticky = stickyMeta?.(columnKey) ?? null;
            const aggregate = getAggregate(column);
            const format = getFormat(column);
            const totalValue = aggregateColumnValues(rows, (row) =>
              getValue(row, column),
            aggregate);
            const showLabel = columnKey === totalsLabelColumnKey;

            return (
              <td
                key={`totals-${columnKey}`}
                className={cn(
                  "border-r px-2 py-2.5",
                  SALES_TABLE_CELL_BORDER,
                  sticky && "sticky z-10 align-middle",
                  sticky && SALES_TABLE_TOTALS_ROW_BG,
                  aggregate === "skip" && !showLabel && "text-black/30",
                )}
                style={
                  sticky
                    ? {
                        left: sticky.left,
                        minWidth: sticky.width,
                        width: sticky.width,
                      }
                    : undefined
                }
              >
                {showLabel ? (
                  <span className="text-left text-sm font-bold normal-case tracking-normal text-[#3D421F]">
                    {totalsLabel}
                  </span>
                ) : aggregate === "skip" ? (
                  <span className="block text-center text-black/30">—</span>
                ) : (
                  <span
                    className={salesTableNumericCellClass(
                      isSalesTableCoversOrBookingsKey(columnKey),
                    )}
                  >
                    {formatAggregateValue(totalValue, format)}
                  </span>
                )}
              </td>
            );
          }),
        )}
        {includeActions ? (
          <td
            className={cn(
              SALES_TABLE_ACTION_STICKY_CLASS,
              SALES_TABLE_TOTALS_ROW_BG,
              "border-l px-2 py-2.5",
              SALES_TABLE_STICKY_BORDER,
            )}
            style={{
              minWidth: SALES_TABLE_ACTION_COLUMN_WIDTH,
              width: SALES_TABLE_ACTION_COLUMN_WIDTH,
            }}
          />
        ) : null}
      </tr>
      {additionalRows}
    </tfoot>
  );
}
