"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileSpreadsheet, FileText, X } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { formatAed } from "@/lib/hr/derived";
import {
  defaultVisaExpenseMonthKey,
  exportVisaExpenses,
  sumVisaExpenseMonths,
  type VisaExpensesExportDetail,
  type VisaExpensesExportFormat,
} from "@/lib/hr/visa-expenses-export";
import type { VisaExpenseMonth } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type VisaExpensesExportDialogProps = {
  open: boolean;
  months: VisaExpenseMonth[];
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
  initialMonthKey?: string;
  onClose: () => void;
};

const FORMAT_OPTIONS: Array<{
  value: VisaExpensesExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    value: "pdf",
    label: "PDF",
    description: "Printable A4 report",
    icon: FileText,
  },
  {
    value: "excel",
    label: "Excel",
    description: "Spreadsheet (.xlsx)",
    icon: FileSpreadsheet,
  },
];

const DETAIL_OPTIONS: Array<{
  value: VisaExpensesExportDetail;
  label: string;
  description: string;
}> = [
  {
    value: "totals",
    label: "Totals only",
    description: "Category summary — Qty, Net, VAT, Gross",
  },
  {
    value: "detailed",
    label: "Detailed expenses",
    description: "Employee name on each expense reference",
  },
];

function defaultSelectedKeys(
  months: VisaExpenseMonth[],
  initialMonthKey?: string,
): string[] {
  const key =
    initialMonthKey && months.some((m) => m.monthKey === initialMonthKey)
      ? initialMonthKey
      : defaultVisaExpenseMonthKey(months);
  return key ? [key] : [];
}

export function VisaExpensesExportDialog({
  open,
  months,
  venueName,
  venueLogoUrl,
  userDisplayName,
  initialMonthKey,
  onClose,
}: VisaExpensesExportDialogProps) {
  const availableMonths = useMemo(
    () =>
      [...months].sort((a, b) =>
        a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0,
      ),
    [months],
  );

  const monthOptions = useMemo(
    () => availableMonths.map((m) => m.label),
    [availableMonths],
  );

  const labelToKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of availableMonths) map.set(m.label, m.monthKey);
    return map;
  }, [availableMonths]);

  const keyToLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of availableMonths) map.set(m.monthKey, m.label);
    return map;
  }, [availableMonths]);

  const [monthKeys, setMonthKeys] = useState<string[]>(() =>
    defaultSelectedKeys(months, initialMonthKey),
  );
  const [format, setFormat] =
    useState<VisaExpensesExportFormat>("pdf");
  const [detail, setDetail] =
    useState<VisaExpensesExportDetail>("detailed");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormat("pdf");
    setDetail("detailed");
    setError(null);
    setExporting(false);
    setMonthKeys(defaultSelectedKeys(months, initialMonthKey));
  }, [open, initialMonthKey, months]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !exporting) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, exporting, onClose]);

  const selectedMonths = useMemo(
    () => availableMonths.filter((m) => monthKeys.includes(m.monthKey)),
    [availableMonths, monthKeys],
  );

  const selectedLabels = useMemo(
    () =>
      monthKeys
        .map((key) => keyToLabel.get(key))
        .filter((label): label is string => Boolean(label)),
    [monthKeys, keyToLabel],
  );

  const summary = useMemo(
    () => sumVisaExpenseMonths(selectedMonths),
    [selectedMonths],
  );

  function handleMonthLabelsChange(labels: string[]) {
    const nextKeys = labels
      .map((label) => labelToKey.get(label))
      .filter((key): key is string => Boolean(key));
    setMonthKeys(nextKeys);
  }

  async function handleExport() {
    if (selectedMonths.length === 0) {
      setError("Select at least one month.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      await exportVisaExpenses(format, {
        venueName,
        venueLogoUrl,
        months: selectedMonths,
        exportedAt: new Date(),
        userDisplayName,
        detail,
      });
      onClose();
    } catch (err) {
      console.error("[visa-expenses-export]", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not export visa expenses.",
      );
    } finally {
      setExporting(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (!exporting && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visa-expenses-export-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="visa-expenses-export-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              Export visa expenses
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Choose months, detail level, and format.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="shrink-0 rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-black/50">
              Calendar months
            </span>
            <MultiSelect
              className="[&_button]:h-10 [&_button]:rounded-lg [&_button]:px-3 [&_button]:text-sm"
              options={monthOptions}
              selected={selectedLabels}
              onChange={handleMonthLabelsChange}
              placeholder="Select months…"
              searchPlaceholder="Search months…"
            />
            <p className="text-xs text-black/45">
              Select one or more months to include in the export.
            </p>
          </div>

          <fieldset className="space-y-2" disabled={exporting}>
            <legend className="text-xs font-medium uppercase tracking-wide text-black/50">
              Detail
            </legend>
            <div className="grid gap-2">
              {DETAIL_OPTIONS.map((option) => {
                const checked = detail === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors",
                      checked
                        ? "border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-primary,#818a40)]/8"
                        : "border-black/10 bg-white hover:bg-black/[0.02]",
                      exporting && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name="visa-expenses-export-detail"
                      value={option.value}
                      checked={checked}
                      onChange={() => setDetail(option.value)}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--venue-primary,#818a40)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#3D421F]">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-black/55">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2" disabled={exporting}>
            <legend className="text-xs font-medium uppercase tracking-wide text-black/50">
              Format
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {FORMAT_OPTIONS.map((option) => {
                const checked = format === option.value;
                const Icon = option.icon;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors",
                      checked
                        ? "border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-primary,#818a40)]/8"
                        : "border-black/10 bg-white hover:bg-black/[0.02]",
                      exporting && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="radio"
                      name="visa-expenses-export-format"
                      value={option.value}
                      checked={checked}
                      onChange={() => setFormat(option.value)}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--venue-primary,#818a40)]"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-[#3D421F]">
                        <Icon
                          className="h-4 w-4"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-black/55">
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <dl className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-black/55">Months</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {selectedMonths.length}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-black/55">Policies</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {summary.totalCount}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-black/55">Net</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {formatAed(summary.totalNet)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-black/55">VAT</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {formatAed(summary.totalVat)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-black/10 pt-2">
              <dt className="font-medium text-[#3D421F]">Gross</dt>
              <dd className="font-semibold tabular-nums text-[#3D421F]">
                {formatAed(summary.totalGross)}
              </dd>
            </div>
          </dl>

          {error ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900/80">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-black/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || selectedMonths.length === 0}
            className="rounded-lg bg-[var(--venue-primary,#818a40)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {exporting
              ? "Exporting…"
              : `Download ${format === "pdf" ? "PDF" : "Excel"}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
