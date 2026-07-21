"use client";

import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { removeVenueWaiterDailySalesEntry } from "@/lib/actions/sales";
import {
  formatCount,
  formatMoney,
  formatMonthLabel,
  formatIsoWeekLabel,
  formatDisplayDate,
  getCurrentMonthKey,
  getIsoWeekParts,
} from "@/lib/sales/daily-sales-calculations";
import { computeWaiterSalesTableRow } from "@/lib/sales/waiter-sales-calculations";
import {
  usePersistedSalesTableDateFilters,
  usePersistedSalesWaiterSelection,
} from "@/components/sales/use-persisted-sales-filters";
import {
  buildWaiterSalesColumns,
  columnsForSection,
  sectionColSpan,
  WAITER_SALES_SECTION_LABELS,
  WAITER_SALES_SECTIONS,
  type WaiterSalesColumn,
  type WaiterSalesSection,
} from "@/lib/sales/waiter-sales-columns";
import type { VenueTender } from "@/lib/sales/tenders-types";
import type {
  VenueWaiterDailySalesEntry,
  VenueWaiterDailySalesRow,
} from "@/lib/sales/waiter-sales-types";
import type { VenueWaiter } from "@/lib/sales/waiters-types";
import { Card } from "@/components/ui/card";
import { WaiterSelectBar } from "@/components/sales/waiter-select-bar";
import {
  SALES_TABLE_ACTION_COLUMN_WIDTH,
  SALES_TABLE_CELL_BORDER,
  SALES_TABLE_DATA_COLUMN_MIN_WIDTH,
  SALES_TABLE_FIXED_STICKY_COLUMNS,
  SALES_TABLE_HEADER_COLUMN_BG,
  SALES_TABLE_STICKY_BODY_META_BG,
  SALES_TABLE_STICKY_BORDER,
  salesTableNumericCellClass,
  isSalesTableCoversOrBookingsKey,
} from "@/lib/sales/sales-data-table-ui";
import {
  buildSalesTableMonthOptions,
  buildSalesTableWeekOptions,
  countSalesTableRowsWithData,
  createEmptyWaiterSalesEntry,
  isSalesTableEmptyRowId,
  resolveSalesTableCalendarDates,
  SALES_TABLE_EMPTY_ROW_CLASS,
} from "@/lib/sales/sales-data-table-dates";
import { isFutureSalesEntryDate } from "@/lib/sales/sales-entry-dates";
import {
  SalesDataTableActionColumnHeader,
  SalesDataTableActionsCell,
} from "@/components/sales/sales-data-table-actions-cell";
import { SalesDataTableFilters } from "@/components/sales/sales-data-table-filters";
import { SalesDataTableSectionHeaderRow } from "@/components/sales/sales-data-table-section-header-row";
import { SalesDataTableTotalsRow } from "@/components/sales/sales-data-table-totals-row";
import {
  waiterSalesColumnAggregate,
  waiterSalesColumnFormat,
  waiterSalesColumnValue,
} from "@/lib/sales/sales-data-table-totals";
import { cn } from "@/lib/utils";

type WaiterSalesDataTableProps = {
  waiters: VenueWaiter[];
  tenders: VenueTender[];
  records: VenueWaiterDailySalesEntry[];
  totalTaxPct: number;
  groupsAddedServiceChargePct: number;
  canEdit: boolean;
};

const FIXED_STICKY = [...SALES_TABLE_FIXED_STICKY_COLUMNS];

function isComputedColumn(column: WaiterSalesColumn): boolean {
  return (
    column.kind !== "input" &&
    column.kind !== "date" &&
    column.kind !== "text"
  );
}

function stickyMeta(columnKey: string) {
  return FIXED_STICKY.find((col) => col.key === columnKey) ?? null;
}

function isFixedStickyColumn(column: WaiterSalesColumn): boolean {
  return column.section === "fixed";
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

function renderCellValue(row: VenueWaiterDailySalesRow, column: WaiterSalesColumn) {
  if (column.kind === "date") {
    return (
      <span
        className={cn(
          "tabular-nums text-[#3D421F]",
          isFixedStickyColumn(column)
            ? "text-sm font-bold"
            : "block truncate text-xs font-medium",
        )}
      >
        {formatDisplayDate(row.sale_date)}
      </span>
    );
  }

  if (column.tenderId) {
    const value = row.tender_amounts[column.tenderId] ?? 0;
    return (
      <span className={salesTableNumericCellClass(false)}>
        {formatMoney(value)}
      </span>
    );
  }

  if (column.kind === "input" && column.field) {
    const value = row[column.field];
    return (
      <span className={salesTableNumericCellClass(false)}>
        {formatMoney(value as number)}
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

    if (column.kind === "meta") {
      return (
        <span
          className={cn(
            "tabular-nums text-[#3D421F]",
            isFixedStickyColumn(column)
              ? "text-sm font-bold"
              : "block truncate text-xs font-medium text-black/80",
          )}
        >
          {String(value ?? "—")}
        </span>
      );
    }

    if (column.kind === "count") {
      return (
        <span className={salesTableNumericCellClass(isSalesTableCoversOrBookingsKey(column.key))}>
          {formatCount(value as number)}
        </span>
      );
    }

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

export function WaiterSalesDataTable({
  waiters,
  tenders,
  records,
  totalTaxPct,
  groupsAddedServiceChargePct,
  canEdit,
}: WaiterSalesDataTableProps) {
  const router = useRouter();
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const columns = useMemo(
    () => buildWaiterSalesColumns(tenders, groupsAddedServiceChargePct),
    [tenders, groupsAddedServiceChargePct],
  );
  const { selectedWaiterId, setSelectedWaiterId } =
    usePersistedSalesWaiterSelection();
  const {
    fromDate,
    toDate,
    weekFilter,
    monthFilter,
    yearFilter,
    setFromDate,
    setToDate,
    setWeekFilter,
    setMonthFilter,
    applyThisWeek,
    applyThisMonth,
    applyThisYear,
    clearFilters,
  } = usePersistedSalesTableDateFilters();

  useEffect(() => {
    if (
      selectedWaiterId &&
      !waiters.some((waiter) => waiter.id === selectedWaiterId)
    ) {
      setSelectedWaiterId("");
    }
  }, [selectedWaiterId, setSelectedWaiterId, waiters]);

  const waiterRecords = useMemo(
    () => records.filter((record) => record.waiter_id === selectedWaiterId),
    [records, selectedWaiterId],
  );

  const allRows = useMemo(
    () =>
      waiterRecords.map((record) => ({
        ...record,
        ...computeWaiterSalesTableRow(record, totalTaxPct, tenders),
      })),
    [waiterRecords, totalTaxPct, tenders],
  );

  const weekOptions = useMemo(
    () =>
      buildSalesTableWeekOptions(
        allRows.map((row) => row.sale_date),
        formatIsoWeekLabel,
        getIsoWeekParts,
      ),
    [allRows],
  );

  const monthOptions = useMemo(
    () =>
      buildSalesTableMonthOptions(
        allRows.map((row) => row.sale_date),
        formatMonthLabel,
        getCurrentMonthKey,
      ),
    [allRows],
  );

  useEffect(() => {
    if (weekFilter && !weekOptions.some((opt) => opt.value === weekFilter)) {
      // Keep the filter valid when switching between waiter datasets.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWeekFilter("");
    }
  }, [weekFilter, weekOptions]);

  useEffect(() => {
    if (monthFilter && !monthOptions.some((opt) => opt.value === monthFilter)) {
      // Keep the filter valid when switching between waiter datasets.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMonthFilter("");
    }
  }, [monthFilter, monthOptions]);

  const filteredRows = useMemo(() => {
    const recordsByDate = new Map(allRows.map((row) => [row.sale_date, row]));
    const calendarDates = resolveSalesTableCalendarDates({
      fromDate,
      toDate,
      weekFilter,
      monthFilter,
      yearFilter,
    });
    const venueId = records[0]?.venue_id ?? "";

    if (calendarDates) {
      return calendarDates.map((saleDate) => {
        const existing = recordsByDate.get(saleDate);
        if (existing) return existing;

        const emptyRecord = createEmptyWaiterSalesEntry(
          saleDate,
          venueId,
          selectedWaiterId,
        );
        return {
          ...emptyRecord,
          ...computeWaiterSalesTableRow(emptyRecord, totalTaxPct, tenders),
        };
      });
    }

    return allRows
      .filter((row) => {
        if (fromDate && row.sale_date < fromDate) return false;
        if (toDate && row.sale_date > toDate) return false;

        if (weekFilter) {
          const { week, year } = getIsoWeekParts(row.sale_date);
          const key = `${year}-W${String(week).padStart(2, "0")}`;
          if (key !== weekFilter) return false;
        }

        if (monthFilter && row.sale_date.slice(0, 7) !== monthFilter) {
          return false;
        }

        if (yearFilter && row.sale_date.slice(0, 4) !== yearFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => a.sale_date.localeCompare(b.sale_date));
  }, [
    allRows,
    records,
    fromDate,
    toDate,
    weekFilter,
    monthFilter,
    yearFilter,
    selectedWaiterId,
    totalTaxPct,
    tenders,
  ]);

  const rowsWithData = useMemo(
    () => countSalesTableRowsWithData(filteredRows),
    [filteredRows],
  );

  const selectedWaiter = waiters.find((w) => w.id === selectedWaiterId);
  const totalColumns = columns.length + 1;

  function handleDeleteRow(rowId: string, saleDate: string) {
    if (
      !window.confirm(
        `Delete waiter sales entry for ${formatDisplayDate(saleDate)}?`,
      )
    ) {
      return;
    }
    setPendingRowId(rowId);
    startTransition(async () => {
      const result = await removeVenueWaiterDailySalesEntry(rowId);
      setPendingRowId(null);
      if (result.error) window.alert(result.error);
    });
  }

  if (waiters.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">No active waiters</h2>
        <p className="mt-2 text-sm text-black/60">
          Add active waiters in{" "}
          <Link
            href="/sales/settings/waiters"
            className="font-medium text-[var(--venue-primary)] underline-offset-2 hover:underline"
          >
            Settings → Waiters
          </Link>{" "}
          before viewing waiter sales data.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <WaiterSelectBar
        waiters={waiters}
        selectedWaiterId={selectedWaiterId}
        onSelect={setSelectedWaiterId}
      />

      {!selectedWaiterId ? (
        <p className="text-center text-sm text-black/50">
          Select a waiter to view sales data.
        </p>
      ) : (
      <div className="w-full max-w-none space-y-4">
        <SalesDataTableFilters
          fromDate={fromDate}
          toDate={toDate}
          weekFilter={weekFilter}
          monthFilter={monthFilter}
          weekOptions={weekOptions}
          monthOptions={monthOptions}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onWeekFilterChange={setWeekFilter}
          onMonthFilterChange={setMonthFilter}
          onThisWeek={applyThisWeek}
          onThisMonth={applyThisMonth}
          onThisYear={applyThisYear}
          onClear={clearFilters}
        />

        <p className="text-sm text-black/50">
          {filteredRows.length} day{filteredRows.length === 1 ? "" : "s"} shown
          {rowsWithData !== filteredRows.length
            ? ` · ${rowsWithData} with data`
            : ""}{" "}
          for{" "}
          <span className="font-medium text-[#3D421F]">
            {selectedWaiter?.name ?? "selected waiter"}
          </span>
          {" · "}Tax rate {totalTaxPct.toFixed(2)}% applied to NET calculations
          {!canEdit ? " · View only" : ""}
        </p>

        <div className="w-full max-w-none overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left">
              <colgroup>
                {FIXED_STICKY.map((col) => (
                  <col
                    key={col.key}
                    style={{ width: col.width, minWidth: col.width }}
                  />
                ))}
                {columns
                  .filter((column) => column.section !== "fixed")
                  .map((column) => (
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
                <col
                  style={{
                    width: SALES_TABLE_ACTION_COLUMN_WIDTH,
                    minWidth: SALES_TABLE_ACTION_COLUMN_WIDTH,
                  }}
                />
              </colgroup>
              <thead>
                <SalesDataTableSectionHeaderRow
                  sections={WAITER_SALES_SECTIONS}
                  fixedSectionKey="fixed"
                  sectionLabels={WAITER_SALES_SECTION_LABELS}
                  sectionColSpan={(section) =>
                    sectionColSpan(columns, section)
                  }
                  fixedStickyColumns={FIXED_STICKY}
                />
                <tr
                  className={cn(
                    "border-b-2 border-black/15 text-xs font-bold uppercase tracking-wide text-black",
                    SALES_TABLE_HEADER_COLUMN_BG,
                  )}
                >
                  {WAITER_SALES_SECTIONS.flatMap((section) =>
                    columnsForSection(columns, section).map((column) => {
                      const sticky = stickyMeta(column.key);
                      const computedHeader = isComputedColumn(column);
                      return (
                        <th
                          key={column.key}
                          className={cn(
                            "whitespace-nowrap border-r px-2 py-2 text-center",
                            SALES_TABLE_STICKY_BORDER,
                            sticky &&
                              cn("sticky z-20", SALES_TABLE_HEADER_COLUMN_BG),
                            !sticky && SALES_TABLE_HEADER_COLUMN_BG,
                            computedHeader &&
                              section !== "fixed" &&
                              "bg-[#E0E5CC]",
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
                  <SalesDataTableActionColumnHeader />
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={totalColumns}
                      className="px-4 py-10 text-center text-sm text-black/50"
                    >
                      No records match the current filters for{" "}
                      {selectedWaiter?.name ?? "this waiter"}. Use the Entry Form
                      tab to add sales, or adjust the date range.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const rowPending = isPending && pendingRowId === row.id;
                    const isEmptyRow = isSalesTableEmptyRowId(row.id);
                    const isFutureEmptyRow =
                      isEmptyRow && isFutureSalesEntryDate(row.sale_date);
                    return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-black/5 hover:bg-[var(--venue-secondary)]/15",
                        isEmptyRow && SALES_TABLE_EMPTY_ROW_CLASS,
                      )}
                    >
                      {WAITER_SALES_SECTIONS.flatMap((section: WaiterSalesSection) =>
                        columnsForSection(columns, section).map((column) => {
                          const sticky = stickyMeta(column.key);
                          const computed = isComputedColumn(column);
                          return (
                            <td
                              key={`${row.id}-${column.key}`}
                              className={cn(
                                "border-r px-2 py-1.5",
                                SALES_TABLE_CELL_BORDER,
                                sticky && "sticky z-10 text-center align-middle",
                                sticky && !computed && "bg-white",
                                sticky &&
                                  computed &&
                                  SALES_TABLE_STICKY_BODY_META_BG,
                                !sticky && computed && "bg-black/[0.07]",
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
                              {renderCellValue(row, column)}
                            </td>
                          );
                        }),
                      )}
                      <SalesDataTableActionsCell
                        canEdit={canEdit}
                        isEditing={false}
                        isPending={rowPending}
                        disableDelete={isEmptyRow}
                        disableAdd={isFutureEmptyRow}
                        onEdit={() =>
                          router.push(
                            `/sales/waiter/entry?date=${row.sale_date}&waiter=${row.waiter_id}`,
                          )
                        }
                        onSave={() => {}}
                        onDelete={() =>
                          handleDeleteRow(row.id, row.sale_date)
                        }
                      />
                    </tr>
                  );
                  })
                )}
              </tbody>
              <SalesDataTableTotalsRow
                rows={filteredRows.filter((row) => !isSalesTableEmptyRowId(row.id))}
                sections={WAITER_SALES_SECTIONS}
                getColumnsForSection={(section) =>
                  columnsForSection(columns, section)
                }
                getColumnKey={(column) => column.key}
                getAggregate={waiterSalesColumnAggregate}
                getFormat={waiterSalesColumnFormat}
                getValue={waiterSalesColumnValue}
                isDateColumn={(column) => column.kind === "date"}
                stickyMeta={stickyMeta}
              />
            </table>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
