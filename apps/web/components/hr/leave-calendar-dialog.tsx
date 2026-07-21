"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  approveLeaveCalendarEntry,
  rejectLeaveCalendarEntry,
  saveLeaveCalendarEntry,
} from "@/lib/actions/hr-leave";
import {
  countInclusiveDays,
  leaveCalendarStatusLabel,
  scheduleLeaveDisplayName,
  type LeaveCalendarEvent,
} from "@/lib/hr/leave";
import {
  isWorkDateAfterTermination,
  postTerminationBlockMessage,
} from "@/lib/hr/schedules";
import { cn } from "@/lib/utils";

type LeaveTypeOption = {
  code: string;
  name: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
};

type LeaveCalendarDialogProps = {
  open: boolean;
  event: LeaveCalendarEvent | null;
  leaveTypes: LeaveTypeOption[];
  canManage: boolean;
  /** When set, leave after this date cannot be saved. */
  terminationDate?: string | null;
  onClose: () => void;
};

export function LeaveCalendarDialog({
  open,
  event,
  leaveTypes,
  canManage,
  terminationDate = null,
  onClose,
}: LeaveCalendarDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [labelCode, setLabelCode] = useState(event?.labelCode ?? "AL");
  const [fromDate, setFromDate] = useState(event?.fromDate ?? "");
  const [toDate, setToDate] = useState(event?.toDate ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(
    () => (fromDate && toDate ? countInclusiveDays(fromDate, toDate) : 0),
    [fromDate, toDate],
  );

  const selectedType =
    leaveTypes.find((t) => t.code === labelCode) ?? leaveTypes[0];

  if (!open || !event) return null;

  const statusLabel = leaveCalendarStatusLabel(event.status);
  const isApproved = event.status === "approved";
  const isRejected = event.status === "rejected";

  function run(action: "save" | "approve" | "reject") {
    if (!event) return;
    setError(null);

    if (action !== "reject") {
      if (
        isWorkDateAfterTermination(fromDate, terminationDate) ||
        isWorkDateAfterTermination(toDate, terminationDate)
      ) {
        const message = postTerminationBlockMessage({
          terminationDate: terminationDate!,
          fullName: event.fullName,
          empNo: event.empNo,
          kind: "leave",
        });
        window.alert(message);
        setError(message);
        toast.error(message);
        return;
      }
    }

    startTransition(async () => {
      const payload = {
        requestId: event.requestId,
        staffId: event.staffId,
        labelCode,
        fromDate,
        toDate,
        notes: notes.trim() || null,
        previousFromDate: event.fromDate,
        previousToDate: event.toDate,
        previousLabelCode: event.labelCode,
      };

      let result: { error?: string } = {};
      if (action === "save") {
        result = await saveLeaveCalendarEntry(payload);
      } else if (action === "approve") {
        result = await approveLeaveCalendarEntry(payload);
      } else {
        result = await rejectLeaveCalendarEntry({
          requestId: event.requestId,
          staffId: event.staffId,
          fromDate: event.fromDate,
          toDate: event.toDate,
          labelCode: event.labelCode,
          notes: notes.trim() || null,
          clearSchedule: true,
        });
      }

      if (result.error) {
        window.alert(result.error);
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.saved(
        action === "approve"
          ? "Leave approved."
          : action === "reject"
            ? "Leave rejected and cleared from the schedule."
            : "Leave details saved.",
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (!pending && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leave-calendar-dialog-title"
        className="max-h-[min(90dvh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="leave-calendar-dialog-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {event.fullName}
            </h2>
            <p className="mt-0.5 text-sm text-black/55">
              Emp {event.empNo}
              {event.departmentName ? ` · ${event.departmentName}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1.5 text-black/45 transition hover:bg-black/[0.04] hover:text-[#3D421F] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-md border px-2 py-1 font-mono text-xs font-medium"
            style={
              selectedType
                ? {
                    backgroundColor: selectedType.bgColor,
                    color: selectedType.textColor,
                    borderColor: selectedType.borderColor,
                  }
                : undefined
            }
          >
            {labelCode}
          </span>
          <span
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium",
              event.status === "approved" && "bg-emerald-50 text-emerald-800",
              event.status === "pending" && "bg-amber-50 text-amber-900",
              event.status === "scheduled" && "bg-sky-50 text-sky-900",
              event.status === "rejected" && "bg-rose-50 text-rose-800",
              event.status === "cancelled" && "bg-black/5 text-black/55",
            )}
          >
            {statusLabel}
          </span>
          {event.onSchedule ? (
            <span className="rounded-md bg-black/[0.04] px-2 py-1 text-xs text-black/55">
              On schedule
            </span>
          ) : (
            <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Not on schedule
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm text-[#3D421F]">Leave type</Label>
            <select
              value={labelCode}
              disabled={!canManage || pending}
              onChange={(e) => setLabelCode(e.target.value)}
              className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20 disabled:opacity-60"
            >
              {leaveTypes.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-black/45">
              {scheduleLeaveDisplayName(labelCode)}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-[#3D421F]">From</Label>
            <DateInput
              value={fromDate}
              onChange={setFromDate}
              disabled={!canManage || pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-[#3D421F]">To</Label>
            <DateInput
              value={toDate}
              onChange={setToDate}
              disabled={!canManage || pending}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-sm text-[#3D421F]">Notes / details</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canManage || pending}
              placeholder="Optional reason or HR notes"
              className="h-10"
            />
            <p className="text-xs text-black/45">
              {days} calendar day{days === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="h-9 rounded-md border border-black/10 bg-white px-3.5 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Close
          </button>
          {canManage ? (
            <>
              {!isRejected ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run("reject")}
                  className="h-9 rounded-md border border-rose-200 bg-rose-50 px-3.5 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                >
                  Reject
                </button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending || !fromDate || !toDate}
                onClick={() => run("save")}
              >
                {pending ? "Saving…" : "Save changes"}
              </Button>
              {!isApproved ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !fromDate || !toDate}
                  onClick={() => run("approve")}
                  className="bg-emerald-700 hover:bg-emerald-800"
                >
                  <Check className="h-4 w-4" />
                  {pending ? "Approving…" : "Approve"}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
