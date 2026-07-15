"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import {
  scheduleDayLabelStyle,
  type ScheduleDayLabel,
} from "@/lib/hr/schedules";

type RosterLabelsDialogProps = {
  open: boolean;
  labels: ScheduleDayLabel[];
  onClose: () => void;
};

export function RosterLabelsDialog({
  open,
  labels,
  onClose,
}: RosterLabelsDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Roster labels"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Schedules
            </p>
            <h2 className="font-serif text-xl text-[#3D421F]">Roster labels</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <ul className="max-h-[min(60vh,28rem)] space-y-1.5 overflow-y-auto px-5 py-4">
          {labels.map((label) => (
            <li key={label.code} className="flex items-start gap-2.5">
              <span
                className="mt-0.5 inline-flex min-w-[3.25rem] shrink-0 items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={scheduleDayLabelStyle(label)}
              >
                {label.abbreviation}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm text-[#3D421F]">{label.name}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
