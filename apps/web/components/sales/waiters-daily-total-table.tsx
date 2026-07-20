"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { SalesDateInput } from "@/components/sales/sales-date-input";
import { SalesDataTableSectionHeaderRow } from "@/components/sales/sales-data-table-section-header-row";
import { SalesDataTableTotalsRow } from "@/components/sales/sales-data-table-totals-row";
import { usePersistedSalesEntryDate } from "@/components/sales/use-persisted-sales-filters";
import { Card } from "@/components/ui/card";
import {
  formatCount,
  formatDisplayDate,
  formatMoney,
  getIsoWeekNumber,
  getWeekDayLabel,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import type { VenueDailyTenderTotal } from "@/lib/sales/daily-tender-totals-store";
import {
  getLocalTodayIsoDate,
  isFutureSalesEntryDate,
} from "@/lib/sales/sales-entry-dates";
import {
  SALES_TABLE_CELL_BORDER,
  SALES_TABLE_DATA_COLUMN_MIN_WIDTH,
  SALES_TABLE_HEADER_COLUMN_BG,
  SALES_TABLE_STICKY_BODY_META_BG,
  SALES_TABLE_STICKY_BORDER,
  isSalesTableCoversOrBookingsKey,
  salesTableNumericCellClass,
} from "@/lib/sales/sales-data-table-ui";
import {
  aggregateColumnValues,
  formatAggregateValue,
  waiterSalesColumnAggregate,
  waiterSalesColumnFormat,
  waiterSalesColumnValue,
} from "@/lib/sales/sales-data-table-totals";
import {
  buildWaiterSalesColumns,
  columnsForSection,
  sectionColSpan,
  WAITER_SALES_SECTION_LABELS,
  type WaiterSalesColumn,
  type WaiterSalesSection,
} from "@/lib/sales/waiter-sales-columns";
import { computeWaiterSalesTableRow } from "@/lib/sales/waiter-sales-calculations";
import type { VenueTender } from "@/lib/sales/tenders-types";
import type {
  VenueWaiterDailySalesEntry,
  VenueWaiterDailySalesRow,
} from "@/lib/sales/waiter-sales-types";
import type { VenueWaiter } from "@/lib/sales/waiters-types";
import {
  buildDailyComparisonContext,
  mapDailySalesToWaiterColumn,
} from "@/lib/sales/waiters-daily-total-comparison";
import { FIGURES_ALERTS_TOLERANCE } from "@/lib/sales/figures-alerts-calculations";
import { cn } from "@/lib/utils";

const WAITER_STICKY = [
  { key: "waiter", width: "11rem", left: "0px" },
] as const;

const TABLE_SECTIONS: WaiterSalesSection[] = [
  "fixed",
  "summary",
  "gratuity",
  "tenders",
  "totals",
  "balance",
];

type WaitersDailyTotalTableProps = {
  waiters: VenueWaiter[];
  tenders: VenueTender[];
  waiterRecords: VenueWaiterDailySalesEntry[];
  dailyRecords: VenueDailySalesRecord[];
  dailyTenderTotals: VenueDailyTenderTotal[];
  totalTaxPct: number;
  groupsAddedServiceChargePct: number;
};

function shiftDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return getLocalTodayIsoDate(date);
}

function defaultYesterdayIsoDate(): string {
  return shiftDate(getLocalTodayIsoDate(), -1);
}

function formatDifference(value: number): string {
  if (value === 0) return formatMoney(0);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

function truncateText(value: string, max = 48): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function isComputedColumn(column: WaiterSalesColumn): boolean {
  return (
    column.kind !== "input" &&
    column.kind !== "date" &&
    column.kind !== "text"
  );
}

function renderCellValue(
  row: VenueWaiterDailySalesRow,
  column: WaiterSalesColumn,
) {
  if (column.tenderId) {
    const value = row.tender_amounts[column.tenderId] ?? 0;
    return (
      <span className={salesTableNumericCellClass(false)}>
        {formatMoney(value)}
      </span>
    );
  }

  if (column.kind === "input" && column.field) {
    return (
      <span className={salesTableNumericCellClass(false)}>
        {formatMoney(row[column.field] as number)}
      </span>
    );
  }

  if (column.kind === "count" && column.field) {
    return (
      <span className={salesTableNumericCellClass(true)}>
        {formatCount(row[column.field] as number)}
      </span>
    );
  }

  if (column.kind === "text" && column.field) {
    const value = String(row[column.field] ?? "");
    return (
      <span
        className="block max-w-[12rem] truncate text-xs text-black/70"
        title={value.trim() || undefined}
      >
        {truncateText(value)}
      </span>
    );
  }

  if (column.computedKey) {
    const value = row[column.computedKey];

    if (column.kind === "difference") {
      const diff = value as number;
      const balanced = diff === 0;
      return (
        <span
          className={cn(
            salesTableNumericCellClass(false),
            "font-semibold",
            balanced ? "text-emerald-700" : "text-amber-700",
          )}
        >
          {balanced ? "Balanced" : formatDifference(diff)}
        </span>
      );
    }

    if (column.kind === "status") {
      const balanced = Boolean(value);
      return (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            balanced
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800",
          )}
        >
          {balanced ? "Balanced" : "Diff"}
        </span>
      );
    }

    return (
      <span className={salesTableNumericCellClass(false)}>
        {formatMoney(value as number | null)}
      </span>
    );
  }

  return <span className="text-xs text-black/40">—</span>;
}

const metaBadgeClass =
  "inline-flex h-10 shrink-0 items-center rounded-full border border-black/10 bg-[var(--venue-secondary)]/30 px-3 text-sm text-black/60";

const navButtonClass =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30 disabled:opacity-50";

export function WaitersDailyTotalTable({
  waiters,
  tenders,
  waiterRecords,
  dailyRecords,
  dailyTenderTotals,
  totalTaxPct,
  groupsAddedServiceChargePct,
}: WaitersDailyTotalTableProps) {
  const { selectedDate, setSelectedDate } = usePersistedSalesEntryDate(
    defaultYesterdayIsoDate(),
  );

  const columns = useMemo(() => {
    const all = buildWaiterSalesColumns(tenders, groupsAddedServiceChargePct);
    return [
      {
        key: "waiter",
        label: "Waiter",
        kind: "text" as const,
        section: "fixed" as const,
      },
      ...all.filter(
        (column) =>
          column.section !== "fixed" && column.section !== "comments",
      ),
    ];
  }, [tenders, groupsAddedServiceChargePct]);

  const dataColumns = useMemo(
    () => columns.filter((column) => column.key !== "waiter"),
    [columns],
  );

  const datesWithEntries = useMemo(() => {
    const dates = new Set<string>();
    for (const record of waiterRecords) dates.add(record.sale_date);
    for (const record of dailyRecords) dates.add(record.sale_date);
    for (const row of dailyTenderTotals) dates.add(row.sale_date);
    return dates;
  }, [waiterRecords, dailyRecords, dailyTenderTotals]);

  const dayRows = useMemo(() => {
    const waiterOrder = new Map(
      waiters.map((waiter, index) => [waiter.id, index]),
    );
    const recordsForDay = waiterRecords.filter(
      (record) => record.sale_date === selectedDate,
    );

    return recordsForDay
      .map((record) => ({
        ...record,
        ...computeWaiterSalesTableRow(record, totalTaxPct),
      }))
      .sort((a, b) => {
        const orderA = waiterOrder.get(a.waiter_id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = waiterOrder.get(b.waiter_id) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.waiter_id.localeCompare(b.waiter_id);
      });
  }, [waiterRecords, selectedDate, totalTaxPct, waiters]);

  const waiterById = useMemo(
    () => new Map(waiters.map((waiter) => [waiter.id, waiter])),
    [waiters],
  );

  const comparison = useMemo(
    () =>
      buildDailyComparisonContext(
        selectedDate,
        dailyRecords,
        dailyTenderTotals,
        totalTaxPct,
      ),
    [selectedDate, dailyRecords, dailyTenderTotals, totalTaxPct],
  );

  function dailySalesValue(column: WaiterSalesColumn): number | null {
    return mapDailySalesToWaiterColumn({
      column,
      dailyComputed: comparison.dailyComputed,
      dailyTenderAmounts: comparison.dailyTenderAmounts,
      dailyTenderTotal: comparison.dailyTenderTotal,
      totalTaxPct,
      hasDailyInput: comparison.hasDailyInput,
    });
  }

  function waiterTotalValue(column: WaiterSalesColumn): number | null {
    return aggregateColumnValues(
      dayRows,
      (row) => waiterSalesColumnValue(row, column),
      waiterSalesColumnAggregate(column),
    );
  }

  function comparisonDifference(column: WaiterSalesColumn): number | null {
    const waiterValue = waiterTotalValue(column);
    const dailyValue = dailySalesValue(column);
    if (waiterValue == null || dailyValue == null) return null;
    return Math.round((waiterValue - dailyValue) * 100) / 100;
  }

  const comparisonValues = dataColumns
    .map(comparisonDifference)
    .filter((value): value is number => value != null);
  const comparisonMatched =
    comparisonValues.length > 0 &&
    comparisonValues.every(
      (value) => Math.abs(value) <= FIGURES_ALERTS_TOLERANCE,
    );

  const todayIso = getLocalTodayIsoDate();
  const isAtToday = selectedDate >= todayIso;

  function comparisonRow(kind: "daily" | "difference") {
    const isDifference = kind === "difference";
    const label = isDifference ? "Difference" : "Daily Sales";
    const rowBg = isDifference
      ? comparisonMatched
        ? "bg-emerald-50"
        : "bg-amber-50"
      : "bg-[var(--venue-secondary,#F0F3DD)]/55";
    const stickyBg = isDifference
      ? comparisonMatched
        ? "bg-emerald-50"
        : "bg-amber-50"
      : "bg-[#EAEDDA]";

    return (
      <tr className={cn("border-t text-xs font-bold text-[#3D421F]", rowBg)}>
        {TABLE_SECTIONS.flatMap((section) =>
          columnsForSection(columns, section).map((column) => {
            const sticky = column.key === "waiter" ? WAITER_STICKY[0] : null;
            const value = isDifference
              ? comparisonDifference(column)
              : dailySalesValue(column);
            const isLabel = column.key === "waiter";

            return (
              <td
                key={`${kind}-${column.key}`}
                className={cn(
                  "border-r px-2 py-2.5",
                  SALES_TABLE_CELL_BORDER,
                  sticky && "sticky z-10 align-middle",
                  sticky && stickyBg,
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
                {isLabel ? (
                  <span className="normal-case tracking-normal">{label}</span>
                ) : column.kind === "status" ||
                  column.kind === "text" ||
                  value == null ? (
                  <span className="block text-center text-black/30">—</span>
                ) : (
                  <span
                    className={cn(
                      salesTableNumericCellClass(
                        isSalesTableCoversOrBookingsKey(column.key) ||
                          column.key === "total_covers",
                      ),
                      isDifference &&
                        (Math.abs(value) <= FIGURES_ALERTS_TOLERANCE
                          ? "text-emerald-700"
                          : "text-amber-700"),
                    )}
                  >
                    {formatAggregateValue(
                      value,
                      waiterSalesColumnFormat(column),
                    )}
                  </span>
                )}
              </td>
            );
          }),
        )}
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span className={metaBadgeClass}>
            Week {getIsoWeekNumber(selectedDate)}
          </span>
          <span className={metaBadgeClass}>
            {getWeekDayLabel(selectedDate)}
          </span>
          <button
            type="button"
            onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            title="Previous day"
            className={navButtonClass}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <SalesDateInput
            value={selectedDate}
            onChange={setSelectedDate}
            maxDate={todayIso}
            datesWithEntries={datesWithEntries}
            className="h-10 w-[10.5rem] min-w-0 shrink-0"
          />
          <button
            type="button"
            disabled={isAtToday}
            onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            title="Next day"
            className={navButtonClass}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(todayIso)}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30"
          >
            Today
          </button>
        </div>
      </Card>

      <p className="text-sm text-black/50">
        {dayRows.length} waiter{dayRows.length === 1 ? "" : "s"} for{" "}
        <span className="font-medium text-[#3D421F]">
          {formatDisplayDate(selectedDate)}
        </span>
        {comparison.hasDailyInput
          ? " · Daily sales figures loaded for comparison"
          : " · No daily sales / tender totals entered for this day"}
        {" · "}Tax rate {totalTaxPct.toFixed(2)}% applied to NET calculations
        {isFutureSalesEntryDate(selectedDate) ? " · Future date" : ""}
      </p>

      <div className="w-full max-w-none overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-left">
            <colgroup>
              <col
                style={{
                  width: WAITER_STICKY[0].width,
                  minWidth: WAITER_STICKY[0].width,
                }}
              />
              {dataColumns.map((column) => (
                <col
                  key={column.key}
                  style={{
                    minWidth:
                      column.kind === "text"
                        ? "8rem"
                        : SALES_TABLE_DATA_COLUMN_MIN_WIDTH,
                  }}
                />
              ))}
            </colgroup>
            <thead>
              <SalesDataTableSectionHeaderRow
                sections={TABLE_SECTIONS}
                fixedSectionKey="fixed"
                sectionLabels={{
                  ...WAITER_SALES_SECTION_LABELS,
                  fixed: "",
                }}
                sectionColSpan={(section) => sectionColSpan(columns, section)}
                fixedStickyColumns={WAITER_STICKY}
                includeActions={false}
              />
              <tr
                className={cn(
                  "border-b-2 border-black/15 text-xs font-bold uppercase tracking-wide text-black",
                  SALES_TABLE_HEADER_COLUMN_BG,
                )}
              >
                {TABLE_SECTIONS.flatMap((section) =>
                  columnsForSection(columns, section).map((column) => {
                    const sticky =
                      column.key === "waiter" ? WAITER_STICKY[0] : null;
                    const computedHeader = isComputedColumn(column);
                    return (
                      <th
                        key={column.key}
                        className={cn(
                          "whitespace-nowrap border-r px-2 py-2 text-center",
                          SALES_TABLE_CELL_BORDER,
                          sticky && "sticky z-30",
                          sticky && SALES_TABLE_HEADER_COLUMN_BG,
                          sticky && SALES_TABLE_STICKY_BORDER,
                          computedHeader && "italic text-black/70",
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
                        {column.label}
                      </th>
                    );
                  }),
                )}
              </tr>
            </thead>
            <tbody>
              {dayRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-10 text-center text-sm text-black/50"
                  >
                    No waiter entries for {formatDisplayDate(selectedDate)}.
                  </td>
                </tr>
              ) : (
                dayRows.map((row) => {
                  const waiter = waiterById.get(row.waiter_id);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-black/5 hover:bg-[var(--venue-secondary)]/20"
                    >
                      {TABLE_SECTIONS.flatMap((section) =>
                        columnsForSection(columns, section).map((column) => {
                          const sticky =
                            column.key === "waiter" ? WAITER_STICKY[0] : null;
                          return (
                            <td
                              key={`${row.id}-${column.key}`}
                              className={cn(
                                "border-r px-2 py-2 align-middle",
                                SALES_TABLE_CELL_BORDER,
                                sticky && "sticky z-10",
                                sticky && SALES_TABLE_STICKY_BODY_META_BG,
                                sticky && SALES_TABLE_STICKY_BORDER,
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
                              {column.key === "waiter" ? (
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#3D421F]">
                                    {waiter?.name ?? "Unknown waiter"}
                                  </p>
                                  {waiter?.position ? (
                                    <p className="truncate text-[11px] text-black/50">
                                      {waiter.position}
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                renderCellValue(row, column)
                              )}
                            </td>
                          );
                        }),
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            <SalesDataTableTotalsRow
              rows={dayRows}
              sections={TABLE_SECTIONS}
              getColumnsForSection={(section) =>
                columnsForSection(columns, section)
              }
              getColumnKey={(column) => column.key}
              getAggregate={(column) =>
                column.key === "waiter"
                  ? "skip"
                  : waiterSalesColumnAggregate(column)
              }
              getFormat={waiterSalesColumnFormat}
              getValue={(row, column) =>
                column.key === "waiter"
                  ? null
                  : waiterSalesColumnValue(row, column)
              }
              isDateColumn={(column) => column.key === "waiter"}
              stickyMeta={(columnKey) =>
                columnKey === "waiter" ? WAITER_STICKY[0] : null
              }
              includeActions={false}
              totalsLabel="Waiters Total"
              additionalRows={
                <>
                  {comparisonRow("daily")}
                  {comparisonRow("difference")}
                </>
              }
            />
          </table>
        </div>
      </div>
    </div>
  );
}
