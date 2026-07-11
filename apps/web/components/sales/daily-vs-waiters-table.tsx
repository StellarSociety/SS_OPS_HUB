"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FileDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { isFutureSalesEntryDate } from "@/lib/sales/sales-entry-dates";
import {
  removeVenueDailyVsWaitersComment,
  saveVenueDailyVsWaitersComment,
} from "@/lib/actions/sales";
import {
  formatCount,
  formatDisplayDate,
  formatMoney,
  formatMonthLabel,
  getCurrentMonthKey,
} from "@/lib/sales/daily-sales-calculations";
import {
  buildDailyVsWaitersRows,
  summarizeDailyVsWaitersRows,
  type DailyVsWaitersDayRow,
} from "@/lib/sales/daily-vs-waiters-calculations";
import { exportDailyVsWaitersPdf } from "@/lib/sales/daily-vs-waiters-pdf";
import {
  DailyVsWaitersExportDialog,
  DEFAULT_DAILY_VS_WAITERS_PDF_SECTIONS,
  type DailyVsWaitersPdfSections,
} from "@/components/sales/daily-vs-waiters-export-dialog";
import type { VenueDailyVsWaitersComment } from "@/lib/sales/daily-vs-waiters-types";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import {
  SALES_TABLE_CELL_BORDER,
  SALES_TABLE_HEADER_COLUMN_BG,
  SALES_TABLE_HEADER_SECTION_BG,
  SALES_TABLE_STICKY_BODY_META_BG,
  SALES_TABLE_STICKY_BORDER,
  salesTableFilterButtonClass,
  salesTableFilterClearButtonClass,
} from "@/lib/sales/sales-data-table-ui";
import {
  buildSalesTableMonthOptions,
  SALES_TABLE_EMPTY_ROW_CLASS,
} from "@/lib/sales/sales-data-table-dates";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";
import { cn } from "@/lib/utils";

const COMMENTS_COLUMN_MIN_WIDTH = "22rem";
const DATE_META_COLUMNS = [
  { key: "date", width: "6.25rem", left: "0px", label: "Date" },
  { key: "week", width: "2.5rem", left: "6.25rem", label: "Wk" },
  { key: "day", width: "2.75rem", left: "8.75rem", label: "Day" },
] as const;
const DATA_COLUMNS = [
  { key: "covers-daily", label: "Daily", width: "6.5rem", sectionStart: true },
  { key: "covers-waiters", label: "Waiters", width: "6.5rem", sectionStart: false },
  { key: "covers-diff", label: "Diff", width: "7rem", sectionStart: false },
  { key: "sales-daily", label: "Daily", width: "8.5rem", sectionStart: true },
  { key: "sales-waiters", label: "Waiters", width: "8.5rem", sectionStart: false },
  { key: "sales-diff", label: "Diff", width: "9rem", sectionStart: false },
] as const;
const NUMERIC_VALUE_CLASS =
  "block whitespace-nowrap text-right text-xs tabular-nums";
const ROW_BORDER_CLASS = "border-b border-black/5";
const WEEK_SEPARATOR_CLASS =
  "shadow-[inset_0_-2px_0_0_rgba(61,66,31,0.35)]";
const BODY_CELL_CLASS = "align-middle py-2";

type DailyVsWaitersTableProps = {
  venueName: string;
  venueLogoUrl?: string | null;
  dailyRecords: VenueDailySalesRecord[];
  waiterRecords: VenueWaiterDailySalesEntry[];
  comments: VenueDailyVsWaitersComment[];
  totalTaxPct: number;
  canEdit: boolean;
};

function formatDifference(value: number): string {
  if (value === 0) return formatMoney(0);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

function formatCoversDifference(value: number): string {
  if (value === 0) return formatCount(0);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatCount(Math.abs(value))}`;
}

function differenceClass(value: number, balancedClass = "text-emerald-700") {
  if (value === 0) return balancedClass;
  return "font-semibold text-amber-700";
}

function hasActivity(row: DailyVsWaitersDayRow): boolean {
  return row.hasDailyRecord || row.hasWaiterRecords;
}

function isSundayRow(row: DailyVsWaitersDayRow): boolean {
  return row.weekDay === "SUN";
}

function dataRowClassName(row: DailyVsWaitersDayRow): string {
  return cn(
    hasActivity(row) && !row.isMatched && "bg-amber-50/60",
    !hasActivity(row) && SALES_TABLE_EMPTY_ROW_CLASS,
  );
}

function cellBottomBorderClass(row: DailyVsWaitersDayRow): string {
  return isSundayRow(row) ? WEEK_SEPARATOR_CLASS : ROW_BORDER_CLASS;
}

function ValueCell({
  value,
  missing,
  formatter,
  className,
}: {
  value: number;
  missing?: boolean;
  formatter: (value: number) => string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        NUMERIC_VALUE_CLASS,
        missing ? "text-black/35" : "text-black/80",
        className,
      )}
    >
      {missing ? "—" : formatter(value)}
    </span>
  );
}

function commentTextareaClass(disabled: boolean) {
  return cn(
    "min-h-[2.25rem] w-full min-w-0 resize-y rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs text-[#3D421F] placeholder:text-black/35",
    disabled && "cursor-not-allowed opacity-60",
  );
}

function DayCommentCell({
  saleDate,
  comment,
  canEdit,
  isEditing,
  isPending,
  draft,
  onDraftChange,
  onEdit,
  onSave,
  onDelete,
  disableCreate = false,
  className,
}: {
  saleDate: string;
  comment: VenueDailyVsWaitersComment | undefined;
  canEdit: boolean;
  isEditing: boolean;
  isPending: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
  disableCreate?: boolean;
  className?: string;
}) {
  const displayText = comment?.comment_text?.trim() ?? "";

  return (
    <td
      className={cn(
        BODY_CELL_CLASS,
        "border-l border-black/5 px-2",
        isEditing && "bg-white",
        className,
      )}
      style={{ minWidth: COMMENTS_COLUMN_MIN_WIDTH }}
    >
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              disabled={!canEdit || isPending}
              placeholder="Note why covers or sales differ…"
              rows={2}
              className={commentTextareaClass(!canEdit || isPending)}
              aria-label={`Comment for ${saleDate}`}
            />
          ) : (
            <p
              className={cn(
                "text-xs leading-relaxed text-black/75",
                !displayText && "text-black/35",
              )}
              title={displayText || undefined}
            >
              {displayText || "—"}
            </p>
          )}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 flex-row items-center gap-1">
            <button
              type="button"
              disabled={isPending || (!isEditing && !comment && disableCreate)}
              onClick={isEditing ? onSave : onEdit}
              title={
                !isEditing && !comment && disableCreate
                  ? "Entries cannot be created for a future date."
                  : undefined
              }
              className="h-6 rounded border border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/10 px-1.5 text-[10px] font-bold leading-none text-[#3D421F] transition-colors hover:bg-[var(--venue-primary)]/15 disabled:opacity-50"
            >
              {isPending ? "…" : isEditing ? "Save" : "Edit"}
            </button>
            <button
              type="button"
              disabled={isPending || isEditing || !comment}
              onClick={onDelete}
              className="h-6 rounded border border-red-200 bg-red-50 px-1.5 text-[10px] font-bold leading-none text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </td>
  );
}

export function DailyVsWaitersTable({
  venueName,
  venueLogoUrl,
  dailyRecords,
  waiterRecords,
  comments,
  totalTaxPct,
  canEdit,
}: DailyVsWaitersTableProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportSections, setExportSections] = useState<DailyVsWaitersPdfSections>(
    DEFAULT_DAILY_VS_WAITERS_PDF_SECTIONS,
  );
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [monthFilter, setMonthFilter] = useState(() => getCurrentMonthKey());

  const commentsByDate = useMemo(
    () => new Map(comments.map((comment) => [comment.sale_date, comment])),
    [comments],
  );

  const monthOptions = useMemo(
    () =>
      buildSalesTableMonthOptions(
        [
          ...dailyRecords.map((record) => record.sale_date),
          ...waiterRecords.map((record) => record.sale_date),
        ],
        formatMonthLabel,
        getCurrentMonthKey,
      ),
    [dailyRecords, waiterRecords],
  );

  useEffect(() => {
    if (monthFilter && !monthOptions.some((opt) => opt.value === monthFilter)) {
      setMonthFilter(monthOptions[0]?.value ?? getCurrentMonthKey());
    }
  }, [monthFilter, monthOptions]);

  const rows = useMemo(
    () => buildDailyVsWaitersRows(monthFilter, dailyRecords, waiterRecords, totalTaxPct),
    [monthFilter, dailyRecords, waiterRecords, totalTaxPct],
  );

  const summary = useMemo(() => summarizeDailyVsWaitersRows(rows), [rows]);

  const activeRowCount = rows.filter(hasActivity).length;
  const monthLabel =
    monthOptions.find((option) => option.value === monthFilter)?.label ??
    formatMonthLabel(monthFilter);

  function openExportDialog() {
    setExportSections(DEFAULT_DAILY_VS_WAITERS_PDF_SECTIONS);
    setExportDialogOpen(true);
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      await exportDailyVsWaitersPdf({
        venueName,
        venueLogoUrl,
        monthKey: monthFilter,
        monthLabel,
        rows,
        summary,
        comments,
        activeRowCount,
        sections: exportSections,
        exportedAt: new Date(),
      });
      setExportDialogOpen(false);
    } catch (error) {
      console.error("[daily-vs-waiters/pdf]", error);
      window.alert("Could not export PDF. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  }

  function beginEdit(saleDate: string) {
    const existing = commentsByDate.get(saleDate);
    setDrafts((prev) => ({
      ...prev,
      [saleDate]: existing?.comment_text ?? "",
    }));
    setEditingDate(saleDate);
  }

  function cancelEdit() {
    setEditingDate(null);
  }

  function handleSave(saleDate: string) {
    const comment = commentsByDate.get(saleDate);
    const formData = new FormData();
    if (comment?.id) formData.set("id", comment.id);
    formData.set("sale_date", saleDate);
    formData.set("comment_text", drafts[saleDate] ?? "");

    setPendingDate(saleDate);
    startTransition(async () => {
      const result = await saveVenueDailyVsWaitersComment(formData);
      setPendingDate(null);
      if (result.error) {
        window.alert(result.error);
        return;
      }
      setEditingDate(null);
      router.refresh();
    });
  }

  function handleDelete(saleDate: string) {
    const comment = commentsByDate.get(saleDate);
    if (!comment) return;

    if (
      !window.confirm(
        `Delete the comment for ${formatDisplayDate(saleDate)}?`,
      )
    ) {
      return;
    }

    setPendingDate(saleDate);
    startTransition(async () => {
      const result = await removeVenueDailyVsWaitersComment(comment.id);
      setPendingDate(null);
      if (result.error) {
        window.alert(result.error);
        return;
      }
      if (editingDate === saleDate) {
        setEditingDate(null);
      }
      router.refresh();
    });
  }

  useEffect(() => {
    if (editingDate && !rows.some((row) => row.sale_date === editingDate)) {
      cancelEdit();
    }
  }, [editingDate, rows]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-black/10 bg-white/80 p-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex h-9 shrink-0 items-center text-sm text-black/60">
            Month
          </span>
          <select
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
            aria-label="Month"
            className="h-9 w-[9.5rem] shrink-0 rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F]"
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setMonthFilter(getCurrentMonthKey())}
            className={salesTableFilterButtonClass()}
          >
            This month
          </button>
          <button
            type="button"
            onClick={openExportDialog}
            disabled={rows.length === 0}
            className={cn(
              salesTableFilterClearButtonClass(),
              "inline-flex items-center gap-1.5",
            )}
          >
            <FileDown className="size-4 shrink-0" aria-hidden />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-black/10 bg-white/80 px-4 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-black/50">
            Days with data
          </p>
          <p className="mt-1 text-2xl font-serif text-[#3D421F]">
            {activeRowCount}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-4 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">
            Matched days
          </p>
          <p className="mt-1 text-2xl font-serif text-emerald-800">
            {summary.matchedDays}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800/70">
            Covers discrepancies
          </p>
          <p className="mt-1 text-2xl font-serif text-amber-800">
            {summary.coversDiscrepancyDays}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800/70">
            Revenue discrepancies
          </p>
          <p className="mt-1 text-2xl font-serif text-amber-800">
            {summary.revenueDiscrepancyDays}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white/80">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            {DATE_META_COLUMNS.map((column) => (
              <col
                key={column.key}
                style={{ width: column.width, minWidth: column.width }}
              />
            ))}
            {DATA_COLUMNS.map((column) => (
              <col
                key={column.key}
                style={{ width: column.width, minWidth: column.width }}
              />
            ))}
            <col style={{ minWidth: COMMENTS_COLUMN_MIN_WIDTH }} />
          </colgroup>
          <thead>
            <tr className={SALES_TABLE_HEADER_SECTION_BG}>
              <th
                colSpan={3}
                className={`border-b ${SALES_TABLE_CELL_BORDER} px-2 py-2 text-center text-xs font-bold uppercase tracking-wide text-[#3D421F]`}
              >
                Date
              </th>
              <th
                colSpan={3}
                className={`border-b border-l ${SALES_TABLE_CELL_BORDER} px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-[#3D421F]`}
              >
                Covers
              </th>
              <th
                colSpan={3}
                className={`border-b border-l ${SALES_TABLE_CELL_BORDER} px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-[#3D421F]`}
              >
                Gross Sales
              </th>
              <th
                rowSpan={2}
                className={`border-b border-l ${SALES_TABLE_CELL_BORDER} px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[#3D421F]`}
                style={{ minWidth: COMMENTS_COLUMN_MIN_WIDTH }}
              >
                Comments
              </th>
            </tr>
            <tr className={SALES_TABLE_HEADER_COLUMN_BG}>
              {DATE_META_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "sticky z-20 whitespace-nowrap border-b px-2 py-2 text-center text-xs font-bold text-[#3D421F]",
                    SALES_TABLE_STICKY_BORDER,
                    SALES_TABLE_CELL_BORDER,
                  )}
                  style={{
                    left: column.left,
                    width: column.width,
                    minWidth: column.width,
                    maxWidth: column.width,
                  }}
                >
                  {column.label}
                </th>
              ))}
              {DATA_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "whitespace-nowrap border-b px-2 py-2 text-right text-xs font-bold text-[#3D421F]",
                    SALES_TABLE_CELL_BORDER,
                    column.sectionStart && "border-l",
                  )}
                  style={{ width: column.width, minWidth: column.width }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-8 text-center text-sm text-black/50"
                >
                  No days found for {formatMonthLabel(monthFilter)}.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const bottomBorderClass = cellBottomBorderClass(row);

                return (
                <tr key={row.sale_date} className={dataRowClassName(row)}>
                  {DATE_META_COLUMNS.map((column) => {
                    const stickyStyles = {
                      left: column.left,
                      width: column.width,
                      minWidth: column.width,
                      maxWidth: column.width,
                    };

                    if (column.key === "date") {
                      return (
                        <td
                          key={column.key}
                          className={cn(
                            BODY_CELL_CLASS,
                            bottomBorderClass,
                            `sticky left-0 z-10 whitespace-nowrap border-r ${SALES_TABLE_STICKY_BORDER} ${SALES_TABLE_CELL_BORDER} px-2 text-center ${SALES_TABLE_STICKY_BODY_META_BG}`,
                          )}
                          style={stickyStyles}
                        >
                          <span className="whitespace-nowrap text-sm font-bold tabular-nums text-[#3D421F]">
                            {formatDisplayDate(row.sale_date)}
                          </span>
                        </td>
                      );
                    }

                    if (column.key === "week") {
                      return (
                        <td
                          key={column.key}
                          className={cn(
                            BODY_CELL_CLASS,
                            bottomBorderClass,
                            `sticky z-10 whitespace-nowrap border-r ${SALES_TABLE_STICKY_BORDER} ${SALES_TABLE_CELL_BORDER} px-2 text-center text-xs font-medium tabular-nums text-black/70 ${SALES_TABLE_STICKY_BODY_META_BG}`,
                          )}
                          style={stickyStyles}
                        >
                          {row.weekNumber}
                        </td>
                      );
                    }

                    return (
                      <td
                        key={column.key}
                        className={cn(
                          BODY_CELL_CLASS,
                          bottomBorderClass,
                          `sticky z-10 whitespace-nowrap border-r ${SALES_TABLE_STICKY_BORDER} ${SALES_TABLE_CELL_BORDER} px-2 text-center text-xs font-medium text-black/70 ${SALES_TABLE_STICKY_BODY_META_BG}`,
                        )}
                        style={stickyStyles}
                      >
                        {row.weekDay}
                      </td>
                    );
                  })}
                  <td className={cn(BODY_CELL_CLASS, bottomBorderClass, "whitespace-nowrap border-l border-black/5 px-2")}>
                    <ValueCell
                      value={row.dailyCovers}
                      missing={!row.hasDailyRecord}
                      formatter={formatCount}
                    />
                  </td>
                  <td className={cn(BODY_CELL_CLASS, bottomBorderClass, "whitespace-nowrap px-2")}>
                    <ValueCell
                      value={row.waiterCovers}
                      missing={!row.hasWaiterRecords}
                      formatter={formatCount}
                    />
                  </td>
                  <td className={cn(BODY_CELL_CLASS, bottomBorderClass, "whitespace-nowrap px-2")}>
                    <span
                      className={cn(
                        NUMERIC_VALUE_CLASS,
                        differenceClass(row.coversDifference),
                      )}
                    >
                      {formatCoversDifference(row.coversDifference)}
                    </span>
                  </td>
                  <td className={cn(BODY_CELL_CLASS, bottomBorderClass, "whitespace-nowrap border-l border-black/5 px-2")}>
                    <ValueCell
                      value={row.dailyGrossSales}
                      missing={!row.hasDailyRecord}
                      formatter={formatMoney}
                    />
                  </td>
                  <td className={cn(BODY_CELL_CLASS, bottomBorderClass, "whitespace-nowrap px-2")}>
                    <ValueCell
                      value={row.waiterGrossSales}
                      missing={!row.hasWaiterRecords}
                      formatter={formatMoney}
                    />
                  </td>
                  <td className={cn(BODY_CELL_CLASS, bottomBorderClass, "whitespace-nowrap px-2")}>
                    <span
                      className={cn(
                        NUMERIC_VALUE_CLASS,
                        differenceClass(row.grossSalesDifference),
                      )}
                    >
                      {formatDifference(row.grossSalesDifference)}
                    </span>
                  </td>
                  <DayCommentCell
                    saleDate={row.sale_date}
                    comment={commentsByDate.get(row.sale_date)}
                    canEdit={canEdit}
                    isEditing={editingDate === row.sale_date}
                    isPending={isPending && pendingDate === row.sale_date}
                    draft={drafts[row.sale_date] ?? ""}
                    onDraftChange={(value) =>
                      setDrafts((prev) => ({ ...prev, [row.sale_date]: value }))
                    }
                    onEdit={() => beginEdit(row.sale_date)}
                    onSave={() => handleSave(row.sale_date)}
                    onDelete={() => handleDelete(row.sale_date)}
                    disableCreate={
                      !commentsByDate.get(row.sale_date) &&
                      isFutureSalesEntryDate(row.sale_date)
                    }
                    className={bottomBorderClass}
                  />
                </tr>
                );
              })
            )}
            {activeRowCount > 0 ? (
              <tr className={`${SALES_TABLE_HEADER_COLUMN_BG} font-bold`}>
                <td
                  className={cn(
                    BODY_CELL_CLASS,
                    `sticky left-0 z-10 whitespace-nowrap border-r ${SALES_TABLE_STICKY_BORDER} border-t border-black/15 px-2 text-center text-sm text-[#3D421F]`,
                  )}
                  colSpan={3}
                >
                  Month total
                </td>
                <td className={cn(BODY_CELL_CLASS, "whitespace-nowrap border-l border-t border-black/10 px-2 text-right text-xs tabular-nums")}>
                  {formatCount(summary.dailyCovers)}
                </td>
                <td className={cn(BODY_CELL_CLASS, "whitespace-nowrap border-t border-black/10 px-2 text-right text-xs tabular-nums")}>
                  {formatCount(summary.waiterCovers)}
                </td>
                <td
                  className={cn(
                    BODY_CELL_CLASS,
                    "whitespace-nowrap border-t border-black/10 px-2 text-right text-xs tabular-nums",
                    differenceClass(summary.coversDifference),
                  )}
                >
                  {formatCoversDifference(summary.coversDifference)}
                </td>
                <td className={cn(BODY_CELL_CLASS, "whitespace-nowrap border-l border-t border-black/10 px-2 text-right text-xs tabular-nums")}>
                  {formatMoney(summary.dailyGrossSales)}
                </td>
                <td className={cn(BODY_CELL_CLASS, "whitespace-nowrap border-t border-black/10 px-2 text-right text-xs tabular-nums")}>
                  {formatMoney(summary.waiterGrossSales)}
                </td>
                <td
                  className={cn(
                    BODY_CELL_CLASS,
                    "whitespace-nowrap border-t border-black/10 px-2 text-right text-xs tabular-nums",
                    differenceClass(summary.grossSalesDifference),
                  )}
                >
                  {formatDifference(summary.grossSalesDifference)}
                </td>
                <td
                  className={cn(
                    BODY_CELL_CLASS,
                    "border-l border-t border-black/10 px-2 text-xs text-black/40",
                  )}
                  style={{ minWidth: COMMENTS_COLUMN_MIN_WIDTH }}
                >
                  —
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-black/50">
        Compare venue daily sales totals with the sum of all waiter entries for each
        day. Difference = Daily − Waiters. Amber rows indicate a mismatch in covers
        or gross sales.
      </p>

      <DailyVsWaitersExportDialog
        open={exportDialogOpen}
        monthLabel={monthLabel}
        sections={exportSections}
        exporting={exportingPdf}
        onSectionsChange={setExportSections}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExportPdf}
      />
    </div>
  );
}
