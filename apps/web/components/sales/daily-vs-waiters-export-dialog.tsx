"use client";

import {
  DEFAULT_DAILY_VS_WAITERS_PDF_SECTIONS,
  type DailyVsWaitersPdfSections,
} from "@/lib/sales/daily-vs-waiters-pdf";
import { cn } from "@/lib/utils";

type DailyVsWaitersExportDialogProps = {
  open: boolean;
  monthLabel: string;
  sections: DailyVsWaitersPdfSections;
  exporting?: boolean;
  onSectionsChange: (sections: DailyVsWaitersPdfSections) => void;
  onClose: () => void;
  onExport: () => void;
};

const SECTION_OPTIONS: Array<{
  key: keyof DailyVsWaitersPdfSections;
  label: string;
  description: string;
}> = [
  {
    key: "covers",
    label: "Covers",
    description: "Daily, waiters, and difference columns",
  },
  {
    key: "grossSales",
    label: "Gross sales",
    description: "Daily, waiters, and difference columns",
  },
  {
    key: "comments",
    label: "Comments",
    description: "Reconciliation notes for each day",
  },
];

function hasSelectedSection(sections: DailyVsWaitersPdfSections): boolean {
  return sections.covers || sections.grossSales || sections.comments;
}

export function DailyVsWaitersExportDialog({
  open,
  monthLabel,
  sections,
  exporting = false,
  onSectionsChange,
  onClose,
  onExport,
}: DailyVsWaitersExportDialogProps) {
  if (!open) return null;

  const canExport = hasSelectedSection(sections);

  function toggleSection(key: keyof DailyVsWaitersPdfSections) {
    onSectionsChange({
      ...sections,
      [key]: !sections[key],
    });
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!exporting && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-vs-waiters-export-title"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <h2
          id="daily-vs-waiters-export-title"
          className="font-serif text-xl text-[#3D421F]"
        >
          Export PDF
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Choose which sections to include for {monthLabel}. Date columns are
          always included.
        </p>

        <div className="mt-4 space-y-2">
          {SECTION_OPTIONS.map((option) => {
            const checked = sections[option.key];

            return (
              <label
                key={option.key}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors",
                  checked
                    ? "border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/8"
                    : "border-black/10 bg-white hover:bg-black/[0.02]",
                  exporting && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={exporting}
                  onChange={() => toggleSection(option.key)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--venue-primary)]"
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

        {!canExport ? (
          <p className="mt-3 text-xs text-amber-700">
            Select at least one section to export.
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-black/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={exporting || !canExport}
            onClick={onExport}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

export {
  DEFAULT_DAILY_VS_WAITERS_PDF_SECTIONS,
  type DailyVsWaitersPdfSections,
};
