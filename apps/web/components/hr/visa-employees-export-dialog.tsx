"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { FileSpreadsheet, FileText, X } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { VisaEmployeesPdfPreview } from "@/components/hr/visa-employees-pdf-preview";
import {
  collectVisaStatusOptions,
  collectWorkingStatusOptions,
  defaultEmploymentStatusesForExport,
  exportVisaEmployees,
  filterVisaEmployeeRows,
  isSelfOwnedVisaStatusLabel,
  VISA_EMPLOYEES_OPTIONAL_COLUMNS,
  type VisaEmployeesExportFormat,
  type VisaEmployeesOptionalColumn,
} from "@/lib/hr/visa-employees-export";
import {
  compareEmploymentStatusNames,
  EMPLOYMENT_STATUS_SORT_ORDER,
  normalizeEmploymentStatusName,
} from "@/lib/hr/employment-status";
import type { VisaEmployeeRow } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

/** A4 landscape in CSS pixels at 96dpi. */
const A4_LANDSCAPE_WIDTH_PX = (297 / 25.4) * 96;
const A4_LANDSCAPE_HEIGHT_PX = (210 / 25.4) * 96;

const FORMAT_OPTIONS: Array<{
  value: VisaEmployeesExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    value: "pdf",
    label: "PDF",
    description: "A4 Landscape",
    icon: FileText,
  },
  {
    value: "excel",
    label: "Excel",
    description: "Styled workbook with header + table",
    icon: FileSpreadsheet,
  },
];

type VisaEmployeesExportDialogProps = {
  open: boolean;
  rows: VisaEmployeeRow[];
  workingStatusOptions?: string[];
  employmentStatusOptions?: string[];
  venueName: string;
  venueAddress?: string | null;
  venueLogoUrl?: string | null;
  userDisplayName: string;
  onClose: () => void;
};

function collectEmploymentStatusOptions(
  rows: VisaEmployeeRow[],
  lookupNames: string[] = [],
): string[] {
  const fromRows = new Set(
    rows
      .map((row) =>
        normalizeEmploymentStatusName(row.staff.employment_status?.name),
      )
      .filter(Boolean),
  );
  const orderedLookup = lookupNames
    .map((s) => normalizeEmploymentStatusName(s))
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .sort(compareEmploymentStatusNames);
  const base =
    orderedLookup.length > 0
      ? [
          ...EMPLOYMENT_STATUS_SORT_ORDER.filter((s) =>
            orderedLookup.includes(s),
          ),
          ...orderedLookup.filter(
            (s) => !EMPLOYMENT_STATUS_SORT_ORDER.includes(s),
          ),
        ]
      : EMPLOYMENT_STATUS_SORT_ORDER.filter((s) => fromRows.has(s));
  const extras = [...fromRows]
    .filter((s) => !base.includes(s))
    .sort(compareEmploymentStatusNames);
  return [...base, ...extras];
}

function ScaledA4LandscapePreview({
  children,
}: {
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.45);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width <= 0 || height <= 0) return;
      const next = Math.min(
        width / A4_LANDSCAPE_WIDTH_PX,
        height / A4_LANDSCAPE_HEIGHT_PX,
      );
      setScale(Math.max(0.2, next));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 w-full items-center justify-center"
    >
      <div
        className="relative shrink-0 overflow-hidden bg-white shadow-md"
        style={{
          width: A4_LANDSCAPE_WIDTH_PX * scale,
          height: A4_LANDSCAPE_HEIGHT_PX * scale,
          aspectRatio: "297 / 210",
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: A4_LANDSCAPE_WIDTH_PX,
            height: A4_LANDSCAPE_HEIGHT_PX,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function VisaEmployeesExportDialog({
  open,
  rows,
  workingStatusOptions = [],
  employmentStatusOptions = [],
  venueName,
  venueAddress,
  venueLogoUrl,
  userDisplayName,
  onClose,
}: VisaEmployeesExportDialogProps) {
  const [format, setFormat] = useState<VisaEmployeesExportFormat>("pdf");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workingStatuses, setWorkingStatuses] = useState<string[]>([]);
  const [employmentStatuses, setEmploymentStatuses] = useState<string[]>([]);
  const [visaStatuses, setVisaStatuses] = useState<string[]>([]);
  const [optionalColumns, setOptionalColumns] = useState<
    VisaEmployeesOptionalColumn[]
  >([]);

  const workingOptions = useMemo(
    () => collectWorkingStatusOptions(rows, workingStatusOptions),
    [rows, workingStatusOptions],
  );
  const employmentOptions = useMemo(
    () => collectEmploymentStatusOptions(rows, employmentStatusOptions),
    [rows, employmentStatusOptions],
  );
  const visaOptions = useMemo(() => collectVisaStatusOptions(rows), [rows]);

  const filters = useMemo(
    () => ({
      workingStatuses,
      employmentStatuses,
      visaStatuses,
    }),
    [workingStatuses, employmentStatuses, visaStatuses],
  );

  const filteredRows = useMemo(
    () => filterVisaEmployeeRows(rows, filters),
    [rows, filters],
  );

  useEffect(() => {
    if (!open) return;
    setFormat("pdf");
    setError(null);
    setExporting(false);
    setWorkingStatuses([]);
    setOptionalColumns([]);
    const employmentOpts = collectEmploymentStatusOptions(
      rows,
      employmentStatusOptions,
    );
    setEmploymentStatuses(defaultEmploymentStatusesForExport(employmentOpts));
    // Default: all visa statuses except self-owned.
    setVisaStatuses(
      collectVisaStatusOptions(rows).filter(
        (status) => !isSelfOwnedVisaStatusLabel(status),
      ),
    );
  }, [open, rows, employmentStatusOptions]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !exporting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, exporting, onClose]);

  if (!open || typeof document === "undefined") return null;

  function toggleOptionalColumn(id: VisaEmployeesOptionalColumn) {
    setOptionalColumns((prev) =>
      prev.includes(id) ? prev.filter((col) => col !== id) : [...prev, id],
    );
  }

  const allOptionalSelected =
    optionalColumns.length === VISA_EMPLOYEES_OPTIONAL_COLUMNS.length;

  function toggleAllOptionalColumns() {
    setOptionalColumns(
      allOptionalSelected
        ? []
        : VISA_EMPLOYEES_OPTIONAL_COLUMNS.map((column) => column.id),
    );
  }

  async function handleExport() {
    if (filteredRows.length === 0) {
      setError("No employees match the selected filters.");
      return;
    }
    setExporting(true);
    setError(null);
    try {
      await exportVisaEmployees(format, {
        venueName,
        venueAddress,
        venueLogoUrl,
        rows: filteredRows,
        exportedAt: new Date(),
        userDisplayName,
        filters,
        optionalColumns,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const hasActiveFilters =
    workingStatuses.length > 0 ||
    employmentStatuses.length > 0 ||
    visaStatuses.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3 md:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !exporting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visa-employees-export-title"
        className="flex h-[min(920px,96dvh)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="visa-employees-export-title"
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              Export employees
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasActiveFilters ? "Filtered selection" : "Current view"} ·{" "}
              {filteredRows.length} employee
              {filteredRows.length === 1 ? "" : "s"}
              {hasActiveFilters ? ` of ${rows.length}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
            disabled={exporting}
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
          <div className="space-y-4 overflow-y-auto border-b border-black/10 px-5 py-4 lg:border-b-0 lg:border-r">
            <div className="grid gap-2">
              {FORMAT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = format === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormat(option.value)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition",
                      active
                        ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-secondary,#F0F3DD)]/60"
                        : "border-black/10 hover:bg-black/[0.02]",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 text-[#3D421F]" />
                    <span>
                      <span className="block text-sm font-medium text-[#3D421F]">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-black/50">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                Filter employees
              </p>
              <div className="grid gap-2">
                <MultiSelect
                  className="[&_button]:h-10 [&_button]:rounded-md [&_button]:px-3 [&_button]:text-sm"
                  options={workingOptions}
                  selected={workingStatuses}
                  onChange={setWorkingStatuses}
                  placeholder="All working statuses"
                  searchPlaceholder="Search working status…"
                />
                <MultiSelect
                  className="[&_button]:h-10 [&_button]:rounded-md [&_button]:px-3 [&_button]:text-sm"
                  options={employmentOptions}
                  selected={employmentStatuses}
                  onChange={setEmploymentStatuses}
                  placeholder="All employment statuses"
                  searchPlaceholder="Search employment status…"
                />
                <MultiSelect
                  className="[&_button]:h-10 [&_button]:rounded-md [&_button]:px-3 [&_button]:text-sm"
                  options={visaOptions}
                  selected={visaStatuses}
                  onChange={setVisaStatuses}
                  placeholder="All visa statuses"
                  searchPlaceholder="Search visa status…"
                />
              </div>
              <p className="text-xs text-black/45">
                ON Board / OFF Boarding / OUT and non-self-owned visas are
                selected by default. Clear a filter to include all values.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                  Additional columns
                </p>
                <button
                  type="button"
                  onClick={toggleAllOptionalColumns}
                  className="text-xs font-medium text-[#3D421F]/80 transition hover:text-[#3D421F]"
                >
                  {allOptionalSelected ? "Unselect all" : "Select all"}
                </button>
              </div>
              <div className="grid gap-1.5 rounded-xl border border-black/10 p-2.5">
                {VISA_EMPLOYEES_OPTIONAL_COLUMNS.map((column) => {
                  const checked = optionalColumns.includes(column.id);
                  return (
                    <label
                      key={column.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-[#3D421F] hover:bg-black/[0.03]"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-black/25 accent-[var(--venue-primary,#818a40)]"
                        checked={checked}
                        onChange={() => toggleOptionalColumn(column.id)}
                      />
                      <span>{column.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-black/45">
                Tick columns to include them in the PDF / Excel export.
              </p>
            </div>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 overflow-hidden bg-[#e8e6df] p-4">
            {format === "pdf" ? (
              <ScaledA4LandscapePreview>
                <VisaEmployeesPdfPreview
                  venueName={venueName}
                  venueAddress={venueAddress}
                  venueLogoUrl={venueLogoUrl}
                  rows={filteredRows}
                  filters={filters}
                  optionalColumns={optionalColumns}
                  userDisplayName={userDisplayName}
                />
              </ScaledA4LandscapePreview>
            ) : (
              <div className="flex h-full min-h-[280px] items-center justify-center rounded-xl border border-dashed border-black/15 bg-white/70 px-6 text-center text-sm text-black/50">
                Excel exports a styled workbook with a detail header and
                formatted employee table. Switch to PDF to preview the A4
                landscape page.
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-black/10 px-5 py-3">
          <button
            type="button"
            disabled={exporting}
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={exporting || filteredRows.length === 0}
            onClick={() => {
              void handleExport();
            }}
            className="inline-flex h-9 items-center rounded-md bg-[var(--venue-primary,#818a40)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
