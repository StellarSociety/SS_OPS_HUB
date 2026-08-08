"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileSpreadsheet, FileText, X } from "lucide-react";
import { formatAed } from "@/lib/hr/derived";
import {
  defaultInsuranceExpenseMonthKey,
  exportInsuranceExpenses,
  type InsuranceExpensesExportFormat,
} from "@/lib/hr/insurance-expenses-export";
import type { InsuranceExpenseMonth } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const inputClass =
  "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

type InsuranceExpensesExportDialogProps = {
  open: boolean;
  months: InsuranceExpenseMonth[];
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
  initialMonthKey?: string;
  onClose: () => void;
};

const FORMAT_OPTIONS: Array<{
  value: InsuranceExpensesExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    value: "pdf",
    label: "PDF",
    description: "Printable month summary table",
    icon: FileText,
  },
  {
    value: "excel",
    label: "Excel",
    description: "Spreadsheet (.xlsx) with employee detail sheet",
    icon: FileSpreadsheet,
  },
];

export function InsuranceExpensesExportDialog({
  open,
  months,
  venueName,
  venueLogoUrl,
  userDisplayName,
  initialMonthKey,
  onClose,
}: InsuranceExpensesExportDialogProps) {
  const availableMonths = useMemo(
    () =>
      [...months].sort((a, b) =>
        a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0,
      ),
    [months],
  );

  const [monthKey, setMonthKey] = useState(() =>
    initialMonthKey && months.some((m) => m.monthKey === initialMonthKey)
      ? initialMonthKey
      : defaultInsuranceExpenseMonthKey(months),
  );
  const [format, setFormat] =
    useState<InsuranceExpensesExportFormat>("pdf");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFormat("pdf");
    setError(null);
    setExporting(false);
    setMonthKey(
      initialMonthKey && months.some((m) => m.monthKey === initialMonthKey)
        ? initialMonthKey
        : defaultInsuranceExpenseMonthKey(months),
    );
  }, [open, initialMonthKey, months]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !exporting) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, exporting, onClose]);

  const report = useMemo(
    () => availableMonths.find((m) => m.monthKey === monthKey) ?? null,
    [availableMonths, monthKey],
  );

  async function handleExport() {
    if (!report) {
      setError("Select a month with insurance expenses.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      await exportInsuranceExpenses(format, {
        venueName,
        venueLogoUrl,
        month: report,
        exportedAt: new Date(),
        userDisplayName,
      });
      onClose();
    } catch (err) {
      console.error("[insurance-expenses-export]", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not export insurance expenses.",
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
        aria-labelledby="insurance-expenses-export-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="insurance-expenses-export-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              Export insurance expenses
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Choose month and format for the expenses summary.
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
          <label className="block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-black/50">
              Calendar month
            </span>
            <select
              className={inputClass}
              value={monthKey}
              disabled={exporting || availableMonths.length === 0}
              onChange={(event) => setMonthKey(event.target.value)}
            >
              {availableMonths.length === 0 ? (
                <option value="">No months available</option>
              ) : (
                availableMonths.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.label}
                  </option>
                ))
              )}
            </select>
          </label>

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
                      name="insurance-expenses-export-format"
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
              <dt className="text-black/55">Policies</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {report?.totalCount ?? 0}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-black/55">Net</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {formatAed(report?.totalNet ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-black/55">VAT</dt>
              <dd className="font-medium tabular-nums text-[#3D421F]">
                {formatAed(report?.totalVat ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-black/10 pt-2">
              <dt className="font-medium text-[#3D421F]">Gross</dt>
              <dd className="font-semibold tabular-nums text-[#3D421F]">
                {formatAed(report?.totalGross ?? 0)}
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
            disabled={exporting || !report}
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
