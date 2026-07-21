"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FilePenLine,
  FilePlus2,
  FileX2,
  History,
  Loader2,
  CalendarDays,
  X,
  XCircle,
} from "lucide-react";
import {
  getLeaveRangeActivity,
  type LeaveActivityItem,
  type LeaveActivityKind,
} from "@/lib/actions/leave-activity";
import { scheduleLeaveDisplayName } from "@/lib/hr/leave";

type LeaveActivityDialogProps = {
  staffName: string;
  labelCode: string;
  fromDate: string;
  toDate: string;
  requestId?: string | null;
  staffId: string;
  onClose: () => void;
};

const KIND_META: Record<
  LeaveActivityKind,
  { Icon: typeof Clock; className: string }
> = {
  submitted: { Icon: FilePlus2, className: "bg-sky-100 text-sky-700" },
  recorded: { Icon: FilePlus2, className: "bg-sky-100 text-sky-700" },
  edited: { Icon: FilePenLine, className: "bg-amber-100 text-amber-700" },
  approved: {
    Icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-700",
  },
  rejected: { Icon: XCircle, className: "bg-rose-100 text-rose-700" },
  cancelled: { Icon: FileX2, className: "bg-rose-100 text-rose-700" },
  deleted: { Icon: FileX2, className: "bg-rose-100 text-rose-700" },
  roster: { Icon: CalendarDays, className: "bg-black/5 text-black/55" },
  other: { Icon: Clock, className: "bg-black/5 text-black/45" },
};

function formatWhen(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatLeaveRange(fromDate: string, toDate: string): string {
  const fmt = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${m[1]}`;
  };
  if (fromDate === toDate) return fmt(fromDate);
  return `${fmt(fromDate)} – ${fmt(toDate)}`;
}

export function LeaveActivityDialog({
  staffName,
  labelCode,
  fromDate,
  toDate,
  requestId,
  staffId,
  onClose,
}: LeaveActivityDialogProps) {
  const [items, setItems] = useState<LeaveActivityItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getLeaveRangeActivity({
      requestId,
      staffId,
      labelCode,
      fromDate,
      toDate,
    })
      .then((result) => {
        if (!active) return;
        if (result.error) setError(result.error);
        setItems(result.items);
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setError("Could not load activity.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestId, staffId, labelCode, fromDate, toDate]);

  const title = scheduleLeaveDisplayName(labelCode);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Activity for ${title}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 text-[#818a40]" />
            <div>
              <h2 className="font-serif text-lg leading-tight text-[#3D421F]">
                Leave activity
              </h2>
              <p className="text-xs text-black/50">
                {staffName} · {title} · {formatLeaveRange(fromDate, toDate)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-black/50 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-black/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading activity…
            </div>
          ) : error ? (
            <p className="py-12 text-center text-sm text-amber-800">{error}</p>
          ) : !items || items.length === 0 ? (
            <p className="py-12 text-center text-sm text-black/50">
              No activity recorded yet for this leave. Submissions, edits, and
              approvals will appear here.
            </p>
          ) : (
            <ol className="relative space-y-0 border-l border-black/10 pl-5">
              {items.map((item) => {
                const meta = KIND_META[item.kind] ?? KIND_META.other;
                const Icon = meta.Icon;
                return (
                  <li key={item.id} className="relative pb-5 last:pb-0">
                    <span
                      className={`absolute -left-[1.6rem] flex h-7 w-7 items-center justify-center rounded-full border border-white ${meta.className}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="rounded-lg px-1 py-0.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <p className="text-sm font-medium text-[#3D421F]">
                          {item.label}
                        </p>
                        <time className="text-xs tabular-nums text-black/40">
                          {formatWhen(item.created_at)}
                        </time>
                      </div>
                      {item.detail ? (
                        <p className="mt-0.5 text-sm text-black/55">
                          {item.detail}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-black/40">
                        {item.actorName
                          ? `By ${item.actorName}`
                          : "By unknown user"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
