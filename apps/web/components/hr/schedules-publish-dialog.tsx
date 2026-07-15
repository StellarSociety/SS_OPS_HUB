"use client";

import { cn } from "@/lib/utils";
import {
  SCHEDULE_DEPARTMENTS,
  formatWeekRangeLabel,
  getMondayForWeekOffset,
} from "@/lib/hr/schedules";
import type {
  SchedulesPublishDepartments,
  SchedulesPublishView,
} from "@/lib/hr/schedules-pdf";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type { SchedulesPublishDepartments, SchedulesPublishView };

export const DEFAULT_SCHEDULES_PUBLISH_VIEW: SchedulesPublishView = "roster";

export const DEFAULT_SCHEDULES_PUBLISH_DEPARTMENTS: SchedulesPublishDepartments =
  {
    kitchen: true,
    bar: true,
    floor: true,
  };

type SchedulesPublishDialogProps = {
  open: boolean;
  weekOffset: number;
  view: SchedulesPublishView;
  departments: SchedulesPublishDepartments;
  exporting?: boolean;
  onWeekOffsetChange: (offset: number) => void;
  onViewChange: (view: SchedulesPublishView) => void;
  onDepartmentsChange: (departments: SchedulesPublishDepartments) => void;
  onClose: () => void;
  onPublish: () => void;
};

function hasDepartmentSelection(departments: SchedulesPublishDepartments) {
  return Object.values(departments).some(Boolean);
}

export function SchedulesPublishDialog({
  open,
  weekOffset,
  view,
  departments,
  exporting = false,
  onWeekOffsetChange,
  onViewChange,
  onDepartmentsChange,
  onClose,
  onPublish,
}: SchedulesPublishDialogProps) {
  if (!open) return null;

  const monday = getMondayForWeekOffset(weekOffset);
  const rangeLabel = formatWeekRangeLabel(monday);
  const canPublish = hasDepartmentSelection(departments);

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
        aria-labelledby="schedules-publish-title"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <h2
          id="schedules-publish-title"
          className="font-serif text-xl text-[#3D421F]"
        >
          Publish schedule
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Choose the week, view, and departments to include in the PDF.
        </p>

        <div className="mt-4 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
            Week
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={exporting}
              onClick={() => onWeekOffsetChange(weekOffset - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] hover:bg-white disabled:opacity-50"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <p className="min-w-0 flex-1 text-center text-sm font-medium text-[#3D421F]">
              {rangeLabel}
            </p>
            <button
              type="button"
              disabled={exporting}
              onClick={() => onWeekOffsetChange(weekOffset + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] hover:bg-white disabled:opacity-50"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {weekOffset !== 0 ? (
            <button
              type="button"
              disabled={exporting}
              onClick={() => onWeekOffsetChange(0)}
              className="mt-1.5 w-full text-center text-[11px] font-medium text-black/50 hover:text-[#3D421F] disabled:opacity-50"
            >
              Jump to this week
            </button>
          ) : null}
        </div>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
            Select view
          </legend>
          {(
            [
              {
                key: "roster" as const,
                label: "Roster",
                description: "Flat weekly day labels for staff",
              },
              {
                key: "sections" as const,
                label: "Sections",
                description: "Staff grouped by section bands",
              },
            ] as const
          ).map((option) => {
            const checked = view === option.key;
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
                  type="radio"
                  name="schedules-publish-view"
                  checked={checked}
                  disabled={exporting}
                  onChange={() => onViewChange(option.key)}
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
        </fieldset>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
            Departments
          </legend>
          {SCHEDULE_DEPARTMENTS.map((dept) => {
            const checked = departments[dept.key];
            return (
              <label
                key={dept.key}
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
                  onChange={() =>
                    onDepartmentsChange({
                      ...departments,
                      [dept.key]: !departments[dept.key],
                    })
                  }
                  className="mt-0.5 size-4 shrink-0 accent-[var(--venue-primary)]"
                />
                <span className="text-sm font-semibold text-[#3D421F]">
                  {dept.label}
                </span>
              </label>
            );
          })}
        </fieldset>

        {!canPublish ? (
          <p className="mt-3 text-xs text-amber-700">
            Select at least one department.
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
            disabled={exporting || !canPublish}
            onClick={onPublish}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? "Publishing…" : "Publish PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
