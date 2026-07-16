"use client";

import { formatWeekRangeLabel, getMondayForWeekOffset } from "@/lib/hr/schedules";

type SchedulesApproveConfirmDialogProps = {
  open: boolean;
  weekOffset: number;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function SchedulesApproveConfirmDialog({
  open,
  weekOffset,
  pending,
  error,
  onClose,
  onConfirm,
}: SchedulesApproveConfirmDialogProps) {
  if (!open) return null;

  const monday = getMondayForWeekOffset(weekOffset);
  const rangeLabel = formatWeekRangeLabel(monday);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedules-approve-title"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <h2
          id="schedules-approve-title"
          className="font-serif text-xl text-[#3D421F]"
        >
          Approve schedule
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-black/65">
          Do you wish to approve the schedule and publish it?
        </p>
        <p className="mt-1 text-xs text-black/45">Week of {rangeLabel}</p>

        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="h-9 rounded-md border border-black/10 bg-white px-3.5 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
          >
            No
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="h-9 rounded-md bg-emerald-700 px-3.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Approving…" : "Yes"}
          </button>
        </div>
      </div>
    </div>
  );
}
