"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { SalesEntryDateBar } from "@/components/sales/sales-entry-date-bar";
import { SalesEntryDateBanner } from "@/components/sales/sales-entry-date-banner";
import {
  salesFormColumnShellClass,
  salesFormDateBannerMaxWidthStyle,
  salesFormDateBannerShellClass,
} from "@/components/sales/sales-form-field-row";
import { SalesNumericInput } from "@/components/sales/sales-numeric-input";
import {
  usePersistedSalesEntryDate,
  usePersistedSalesMonthFilter,
} from "@/components/sales/use-persisted-sales-filters";
import { useSalesFormUnsavedGuard } from "@/components/sales/use-sales-form-unsaved-guard";
import { toast } from "@/components/ui/toast";
import { saveVenueCashExpenseLines } from "@/lib/actions/sales";
import { formatDisplayDate } from "@/lib/dates/display";
import {
  buildCashExpenseDayRow,
  cashExpenseRecordToLine,
  groupCashExpenseLinesByDate,
  isCashExpenseJustified,
  type CashExpenseJustificationLine,
} from "@/lib/sales/cash-expenses-calculations";
import type { VenueCashExpenseLineRecord } from "@/lib/sales/cash-expenses-types";
import type { VenueCashJournalRecord } from "@/lib/sales/cash-journal-types";
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
import {
  canCreateSalesEntryForDate,
  FUTURE_SALES_ENTRY_ERROR,
  getLocalTodayIsoDate,
} from "@/lib/sales/sales-entry-dates";
import {
  SALES_TABLE_CELL_BORDER,
  SALES_TABLE_HEADER_COLUMN_BG,
  SALES_TABLE_TOTALS_ROW_BG,
  salesTableFilterButtonClass,
  salesTableNumericCellClass,
} from "@/lib/sales/sales-data-table-ui";
import { cn } from "@/lib/utils";

const IMPORTED_HEADER_BG = "bg-[var(--venue-primary,#818a40)]/18";
const IMPORTED_BODY_BG = "bg-[var(--venue-primary,#818a40)]/[0.07]";
const IMPORTED_FOOTER_BG = "bg-[var(--venue-primary,#818a40)]/14";

const selectClass =
  "h-9 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

const searchClass =
  "h-9 w-full min-w-[12rem] max-w-sm rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition placeholder:text-black/35 focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

/** Form columns + monthly table share this centered band (~2/3 of the content width). */
const sectionBandClass = "mx-auto w-full md:w-2/3";

type CashExpensesPanelProps = {
  journalRecords: VenueCashJournalRecord[];
  expenseLines: VenueCashExpenseLineRecord[];
  canEdit: boolean;
};

function newLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyLine(): CashExpenseJustificationLine {
  return {
    id: newLineId(),
    description: "",
    grossGs: 0,
    vatGs: 0,
    netGs: 0,
    pchasePortal: false,
  };
}

export function CashExpensesPanel({
  journalRecords,
  expenseLines,
  canEdit,
}: CashExpensesPanelProps) {
  const today = getLocalTodayIsoDate();
  const { selectedDate, setSelectedDate } = usePersistedSalesEntryDate(today);
  const { monthFilter, setMonthFilter, applyThisMonth } =
    usePersistedSalesMonthFilter();
  const [searchQuery, setSearchQuery] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [linesByDate, setLinesByDate] = useState(() =>
    groupCashExpenseLinesByDate(expenseLines),
  );
  const [isPending, startTransition] = useTransition();

  const serverLinesByDate = useMemo(
    () => groupCashExpenseLinesByDate(expenseLines),
    [expenseLines],
  );

  useEffect(() => {
    if (isFormOpen) return;
    setLinesByDate(serverLinesByDate);
  }, [serverLinesByDate, isFormOpen]);

  const expensesByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const record of journalRecords) {
      const amount = Number(record.cash_expenses_gs ?? 0);
      if (amount === 0) continue;
      map.set(record.sale_date, Math.round(amount * 100) / 100);
    }
    return map;
  }, [journalRecords]);

  const datesWithExpenses = useMemo(() => {
    const dates = new Set(expensesByDate.keys());
    for (const saleDate of Object.keys(serverLinesByDate)) {
      dates.add(saleDate);
    }
    return dates;
  }, [expensesByDate, serverLinesByDate]);

  const monthOptions = useMemo(
    () =>
      buildSalesTableMonthOptions(
        Array.from(datesWithExpenses),
        formatMonthLabel,
        getCurrentMonthKey,
      ),
    [datesWithExpenses],
  );

  useEffect(() => {
    if (monthFilter && !monthOptions.some((opt) => opt.value === monthFilter)) {
      setMonthFilter(monthOptions[0]?.value ?? getCurrentMonthKey());
    }
  }, [monthFilter, monthOptions, setMonthFilter]);

  const selectedExpensesGs = expensesByDate.get(selectedDate) ?? 0;
  const selectedLines = linesByDate[selectedDate] ?? [];
  const selectedDay = buildCashExpenseDayRow({
    saleDate: selectedDate,
    cashExpensesGs: selectedExpensesGs,
    lines: selectedLines,
  });
  const isExisting =
    selectedLines.length > 0 ||
    (serverLinesByDate[selectedDate]?.length ?? 0) > 0;
  const fieldsEditable = canEdit && isFormOpen;

  const tableRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return getDatesInMonth(monthFilter)
      .map((saleDate) => {
        const cashExpensesGs = expensesByDate.get(saleDate) ?? 0;
        const lines = linesByDate[saleDate] ?? [];
        const day = buildCashExpenseDayRow({
          saleDate,
          cashExpensesGs,
          lines,
        });
        return {
          ...day,
          weekDay: getWeekDayLabel(saleDate),
          hasActivity: cashExpensesGs !== 0 || lines.length > 0,
          portalFlags: lines.map((line) => Boolean(line.pchasePortal)),
        };
      })
      .filter((row) => row.cashExpensesGs !== 0)
      .filter((row) => {
        if (!query) return true;
        const haystack = [
          row.saleDate,
          formatDisplayDate(row.saleDate),
          row.weekDay,
          ...(linesByDate[row.saleDate] ?? []).map((line) => line.description),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
  }, [expensesByDate, linesByDate, monthFilter, searchQuery]);

  const totals = useMemo(() => {
    return tableRows.reduce(
      (acc, row) => ({
        cashExpensesGs: Math.round((acc.cashExpensesGs + row.cashExpensesGs) * 100) / 100,
        justifiedGrossGs: Math.round((acc.justifiedGrossGs + row.justifiedGrossGs) * 100) / 100,
        justifiedVatGs: Math.round((acc.justifiedVatGs + row.justifiedVatGs) * 100) / 100,
        justifiedNetGs: Math.round((acc.justifiedNetGs + row.justifiedNetGs) * 100) / 100,
        toJustifyGs: Math.round((acc.toJustifyGs + row.toJustifyGs) * 100) / 100,
        portalChecked: acc.portalChecked + row.portalFlags.filter(Boolean).length,
        portalTotal: acc.portalTotal + row.portalFlags.length,
      }),
      {
        cashExpensesGs: 0,
        justifiedGrossGs: 0,
        justifiedVatGs: 0,
        justifiedNetGs: 0,
        toJustifyGs: 0,
        portalChecked: 0,
        portalTotal: 0,
      },
    );
  }, [tableRows]);

  const saveFormRef = useRef<() => Promise<boolean>>(async () => false);
  const { syncBaseline, guardAction, unsavedDialog } = useSalesFormUnsavedGuard({
    isEditing: isFormOpen,
    state: { selectedDate, lines: selectedLines },
    onSaveRef: saveFormRef,
  });

  saveFormRef.current = async () => {
    const lines = (linesByDate[selectedDate] ?? []).filter(
      (line) =>
        line.description.trim().length > 0 ||
        line.grossGs > 0 ||
        line.vatGs > 0 ||
        line.netGs > 0 ||
        line.pchasePortal,
    );

    const formData = new FormData();
    formData.set("sale_date", selectedDate);
    formData.set(
      "lines",
      JSON.stringify(
        lines.map((line) => ({
          description: line.description,
          gross_gs: line.grossGs,
          vat_gs: line.vatGs,
          net_gs: line.netGs,
          pchase_portal: line.pchasePortal,
        })),
      ),
    );

    const result = await saveVenueCashExpenseLines(formData);
    if (result.error) {
      toast.error(result.error);
      return false;
    }

    const nextLines = (result.records ?? []).map(cashExpenseRecordToLine);
    setLinesByDate((prev) => {
      if (nextLines.length === 0) {
        const { [selectedDate]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [selectedDate]: nextLines };
    });
    syncBaseline({ selectedDate, lines: nextLines });
    setIsFormOpen(false);
    toast.saved(result.success ?? "Saved to cloud.");
    return true;
  };

  function handleDateChange(date: string) {
    guardAction(() => {
      setSelectedDate(date);
      setIsFormOpen(false);
    });
  }

  function openForm() {
    if (!canCreateSalesEntryForDate(selectedDate, isExisting)) {
      toast.alert(FUTURE_SALES_ENTRY_ERROR);
      return;
    }
    const existing = linesByDate[selectedDate] ?? [];
    const initial = existing.length > 0 ? existing : [emptyLine()];
    if (existing.length === 0) {
      setLinesByDate((prev) => ({ ...prev, [selectedDate]: initial }));
    }
    syncBaseline({ selectedDate, lines: initial });
    setIsFormOpen(true);
  }

  function handleSave() {
    startTransition(() => {
      void saveFormRef.current();
    });
  }

  function addReference() {
    if (!canEdit) return;
    if (!canCreateSalesEntryForDate(selectedDate, isExisting || isFormOpen)) {
      toast.alert(FUTURE_SALES_ENTRY_ERROR);
      return;
    }
    setIsFormOpen(true);
    setLinesByDate((prev) => ({
      ...prev,
      [selectedDate]: [...(prev[selectedDate] ?? []), emptyLine()],
    }));
  }

  function updateLine(
    lineId: string,
    patch: Partial<
      Pick<
        CashExpenseJustificationLine,
        "description" | "grossGs" | "vatGs" | "netGs" | "pchasePortal"
      >
    >,
  ) {
    setLinesByDate((prev) => ({
      ...prev,
      [selectedDate]: (prev[selectedDate] ?? []).map((line) =>
        line.id === lineId ? { ...line, ...patch } : line,
      ),
    }));
  }

  function removeLine(lineId: string) {
    setLinesByDate((prev) => {
      const next = (prev[selectedDate] ?? []).filter((line) => line.id !== lineId);
      if (next.length === 0) {
        const { [selectedDate]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [selectedDate]: next };
    });
  }

  return (
    <div className="space-y-6">
      {unsavedDialog}
      <SalesEntryDateBar
        selectedDate={selectedDate}
        canEdit={canEdit}
        onDateChange={handleDateChange}
        isFormOpen={isFormOpen}
        isExisting={isExisting}
        isPending={isPending}
        onOpenForm={openForm}
        onSave={handleSave}
        datesWithEntries={datesWithExpenses}
      />

      <div
        className={cn(salesFormDateBannerShellClass(), "mx-auto")}
        style={salesFormDateBannerMaxWidthStyle}
      >
        <SalesEntryDateBanner dateStr={selectedDate} />
      </div>

      <p className="text-center text-sm text-black/55">
        Cash expense totals import from{" "}
        <Link
          href={`/sales/cash/journal?date=${selectedDate}`}
          className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
        >
          Cash Journal
        </Link>
        . Justify each day with line items below.
      </p>

      <div
        className={cn(
          sectionBandClass,
          "flex flex-wrap items-stretch justify-center gap-6",
        )}
      >
        <div
          className={cn(
            salesFormColumnShellClass(),
            "min-w-[min(100%,14rem)] flex-[1_1_14rem] gap-2 border-black/15 bg-[var(--venue-secondary,#F0F3DD)]",
          )}
        >
          <h3 className="font-serif text-lg font-bold text-[#3D421F]">
            Day summary
          </h3>
          <p className="text-center text-[11px] leading-relaxed text-black/50">
            Justified gross − Cash expenses = To justify (target 0)
          </p>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-md border border-black/10 bg-white/70 px-3 py-2">
              <dt className="text-black/55">Cash expenses</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {selectedExpensesGs === 0 ? "—" : formatMoney(selectedExpensesGs)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-black/10 bg-white/70 px-3 py-2">
              <dt className="text-black/55">Justified (gross)</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {formatMoney(selectedDay.justifiedGrossGs)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-black/10 bg-white/70 px-3 py-2">
              <dt className="text-black/55">Justified VAT</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {formatMoney(selectedDay.justifiedVatGs)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-black/10 bg-white/70 px-3 py-2">
              <dt className="text-black/55">Justified net</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {formatMoney(selectedDay.justifiedNetGs)}
              </dd>
            </div>
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-center",
                selectedDay.justified
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-amber-200 bg-amber-50",
              )}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-black/45">
                To justify
              </p>
              <p
                className={cn(
                  "mt-0.5 text-lg font-bold tabular-nums",
                  selectedDay.justified ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {formatMoney(selectedDay.toJustifyGs)}
              </p>
              <p
                className={cn(
                  "mt-1 text-xs font-medium",
                  selectedDay.justified ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {selectedDay.justified
                  ? "Fully justified"
                  : "Still to justify"}
              </p>
            </div>
          </dl>
          {selectedExpensesGs === 0 ? (
            <p className="text-center text-[11px] text-black/45">
              No cash expenses on Cash Journal for this date.
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            salesFormColumnShellClass(),
            "min-w-[min(100%,28rem)] flex-[2_1_28rem]",
          )}
        >
          <h3 className="font-serif text-lg font-bold text-[#3D421F]">
            Justify expenses
          </h3>
          <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr
                  className={cn(
                    "border-b border-black/10 text-[11px] font-bold uppercase tracking-wide text-black/60",
                    SALES_TABLE_HEADER_COLUMN_BG,
                  )}
                >
                  <th className="px-2 py-2 text-left">Description</th>
                  <th className="w-[6.5rem] px-2 py-2 text-right">Gross</th>
                  <th className="w-[6.5rem] px-2 py-2 text-right">VAT</th>
                  <th className="w-[6.5rem] px-2 py-2 text-right">Net</th>
                  <th className="w-[6.5rem] px-2 py-2 text-center leading-tight">
                    PChase
                    <br />
                    Portal
                  </th>
                  {fieldsEditable ? (
                    <th className="w-10 px-1 py-2 text-center">
                      <span className="sr-only">Remove</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {selectedLines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={fieldsEditable ? 6 : 5}
                      className="px-3 py-8 text-center text-xs text-black/40"
                    >
                      No references for this day yet.
                      {canEdit && !isFormOpen
                        ? " Open Edit entry to add references."
                        : null}
                    </td>
                  </tr>
                ) : (
                  selectedLines.map((line, index) => (
                    <tr
                      key={line.id}
                      className="border-b border-black/5 last:border-b-0"
                    >
                      <td className="px-2 py-1.5 align-middle">
                        {fieldsEditable ? (
                          <input
                            type="text"
                            value={line.description}
                            onChange={(event) =>
                              updateLine(line.id, {
                                description: event.target.value,
                              })
                            }
                            placeholder="What was spent…"
                            className="h-8 w-full rounded border border-black/10 bg-white px-2 text-sm text-[#3D421F] placeholder:text-black/35 outline-none focus:border-[var(--venue-primary,#818a40)]/50"
                          />
                        ) : (
                          <span
                            className={cn(
                              "block text-[#3D421F]",
                              !line.description.trim() && "text-black/35",
                            )}
                          >
                            {line.description.trim() || "—"}
                          </span>
                        )}
                      </td>
                      {(
                        [
                          ["grossGs", line.grossGs],
                          ["vatGs", line.vatGs],
                          ["netGs", line.netGs],
                        ] as const
                      ).map(([field, value]) => (
                        <td key={field} className="px-2 py-1.5 align-middle">
                          {fieldsEditable ? (
                            <SalesNumericInput
                              key={`${field}-${line.id}`}
                              value={value}
                              disabled={false}
                              onChange={(raw) => {
                                const parsed = Number.parseFloat(raw);
                                updateLine(line.id, {
                                  [field]:
                                    !Number.isFinite(parsed) || parsed < 0
                                      ? 0
                                      : Math.round(parsed * 100) / 100,
                                });
                              }}
                              className="h-8"
                            />
                          ) : (
                            <span
                              className={cn(
                                "block text-right tabular-nums text-[#3D421F]",
                                value === 0 && "text-black/35",
                              )}
                            >
                              {value === 0 ? "—" : formatMoney(value)}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-center align-middle">
                        <input
                          type="checkbox"
                          checked={line.pchasePortal}
                          disabled={!fieldsEditable}
                          onChange={(event) =>
                            updateLine(line.id, {
                              pchasePortal: event.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-black/20 text-[var(--venue-primary,#818a40)] accent-[var(--venue-primary,#818a40)] disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`PChase Portal for reference ${index + 1}`}
                        />
                      </td>
                      {fieldsEditable ? (
                        <td className="px-1 py-1.5 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            className="rounded p-1 text-black/35 transition-colors hover:bg-red-50 hover:text-red-700"
                            aria-label={`Remove reference ${index + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
              {selectedLines.length > 0 ? (
                <tfoot>
                  <tr
                    className={cn(
                      "border-t border-black/10 text-sm font-semibold text-[#3D421F]",
                      SALES_TABLE_TOTALS_ROW_BG,
                    )}
                  >
                    <td className="px-2 py-2">Day total</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(selectedDay.justifiedGrossGs)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(selectedDay.justifiedVatGs)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(selectedDay.justifiedNetGs)}
                    </td>
                    <td />
                    {fieldsEditable ? <td /> : null}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          {fieldsEditable ? (
            <button
              type="button"
              onClick={addReference}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-black/15 bg-white text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary,#F0F3DD)]/50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add another reference
            </button>
          ) : null}
        </div>

      </div>

      <div className={cn(sectionBandClass, "flex flex-col space-y-4")}>
        <div className="flex w-full flex-wrap items-end gap-2">
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
          <label className="block min-w-[12rem] flex-1 space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-black/50">
              Search
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Date or description…"
              className={cn(searchClass, "max-w-none")}
              aria-label="Search expenses"
            />
          </label>
        </div>

        <p className="text-xs text-black/45">
          Highlighted Cash expenses values come from Cash Journal. Justified
          gross/VAT/net are sums of reference lines. To justify is Justified
          gross minus Cash expenses (target 0).
        </p>

        <div className="w-full overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <thead>
              <tr
                className={cn(
                  "border-b-2 border-black/15 text-xs font-bold uppercase tracking-wide text-black",
                  SALES_TABLE_HEADER_COLUMN_BG,
                )}
              >
                <th
                  className={cn(
                    "w-[14%] border-r px-2 py-2.5 text-center align-middle",
                    SALES_TABLE_CELL_BORDER,
                  )}
                >
                  Date
                </th>
                <th
                  className={cn(
                    "w-[14%] border-r px-2 py-2.5 text-center align-middle",
                    SALES_TABLE_CELL_BORDER,
                    IMPORTED_HEADER_BG,
                  )}
                  title="Imported from Cash Journal"
                >
                  Cash expenses
                </th>
                <th
                  className={cn(
                    "w-[12%] border-r px-2 py-2.5 text-center align-middle",
                    SALES_TABLE_CELL_BORDER,
                  )}
                >
                  Gross
                </th>
                <th
                  className={cn(
                    "w-[12%] border-r px-2 py-2.5 text-center align-middle",
                    SALES_TABLE_CELL_BORDER,
                  )}
                >
                  VAT
                </th>
                <th
                  className={cn(
                    "w-[12%] border-r px-2 py-2.5 text-center align-middle",
                    SALES_TABLE_CELL_BORDER,
                  )}
                >
                  Net
                </th>
                <th
                  className={cn(
                    "w-[18%] border-r px-2 py-2.5 text-center align-middle leading-tight",
                    SALES_TABLE_CELL_BORDER,
                  )}
                  title="One tick per reference marked in PChase Portal"
                >
                  PChase Portal
                </th>
                <th
                  className={cn(
                    "w-[18%] px-2 py-2.5 text-center align-middle",
                    SALES_TABLE_CELL_BORDER,
                  )}
                >
                  To justify
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-black/50"
                  >
                    No days with cash expenses for{" "}
                    {formatMonthLabel(monthFilter)}.
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => {
                  const isToday = row.saleDate === today;
                  return (
                    <tr
                      key={row.saleDate}
                      className={cn(
                        "border-b border-black/5",
                        isToday
                          ? "bg-red-50 hover:bg-red-100/70"
                          : "hover:bg-black/[0.015]",
                      )}
                    >
                      <td
                        className={cn(
                          "border-r px-2 py-2 align-middle",
                          SALES_TABLE_CELL_BORDER,
                          isToday ? "bg-red-50" : null,
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleDateChange(row.saleDate)}
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
                        </button>
                      </td>
                      <td
                        className={cn(
                          "border-r px-2 py-2 align-middle",
                          SALES_TABLE_CELL_BORDER,
                          isToday ? "bg-red-100/80" : IMPORTED_BODY_BG,
                        )}
                      >
                        <span
                          className={cn(
                            salesTableNumericCellClass(false),
                            "inline-flex w-full items-center justify-end leading-none",
                          )}
                        >
                          {!row.hasActivity || row.cashExpensesGs === 0
                            ? "—"
                            : formatMoney(row.cashExpensesGs)}
                        </span>
                      </td>
                      {(
                        [
                          row.justifiedGrossGs,
                          row.justifiedVatGs,
                          row.justifiedNetGs,
                        ] as const
                      ).map((value, moneyIndex) => (
                        <td
                          key={moneyIndex}
                          className={cn(
                            "border-r px-2 py-2 align-middle",
                            SALES_TABLE_CELL_BORDER,
                            isToday ? "bg-red-50" : null,
                          )}
                        >
                          <span
                            className={cn(
                              salesTableNumericCellClass(false),
                              "inline-flex w-full items-center justify-end leading-none",
                            )}
                          >
                            {!row.hasActivity || value === 0
                              ? "—"
                              : formatMoney(value)}
                          </span>
                        </td>
                      ))}
                      <td
                        className={cn(
                          "border-r px-2 py-2 align-middle",
                          SALES_TABLE_CELL_BORDER,
                          isToday ? "bg-red-50" : null,
                        )}
                      >
                        {row.portalFlags.length === 0 ? (
                          <span className="block text-center text-black/30">—</span>
                        ) : (
                          <div
                            className="flex flex-wrap items-center justify-center gap-1"
                            title={
                              row.portalFlags.every(Boolean)
                                ? "All references marked in PChase Portal"
                                : `${row.portalFlags.filter(Boolean).length}/${row.portalFlags.length} references in PChase Portal`
                            }
                          >
                            {row.portalFlags.map((checked, index) =>
                              checked ? (
                                <span
                                  key={index}
                                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-600/30 bg-emerald-50 text-emerald-700"
                                  aria-label={`Reference ${index + 1}: in PChase Portal`}
                                >
                                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                                </span>
                              ) : (
                                <span
                                  key={index}
                                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-black/15 bg-white text-black/25"
                                  aria-label={`Reference ${index + 1}: not in PChase Portal`}
                                />
                              ),
                            )}
                          </div>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 align-middle",
                          SALES_TABLE_CELL_BORDER,
                          isToday ? "bg-red-50" : null,
                        )}
                      >
                        <span
                          className={cn(
                            salesTableNumericCellClass(false),
                            "inline-flex w-full items-center justify-end leading-none",
                            row.hasActivity &&
                              (row.justified
                                ? "font-semibold text-emerald-700"
                                : "font-semibold text-amber-700"),
                          )}
                        >
                          {!row.hasActivity
                            ? "—"
                            : formatMoney(row.toJustifyGs)}
                        </span>
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
                    "border-r px-2 py-2.5 text-center align-middle",
                    SALES_TABLE_CELL_BORDER,
                  )}
                >
                  Month total
                </td>
                <td
                  className={cn(
                    "border-r px-2 py-2.5 align-middle",
                    SALES_TABLE_CELL_BORDER,
                    IMPORTED_FOOTER_BG,
                  )}
                >
                  <span
                    className={cn(
                      salesTableNumericCellClass(false),
                      "inline-flex w-full items-center justify-end leading-none",
                    )}
                  >
                    {formatMoney(totals.cashExpensesGs)}
                  </span>
                </td>
                {(
                  [
                    totals.justifiedGrossGs,
                    totals.justifiedVatGs,
                    totals.justifiedNetGs,
                  ] as const
                ).map((value, moneyIndex) => (
                  <td
                    key={moneyIndex}
                    className={cn(
                      "border-r px-2 py-2.5 align-middle",
                      SALES_TABLE_CELL_BORDER,
                    )}
                  >
                    <span
                      className={cn(
                        salesTableNumericCellClass(false),
                        "inline-flex w-full items-center justify-end leading-none",
                      )}
                    >
                      {formatMoney(value)}
                    </span>
                  </td>
                ))}
                <td
                  className={cn(
                    "border-r px-2 py-2.5 text-center align-middle tabular-nums",
                    SALES_TABLE_CELL_BORDER,
                  )}
                >
                  {totals.portalTotal === 0
                    ? "—"
                    : `${totals.portalChecked}/${totals.portalTotal}`}
                </td>
                <td className={cn("px-2 py-2.5 align-middle", SALES_TABLE_CELL_BORDER)}>
                  <span
                    className={cn(
                      salesTableNumericCellClass(false),
                      "inline-flex w-full items-center justify-end leading-none",
                      isCashExpenseJustified(totals.toJustifyGs)
                        ? "text-emerald-700"
                        : "text-amber-700",
                    )}
                  >
                    {formatMoney(totals.toJustifyGs)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
