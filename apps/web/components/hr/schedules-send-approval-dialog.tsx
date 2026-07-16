"use client";

import { useEffect, useState } from "react";
import type { ScheduleApproverCandidate } from "@/lib/actions/hr-schedule-approval";
import { formatWeekRangeLabel, getMondayForWeekOffset } from "@/lib/hr/schedules";
import { cn } from "@/lib/utils";

type SchedulesSendApprovalDialogProps = {
  open: boolean;
  weekOffset: number;
  candidates: ScheduleApproverCandidate[];
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (approverUserIds: string[]) => void;
};

export function SchedulesSendApprovalDialog({
  open,
  weekOffset,
  candidates,
  pending,
  error,
  onClose,
  onSubmit,
}: SchedulesSendApprovalDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  if (!open) return null;

  const monday = getMondayForWeekOffset(weekOffset);
  const rangeLabel = formatWeekRangeLabel(monday);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
        aria-labelledby="schedules-send-approval-title"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <h2
          id="schedules-send-approval-title"
          className="font-serif text-xl text-[#3D421F]"
        >
          Send for approval
        </h2>
        <p className="mt-1 text-sm text-black/55">
          Week of {rangeLabel}. Choose who should revise and approve this
          schedule.
        </p>

        {candidates.length === 0 ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900/80">
            No approvers configured. Add people in HR Settings → Attendance →
            Schedule Approval.
          </p>
        ) : (
          <ul className="mt-4 max-h-64 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/10">
            {candidates.map((c) => {
              const checked = selected.has(c.id);
              return (
                <li key={c.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-black/[0.02]",
                      checked && "bg-[var(--venue-secondary)]/30",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={pending}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[#3D421F]">
                        {c.fullName}
                      </span>
                      <span className="block truncate text-xs text-black/45">
                        {c.email}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

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
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || selected.size === 0}
            onClick={() => onSubmit([...selected])}
            className="h-9 rounded-md bg-[var(--venue-primary)] px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
