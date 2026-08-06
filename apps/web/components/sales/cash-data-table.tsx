"use client";

import { useEffect, useMemo, useState } from "react";
import { usePersistedSalesMonthFilter } from "@/components/sales/use-persisted-sales-filters";
import { CashExpenseJustificationDialog } from "@/components/sales/cash-expense-justification-dialog";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { formatDisplayDate } from "@/lib/dates/display";
import {
  computeCashJournalBalance,
  isCashJournalBalanced,
} from "@/lib/sales/cash-journal-calculations";
import type { CashJournalRecord } from "@/lib/sales/cash-journal-report";
import {
  groupCashExpenseLinesByDate,
  type CashExpenseJustificationLine,
} from "@/lib/sales/cash-expenses-calculations";
import type { VenueCashExpenseLineRecord } from "@/lib/sales/cash-expenses-types";
import {
  formatMoney,
  formatMonthLabel,
  getCurrentMonthKey,
  getWeekDayLabel,
} from "@/lib/sales/daily-sales-calculations";
import {
  buildSalesTableMonthOptions,
  getDatesInMonth,
} from "@/lib/sales/sales-data-table-dates";
import { getLocalTodayIsoDate } from "@/lib/sales/sales-entry-dates";
import {
  SALES_TABLE_CELL_BORDER,
  SALES_TABLE_HEADER_COLUMN_BG,
  SALES_TABLE_TOTALS_ROW_BG,
  salesTableFilterButtonClass,
  salesTableNumericCellClass,
} from "@/lib/sales/sales-data-table-ui";
import { cn } from "@/lib/utils";

const MONEY_COLUMNS = [
  { key: "openTillGs", label: "Open till value" },
  { key: "cashWithdrawGs", label: "Cash Bank withdraw" },
  { key: "totalCashSalesGs", label: "Total cash sales", imported: true },
  { key: "cashGratuityGs", label: "Cash gratuity", imported: true },
  { key: "cashExpensesGs", label: "Cash expenses" },
  { key: "cashDepositGs", label: "Cash Bank deposit" },
  { key: "closingTillGs", label: "Closing till value" },
  { key: "balanceGs", label: "Balance" },
] as const;

/** Equal width for date + every money column. */
const COLUMN_WIDTH_CLASS = "w-[8.25rem] min-w-[8.25rem] max-w-[8.25rem]";
const COMMENTS_COLUMN_WIDTH_CLASS = "w-[14rem] min-w-[14rem] max-w-[18rem]";
const ROW_BORDER_CLASS = "border-b border-black/5";
/** Thicker week break after Sunday (matches daily-vs-waiters). */
const WEEK_SEPARATOR_CLASS =
  "shadow-[inset_0_-2px_0_0_rgba(61,66,31,0.35)]";

/** Highlight for columns synced from Daily Sales / Waiter Sales. */
const IMPORTED_HEADER_BG = "bg-[var(--venue-primary,#818a40)]/18";
const IMPORTED_BODY_BG = "bg-[var(--venue-primary,#818a40)]/[0.07]";
const IMPORTED_FOOTER_BG = "bg-[var(--venue-primary,#818a40)]/14";

type MoneyColumnKey = (typeof MONEY_COLUMNS)[number]["key"];

function isImportedMoneyColumn(
  column: (typeof MONEY_COLUMNS)[number],
): boolean {
  return "imported" in column && column.imported === true;
}

const selectClass =
  "h-9 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

type CashTableRow = {
  saleDate: string;
  weekDay: string;
  openTillGs: number;
  cashWithdrawGs: number;
  totalCashSalesGs: number;
  cashGratuityGs: number;
  cashExpensesGs: number;
  cashDepositGs: number;
  closingTillGs: number;
  balanceGs: number;
  comments: string;
  hasActivity: boolean;
  balanced: boolean;
  expenseLines: CashExpenseJustificationLine[];
};

type CashDataTableProps = {
  records: CashJournalRecord[];
  expenseLines?: VenueCashExpenseLineRecord[];
};

type JustificationDialogState = {
  saleDate: string;
  cashExpensesGs: number;
  lines: CashExpenseJustificationLine[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function CashDataTable({
  records,
  expenseLines = [],
}: CashDataTableProps) {
  const todayIso = getLocalTodayIsoDate();
  const { monthFilter, setMonthFilter, applyThisMonth } =
    usePersistedSalesMonthFilter();
  const [justificationDialog, setJustificationDialog] =
    useState<JustificationDialogState | null>(null);

  const recordsByDate = useMemo(() => {
    const map = new Map<string, CashJournalRecord>();
    for (const record of records) {
      map.set(record.sale_date, record);
    }
    return map;
  }, [records]);

  const linesByDate = useMemo(
    () => groupCashExpenseLinesByDate(expenseLines),
    [expenseLines],
  );

  const monthOptions = useMemo(
    () =>
      buildSalesTableMonthOptions(
        records.map((record) => record.sale_date),
        formatMonthLabel,
        getCurrentMonthKey,
      ),
    [records],
  );

  useEffect(() => {
    if (monthFilter && !monthOptions.some((opt) => opt.value === monthFilter)) {
      setMonthFilter(monthOptions[0]?.value ?? getCurrentMonthKey());
    }
  }, [monthFilter, monthOptions, setMonthFilter]);

  const rows = useMemo<CashTableRow[]>(() => {
    return getDatesInMonth(monthFilter).map((saleDate) => {
      const record = recordsByDate.get(saleDate);
      const openTillGs = Number(record?.openTillGs ?? 0);
      const cashWithdrawGs = Number(record?.cashWithdrawGs ?? 0);
      const totalCashSalesGs = Number(record?.totalCashSalesGs ?? 0);
      const cashGratuityGs = Number(record?.cashGratuityGs ?? 0);
      const cashExpensesGs = Number(record?.cashExpensesGs ?? 0);
      const cashDepositGs = Number(record?.cashDepositGs ?? 0);
      const closingTillGs = Number(record?.closingTillGs ?? 0);
      const comments = String(record?.comments ?? "").trim();
      const dayExpenseLines = linesByDate[saleDate] ?? [];
      const balanceGs = computeCashJournalBalance({
        openTillGs,
        cashWithdrawGs,
        totalCashSalesGs,
        cashGratuityGs,
        cashExpensesGs,
        cashDepositGs,
        closingTillGs,
      });
      const hasActivity =
        Boolean(record) ||
        openTillGs !== 0 ||
        cashWithdrawGs !== 0 ||
        totalCashSalesGs !== 0 ||
        cashGratuityGs !== 0 ||
        cashExpensesGs !== 0 ||
        cashDepositGs !== 0 ||
        closingTillGs !== 0 ||
        comments.length > 0 ||
        dayExpenseLines.length > 0;

      return {
        saleDate,
        weekDay: getWeekDayLabel(saleDate),
        openTillGs,
        cashWithdrawGs,
        totalCashSalesGs,
        cashGratuityGs,
        cashExpensesGs,
        cashDepositGs,
        closingTillGs,
        balanceGs,
        comments,
        hasActivity,
        balanced: isCashJournalBalanced(balanceGs),
        expenseLines: dayExpenseLines,
      };
    });
  }, [monthFilter, recordsByDate, linesByDate]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        openTillGs: roundMoney(acc.openTillGs + row.openTillGs),
        cashWithdrawGs: roundMoney(acc.cashWithdrawGs + row.cashWithdrawGs),
        totalCashSalesGs: roundMoney(
          acc.totalCashSalesGs + row.totalCashSalesGs,
        ),
        cashGratuityGs: roundMoney(acc.cashGratuityGs + row.cashGratuityGs),
        cashExpensesGs: roundMoney(acc.cashExpensesGs + row.cashExpensesGs),
        cashDepositGs: roundMoney(acc.cashDepositGs + row.cashDepositGs),
        closingTillGs: roundMoney(acc.closingTillGs + row.closingTillGs),
        balanceGs: roundMoney(acc.balanceGs + row.balanceGs),
      }),
      {
        openTillGs: 0,
        cashWithdrawGs: 0,
        totalCashSalesGs: 0,
        cashGratuityGs: 0,
        cashExpensesGs: 0,
        cashDepositGs: 0,
        closingTillGs: 0,
        balanceGs: 0,
      },
    );
  }, [rows]);

  const totalColumns = 1 + MONEY_COLUMNS.length + 1;

  function cellValue(row: CashTableRow, key: MoneyColumnKey): number {
    return row[key];
  }

  function openExpenseJustification(row: CashTableRow) {
    setJustificationDialog({
      saleDate: row.saleDate,
      cashExpensesGs: row.cashExpensesGs,
      lines: row.expenseLines,
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-black/50">
              Month
            </span>
            <select
              className={selectClass}
              value={monthFilter}
              onChange={(event) => setMonthFilter(event.target.value)}
              aria-label="Month"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={applyThisMonth}
            className={salesTableFilterButtonClass()}
          >
            This month
          </button>
        </div>

        <p className="max-w-xl text-xs text-black/45">
          Open till and Closing till sync with{" "}
          <Link
            href="/sales/daily-snap"
            className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
          >
            Daily Snap
          </Link>{" "}
          (editable on Cash Journal). Highlighted columns are imported: Total
          cash sales (Daily Sales) and Cash gratuity (Waiter Sales). Balance =
          Open + Bank withdraw + Cash sales + Cash gratuity − Expenses − Bank
          deposit − Closing (target 0). Click a Cash expenses amount to view
          its references.
        </p>
      </div>

      <div className="w-fit max-w-full overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-auto table-fixed border-collapse text-left text-sm">
          <thead>
            <tr
              className={cn(
                "border-b-2 border-black/15 text-xs font-bold uppercase tracking-wide text-black",
                SALES_TABLE_HEADER_COLUMN_BG,
              )}
            >
              <th
                className={cn(
                  COLUMN_WIDTH_CLASS,
                  "sticky left-0 z-10 border-r px-2 py-2.5 text-center align-middle leading-tight",
                  SALES_TABLE_CELL_BORDER,
                  SALES_TABLE_HEADER_COLUMN_BG,
                )}
              >
                Date
              </th>
              {MONEY_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    COLUMN_WIDTH_CLASS,
                    "border-r px-2 py-2.5 text-center align-middle leading-tight last:border-r-0",
                    SALES_TABLE_CELL_BORDER,
                    isImportedMoneyColumn(column)
                      ? IMPORTED_HEADER_BG
                      : null,
                  )}
                  title={
                    isImportedMoneyColumn(column)
                      ? column.key === "totalCashSalesGs"
                        ? "Imported from Daily Sales cash tender"
                        : "Imported from Waiter Sales cash gratuity"
                      : column.key === "cashExpensesGs"
                        ? "Click an amount to open expense references"
                        : undefined
                  }
                >
                  {column.label}
                </th>
              ))}
              <th
                className={cn(
                  COMMENTS_COLUMN_WIDTH_CLASS,
                  "border-r px-2 py-2.5 text-center align-middle leading-tight last:border-r-0",
                  SALES_TABLE_CELL_BORDER,
                )}
              >
                Comments
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={totalColumns}
                  className="px-4 py-10 text-center text-sm text-black/50"
                >
                  No days found for {formatMonthLabel(monthFilter)}.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isToday = row.saleDate === todayIso;
                const bottomBorderClass =
                  row.weekDay === "SUN"
                    ? WEEK_SEPARATOR_CLASS
                    : ROW_BORDER_CLASS;
                return (
                  <tr
                    key={row.saleDate}
                    className={cn(
                      isToday
                        ? "bg-red-50 hover:bg-red-100/70"
                        : "hover:bg-black/[0.015]",
                    )}
                  >
                    <td
                      className={cn(
                        COLUMN_WIDTH_CLASS,
                        bottomBorderClass,
                        "sticky left-0 z-10 border-r px-2 py-2 align-middle",
                        SALES_TABLE_CELL_BORDER,
                        isToday ? "bg-red-50" : "bg-inherit",
                      )}
                    >
                      <Link
                        href={`/sales/cash/journal?date=${row.saleDate}`}
                        className="flex w-full items-baseline justify-center gap-1.5 text-center"
                      >
                        <span
                          className={cn(
                            "text-xs tabular-nums underline-offset-2 hover:underline",
                            isToday
                              ? "font-semibold text-red-800"
                              : "text-[#3D421F]",
                          )}
                        >
                          {formatDisplayDate(row.saleDate)}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wide",
                            isToday ? "text-red-700/70" : "text-black/40",
                          )}
                        >
                          {row.weekDay}
                        </span>
                      </Link>
                    </td>
                    {MONEY_COLUMNS.map((column) => {
                      const value = cellValue(row, column.key);
                      const empty = !row.hasActivity || value === 0;
                      const isBalance = column.key === "balanceGs";
                      const isExpenses = column.key === "cashExpensesGs";
                      const canOpenExpenses =
                        isExpenses &&
                        (row.cashExpensesGs !== 0 ||
                          row.expenseLines.length > 0);

                      return (
                        <td
                          key={column.key}
                          className={cn(
                            COLUMN_WIDTH_CLASS,
                            bottomBorderClass,
                            "border-r px-2 py-2 align-middle last:border-r-0",
                            SALES_TABLE_CELL_BORDER,
                            isToday
                              ? isImportedMoneyColumn(column)
                                ? "bg-red-100/80"
                                : "bg-red-50"
                              : isImportedMoneyColumn(column)
                                ? IMPORTED_BODY_BG
                                : null,
                          )}
                        >
                          {canOpenExpenses ? (
                            <button
                              type="button"
                              onClick={() => openExpenseJustification(row)}
                              className={cn(
                                salesTableNumericCellClass(false),
                                "inline-flex w-full items-center justify-end leading-none underline-offset-2 hover:underline",
                                "text-[#3D421F]",
                              )}
                              title="View expense references"
                            >
                              {formatMoney(value)}
                            </button>
                          ) : (
                            <span
                              className={cn(
                                salesTableNumericCellClass(false),
                                "inline-flex w-full items-center justify-end leading-none",
                                isBalance &&
                                  row.hasActivity &&
                                  (row.balanced
                                    ? "font-semibold text-emerald-700"
                                    : "font-semibold text-amber-700"),
                              )}
                            >
                              {empty && !isBalance
                                ? "—"
                                : empty && isBalance
                                  ? "—"
                                  : formatMoney(value)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td
                      className={cn(
                        COMMENTS_COLUMN_WIDTH_CLASS,
                        bottomBorderClass,
                        "border-r px-2 py-2 align-middle last:border-r-0",
                        SALES_TABLE_CELL_BORDER,
                        isToday ? "bg-red-50" : null,
                      )}
                    >
                      {row.comments ? (
                        <p className="whitespace-pre-wrap break-words text-left text-xs leading-snug text-[#3D421F]">
                          {row.comments}
                        </p>
                      ) : (
                        <span className="block text-center text-black/30">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr
              className={cn(
                "border-t-2 border-black/15 text-sm font-semibold text-[#3D421F]",
                SALES_TABLE_TOTALS_ROW_BG,
              )}
            >
              <td
                className={cn(
                  COLUMN_WIDTH_CLASS,
                  "sticky left-0 z-10 border-r px-2 py-2.5 text-center align-middle",
                  SALES_TABLE_CELL_BORDER,
                  SALES_TABLE_TOTALS_ROW_BG,
                )}
              >
                Month total
              </td>
              {MONEY_COLUMNS.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    COLUMN_WIDTH_CLASS,
                    "border-r px-2 py-2.5 align-middle last:border-r-0",
                    SALES_TABLE_CELL_BORDER,
                    isImportedMoneyColumn(column)
                      ? IMPORTED_FOOTER_BG
                      : null,
                  )}
                >
                  <span
                    className={cn(
                      salesTableNumericCellClass(false),
                      "inline-flex w-full items-center justify-end leading-none",
                      column.key === "balanceGs" &&
                        (isCashJournalBalanced(totals.balanceGs)
                          ? "text-emerald-700"
                          : "text-amber-700"),
                    )}
                  >
                    {formatMoney(totals[column.key])}
                  </span>
                </td>
              ))}
              <td
                className={cn(
                  COMMENTS_COLUMN_WIDTH_CLASS,
                  "border-r px-2 py-2.5 align-middle last:border-r-0",
                  SALES_TABLE_CELL_BORDER,
                )}
              />
            </tr>
          </tfoot>
        </table>
      </div>

      <CashExpenseJustificationDialog
        open={justificationDialog !== null}
        onClose={() => setJustificationDialog(null)}
        saleDate={justificationDialog?.saleDate ?? todayIso}
        cashExpensesGs={justificationDialog?.cashExpensesGs ?? 0}
        lines={justificationDialog?.lines ?? []}
      />
    </div>
  );
}
