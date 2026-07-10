"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  removeVenueDailyDiscountsEntry,
} from "@/lib/actions/sales";
import {
  formatMoney,
  formatMonthLabel,
  formatIsoWeekLabel,
  formatDisplayDate,
  getCurrentMonthKey,
  getIsoWeekParts,
} from "@/lib/sales/daily-sales-calculations";
import { computeDailyDiscounts } from "@/lib/sales/discounts-calculations";
import {
  columnsForSection,
  DISCOUNTS_COLUMNS,
  DISCOUNTS_SECTION_LABELS,
  sectionColSpan,
  type DiscountsColumn,
} from "@/lib/sales/discounts-columns";
import type {
  VenueDailyDiscountsRecord,
  VenueDailyDiscountsRow,
} from "@/lib/sales/discounts-types";
import {
  SALES_TABLE_ACTION_COLUMN_WIDTH,
  SALES_TABLE_CELL_BORDER,
  SALES_TABLE_DATA_COLUMN_MIN_WIDTH,
  SALES_TABLE_FIXED_STICKY_COLUMNS,
  SALES_TABLE_HEADER_COLUMN_BG,
  SALES_TABLE_STICKY_BODY_META_BG,
  SALES_TABLE_STICKY_BORDER,
  salesTableNumericCellClass,
} from "@/lib/sales/sales-data-table-ui";
import {
  SalesDataTableActionColumnHeader,
  SalesDataTableActionsCell,
} from "@/components/sales/sales-data-table-actions-cell";
import { SalesDataTableFilters } from "@/components/sales/sales-data-table-filters";
import { SalesDataTableSectionHeaderRow } from "@/components/sales/sales-data-table-section-header-row";
import { SalesDataTableTotalsRow } from "@/components/sales/sales-data-table-totals-row";
import {
  discountsColumnAggregate,
  discountsColumnFormat,
  discountsColumnValue,
} from "@/lib/sales/sales-data-table-totals";
import { cn } from "@/lib/utils";

type DiscountsDataTableProps = {
  records: VenueDailyDiscountsRecord[];
  totalTaxPct: number;
  canEdit: boolean;
};

const SECTIONS = ["fixed", "lunch", "dinner", "total"] as const;

const FIXED_STICKY = [...SALES_TABLE_FIXED_STICKY_COLUMNS];

function isComputedColumn(column: DiscountsColumn): boolean {
  return column.kind !== "input" && column.kind !== "date";
}

function stickyMeta(columnKey: string) {
  const meta = FIXED_STICKY.find((col) => col.key === columnKey);
  if (!meta) return null;
  return meta;
}

function isFixedStickyColumn(column: DiscountsColumn): boolean {
  return column.section === "fixed";
}

function renderCellValue(row: VenueDailyDiscountsRow, column: DiscountsColumn) {
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

  if (column.kind === "input" && column.field) {
    const value = row[column.field];
    return (
      <span className={salesTableNumericCellClass(false)}>
        {formatMoney(value)}
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
    return (
      <span className={salesTableNumericCellClass(false)}>
        {formatMoney(value as number | null)}
      </span>
    );
  }

  return <span className="text-xs text-black/40">—</span>;
}

function formatLocalDateFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseWeekFilterKey(key: string): { week: number; year: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), week: Number(match[2]) };
}

export function DiscountsDataTable({
  records,
  totalTaxPct,
  canEdit,
}: DiscountsDataTableProps) {
  const router = useRouter();
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [weekFilter, setWeekFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(() => getCurrentMonthKey());

  const allRows = useMemo(() => {
    return records.map((record) => ({
      ...record,
      ...computeDailyDiscounts(record, totalTaxPct),
    }));
  }, [records, totalTaxPct]);

  const weekOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of allRows) {
      const { week, year } = getIsoWeekParts(row.sale_date);
      const key = `${year}-W${String(week).padStart(2, "0")}`;
      map.set(key, formatIsoWeekLabel(year, week));
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([value, label]) => ({ value, label }));
  }, [allRows]);

  const monthOptions = useMemo(() => {
    const set = new Set(allRows.map((row) => row.sale_date.slice(0, 7)));
    set.add(getCurrentMonthKey());
    return Array.from(set)
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({ value, label: formatMonthLabel(value) }));
  }, [allRows]);

  useEffect(() => {
    if (weekFilter && !weekOptions.some((opt) => opt.value === weekFilter)) {
      setWeekFilter("");
    }
  }, [weekFilter, weekOptions]);

  useEffect(() => {
    if (monthFilter && !monthOptions.some((opt) => opt.value === monthFilter)) {
      setMonthFilter("");
    }
  }, [monthFilter, monthOptions]);

  const filteredRows = useMemo(() => {
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

      return true;
    })
      .sort((a, b) => a.sale_date.localeCompare(b.sale_date));
  }, [allRows, fromDate, toDate, weekFilter, monthFilter]);

  function applyThisWeek() {
    const today = formatLocalDateFromDate(new Date());
    const { week, year } = getIsoWeekParts(today);
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    if (!weekOptions.some((opt) => opt.value === key)) return;
    setWeekFilter(key);
    setMonthFilter("");
    setFromDate("");
    setToDate("");
  }

  function applyThisMonth() {
    setMonthFilter(getCurrentMonthKey());
    setWeekFilter("");
    setFromDate("");
    setToDate("");
  }

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setWeekFilter("");
    setMonthFilter("");
  }

  const totalColumns = DISCOUNTS_COLUMNS.length + 1;

  function handleDeleteRow(rowId: string, saleDate: string) {
    if (
      !window.confirm(
        `Delete discounts entry for ${formatDisplayDate(saleDate)}?`,
      )
    ) {
      return;
    }
    setPendingRowId(rowId);
    startTransition(async () => {
      const result = await removeVenueDailyDiscountsEntry(rowId);
      setPendingRowId(null);
      if (result.error) window.alert(result.error);
    });
  }

  return (
    <div className="w-full max-w-none space-y-4">
      <SalesDataTableFilters
        fromDate={fromDate}
        toDate={toDate}
        weekFilter={weekFilter}
        monthFilter={monthFilter}
        weekOptions={weekOptions}
        monthOptions={monthOptions}
        onFromDateChange={(value) => {
          setFromDate(value);
          setWeekFilter("");
          setMonthFilter("");
        }}
        onToDateChange={(value) => {
          setToDate(value);
          setWeekFilter("");
          setMonthFilter("");
        }}
        onWeekFilterChange={(value) => {
          setWeekFilter(value);
          setFromDate("");
          setToDate("");
          setMonthFilter("");
        }}
        onMonthFilterChange={(value) => {
          setMonthFilter(value);
          setFromDate("");
          setToDate("");
          setWeekFilter("");
        }}
        onThisWeek={applyThisWeek}
        onThisMonth={applyThisMonth}
        onClear={clearFilters}
      />

      <p className="text-sm text-black/50">
        {filteredRows.length} of {allRows.length} daily entr
        {allRows.length === 1 ? "y" : "ies"} · Tax rate{" "}
        {totalTaxPct.toFixed(2)}% applied to NET calculations
      </p>

      <div className="w-full max-w-none overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-left">
            <colgroup>
              {FIXED_STICKY.map((col) => (
                <col key={col.key} style={{ width: col.width, minWidth: col.width }} />
              ))}
              {DISCOUNTS_COLUMNS.filter((c) => c.section !== "fixed").map(
                (col) => (
                  <col key={col.key} style={{ minWidth: SALES_TABLE_DATA_COLUMN_MIN_WIDTH }} />
                ),
              )}
              <col
                style={{
                  width: SALES_TABLE_ACTION_COLUMN_WIDTH,
                  minWidth: SALES_TABLE_ACTION_COLUMN_WIDTH,
                }}
              />
            </colgroup>
            <thead>
              <SalesDataTableSectionHeaderRow
                sections={SECTIONS}
                fixedSectionKey="fixed"
                sectionLabels={DISCOUNTS_SECTION_LABELS}
                sectionColSpan={sectionColSpan}
                fixedStickyColumns={FIXED_STICKY}
              />
              <tr
                className={cn(
                  "border-b-2 border-black/15 text-xs font-bold uppercase tracking-wide text-black",
                  SALES_TABLE_HEADER_COLUMN_BG,
                )}
              >
                {SECTIONS.flatMap((section) =>
                  columnsForSection(section).map((column) => {
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
                    No records match the current filters. Use the Entry Form tab
                    to add discounts, or adjust the date range.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const rowPending = isPending && pendingRowId === row.id;
                  return (
                  <tr
                    key={row.id}
                    className="border-b border-black/5 hover:bg-[var(--venue-secondary)]/15"
                  >
                    {SECTIONS.flatMap((section) =>
                      columnsForSection(section).map((column) => {
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
                      onEdit={() =>
                        router.push(
                          `/sales/discounts/entry?date=${row.sale_date}`,
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
              rows={filteredRows}
              sections={SECTIONS}
              getColumnsForSection={columnsForSection}
              getColumnKey={(column) => column.key}
              getAggregate={discountsColumnAggregate}
              getFormat={discountsColumnFormat}
              getValue={discountsColumnValue}
              isDateColumn={(column) => column.kind === "date"}
              stickyMeta={stickyMeta}
            />
          </table>
        </div>
      </div>
    </div>
  );
}
