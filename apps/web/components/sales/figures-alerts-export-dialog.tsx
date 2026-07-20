"use client";

import {
  DEFAULT_FIGURES_ALERTS_PDF_SECTIONS,
  type FiguresAlertsPdfSections,
} from "@/lib/sales/figures-alerts-pdf";
import { cn } from "@/lib/utils";

type FiguresAlertsExportDialogProps = {
  open: boolean;
  periodLabel: string;
  sections: FiguresAlertsPdfSections;
  exporting?: boolean;
  onSectionsChange: (sections: FiguresAlertsPdfSections) => void;
  onClose: () => void;
  onExport: () => void;
};

const SECTION_OPTIONS: Array<{
  key: keyof FiguresAlertsPdfSections;
  label: string;
  description: string;
}> = [
  {
    key: "alertDays",
    label: "Days with alerts",
    description: "Days that have at least one mismatch",
  },
  {
    key: "balancedDays",
    label: "Balanced days",
    description: "Days where all checks match",
  },
  {
    key: "includeMatchingChecks",
    label: "Matching checks detail",
    description: "Include passed checks and comparison tables on each day",
  },
];

function hasDaySelection(sections: FiguresAlertsPdfSections): boolean {
  return sections.alertDays || sections.balancedDays;
}

export function FiguresAlertsExportDialog({
  open,
  periodLabel,
  sections,
  exporting = false,
  onSectionsChange,
  onClose,
  onExport,
}: FiguresAlertsExportDialogProps) {
  if (!open) return null;

  const canExport = hasDaySelection(sections);

  function toggleSection(key: keyof FiguresAlertsPdfSections) {
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
        aria-labelledby="figures-alerts-export-title"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <h2
          id="figures-alerts-export-title"
          className="font-serif text-xl text-[#3D421F]"
        >
          Export PDF
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Export the current period ({periodLabel}). Each day is printed on its
          own A4 page with comparisons and differences.
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
            Select at least one day type to export.
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
  DEFAULT_FIGURES_ALERTS_PDF_SECTIONS,
  type FiguresAlertsPdfSections,
};
