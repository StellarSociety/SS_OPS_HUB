"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LeaveCalendarDialog } from "@/components/hr/leave-calendar-dialog";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import {
  leaveCalendarStatusLabel,
  leaveRequestSourceLabel,
  type LeaveCalendarEvent,
  type LeaveRequestListItem,
  type LeaveRequestTypeOption,
} from "@/lib/hr/leave";
import { formatDisplayDate } from "@/lib/dates/display";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "cancelled";

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

type LeaveRequestsClientProps = {
  requests: LeaveRequestListItem[];
  leaveTypes: LeaveRequestTypeOption[];
  canManage: boolean;
  error?: string | null;
};

function formatRange(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return formatDisplayDate(fromDate);
  return `${formatDisplayDate(fromDate)} – ${formatDisplayDate(toDate)}`;
}

function statusChipClass(status: LeaveRequestListItem["displayStatus"]): string {
  switch (status) {
    case "approved":
      return "bg-emerald-50 text-emerald-800";
    case "pending":
      return "bg-amber-50 text-amber-900";
    case "rejected":
      return "bg-rose-50 text-rose-800";
    case "cancelled":
      return "bg-black/[0.06] text-black/50";
    default:
      return "bg-sky-50 text-sky-900";
  }
}

function toCalendarEvent(item: LeaveRequestListItem): LeaveCalendarEvent {
  return {
    id: item.id,
    requestId: item.id,
    staffId: item.staffId,
    empNo: item.empNo,
    fullName: item.fullName,
    departmentId: null,
    departmentName: item.departmentName,
    labelCode: item.labelCode,
    leaveTypeId: item.leaveTypeId,
    fromDate: item.fromDate,
    toDate: item.toDate,
    days: item.days,
    status: item.displayStatus,
    rawStatus: item.status,
    notes: item.hrNotes || item.reason || item.employeeNotes,
    onSchedule: item.onSchedule,
    source: item.source === "schedule" ? "both" : "request",
  };
}

export function LeaveRequestsClient({
  requests,
  leaveTypes,
  canManage,
  error,
}: LeaveRequestsClientProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [selected, setSelected] = useState<LeaveRequestListItem | null>(null);

  const dialogTypes = useMemo(
    () =>
      leaveTypes.map((type) => ({
        code: type.labelCode,
        name: type.name,
        bgColor: type.bgColor,
        textColor: type.textColor,
        borderColor: type.borderColor,
      })),
    [leaveTypes],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((row) => {
      if (filter !== "all" && row.displayStatus !== filter) return false;
      if (!needle) return true;
      const hay = [
        row.fullName,
        row.empNo,
        row.leaveTypeName,
        row.labelCode,
        row.requestNumber,
        row.departmentName ?? "",
        row.reason ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [filter, query, requests]);

  const pendingCount = requests.filter((row) => row.displayStatus === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/55">
          Employee app requests land here for review. Approved leave is locked
          and cannot be edited.
          {pendingCount > 0 ? ` ${pendingCount} pending.` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, emp no, type…"
            className="h-10 w-full rounded-lg border border-black/10 bg-white pl-9 pr-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/70 p-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "h-8 rounded-md px-3 text-xs font-medium transition",
                filter === item.id
                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                  : "text-[#3D421F] hover:bg-black/[0.04]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 p-6 text-center">
          <h2 className="font-serif text-lg text-[#3D421F]">Leave requests</h2>
          <p className="mt-2 text-sm text-black/60">
            {requests.length === 0
              ? "No leave requests yet. Employees apply from the mobile Leave tab."
              : "No requests match this filter."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <div className="grid min-w-[64rem] grid-cols-[5.5rem_minmax(12rem,1.3fr)_minmax(10rem,1fr)_8rem_5rem_7.5rem_7rem_6rem] items-center gap-x-4 border-b border-black/10 bg-black/[0.02] px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-black/45">
            <span>Emp no</span>
            <span>Employee</span>
            <span>Leave</span>
            <span>Dates</span>
            <span className="text-right">Days</span>
            <span className="text-right">Status</span>
            <span className="text-right">Source</span>
            <span className="text-right">Request</span>
          </div>
          <ul className="min-w-[64rem] divide-y divide-black/5">
            {filtered.map((row) => {
              const type = leaveTypes.find((t) => t.id === row.leaveTypeId);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="grid w-full grid-cols-[5.5rem_minmax(12rem,1.3fr)_minmax(10rem,1fr)_8rem_5rem_7.5rem_7rem_6rem] items-center gap-x-4 px-4 py-3 text-left transition hover:bg-black/[0.02]"
                  >
                    <StaffDirectoryLink staffId={row.staffId} empNo={row.empNo} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#3D421F]">
                        {row.fullName}
                      </p>
                      <p className="truncate text-xs text-black/45">
                        {row.departmentName ?? "—"}
                      </p>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-flex min-w-[3rem] shrink-0 items-center justify-center rounded-md border px-2 py-1 font-mono text-[11px] font-medium"
                        style={{
                          backgroundColor: type?.bgColor,
                          color: type?.textColor,
                          borderColor: type?.borderColor,
                        }}
                      >
                        {row.labelCode}
                      </span>
                      <span className="truncate text-sm text-[#3D421F]">
                        {row.leaveTypeName}
                      </span>
                    </div>
                    <p className="whitespace-nowrap text-xs text-black/60">
                      {formatRange(row.fromDate, row.toDate)}
                    </p>
                    <p className="text-right text-sm tabular-nums text-black/55">
                      {row.days}
                    </p>
                    <div className="flex justify-end">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-medium",
                          statusChipClass(row.displayStatus),
                        )}
                      >
                        {leaveCalendarStatusLabel(row.displayStatus)}
                      </span>
                    </div>
                    <p className="text-right text-xs text-black/45">
                      {leaveRequestSourceLabel(row.source)}
                    </p>
                    <p className="text-right font-mono text-[11px] text-black/40">
                      {row.requestNumber.replace(/^LV-\d+-/, "")}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <LeaveCalendarDialog
        key={selected?.id ?? "leave-request-closed"}
        open={Boolean(selected)}
        event={selected ? toCalendarEvent(selected) : null}
        leaveTypes={dialogTypes}
        canManage={canManage}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
