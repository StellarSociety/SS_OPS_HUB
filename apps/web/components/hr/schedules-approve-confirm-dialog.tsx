"use client";

import { useEffect, useState } from "react";
import { formatWeekRangeLabel, getMondayForWeekOffset } from "@/lib/hr/schedules";

type SchedulesApproveConfirmDialogProps = {
  open: boolean;
  weekOffset: number;
  departmentLabel: string;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onReject: (note: string) => void;
};

export function SchedulesApproveConfirmDialog({
  open,
  weekOffset,
  departmentLabel,
  pending,
  error,
  onClose,
  onConfirm,
  onReject,
}: SchedulesApproveConfirmDialogProps) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

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
          Review schedule
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-black/65">
          Approve the {departmentLabel} schedule so it can be published, or
          reject it. The person who requested approval is notified either way.
          If you changed the roster, those alterations are listed in the
          approval notice.
        </p>
        <p className="mt-1 text-xs text-black/45">
          {departmentLabel} · week of {rangeLabel}
        </p>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-black/55">
            Note to requester (optional)
          </span>
          <textarea
            value={note}
            disabled={pending}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Reason if you are not approving…"
            className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-[#3D421F] outline-none ring-[var(--venue-primary)]/30 placeholder:text-black/35 focus:ring-2 disabled:opacity-50"
          />
        </label>

        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="h-9 rounded-md border border-black/10 bg-white px-3.5 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onReject(note)}
            className="h-9 rounded-md border border-red-200 bg-red-50 px-3.5 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Reject"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="h-9 rounded-md bg-emerald-700 px-3.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
