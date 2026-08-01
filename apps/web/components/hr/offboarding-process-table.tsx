"use client";

import { useMemo, useState } from "react";
import { Search, UserMinus } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Input } from "@/components/ui/input";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import {
  OFFBOARDING_PROCESS_STATUS_LABELS,
  OFFBOARDING_TERMINATION_KIND_OPTIONS,
  terminationKindLabel,
  type OffboardingLeaveHandling,
  type OffboardingProcess,
  type OffboardingProcessStatus,
  type OffboardingTerminationKind,
} from "@/lib/hr/offboarding-process";
import { cn } from "@/lib/utils";

type OffboardingProcessTableProps = {
  processes: OffboardingProcess[];
  onOpenProcess?: (process: OffboardingProcess) => void;
};

const STATUS_FILTER_OPTIONS: OffboardingProcessStatus[] = [
  "draft",
  "in_progress",
  "settlement_pending",
  "completed",
  "cancelled",
];

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

export function OffboardingProcessTable({
  processes,
  onOpenProcess,
}: OffboardingProcessTableProps) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [kind, setKind] = useState<"" | OffboardingTerminationKind>("");
  const [status, setStatus] = useState<"" | OffboardingProcessStatus>("");
  const [leaveHandling, setLeaveHandling] = useState<
    "" | OffboardingLeaveHandling
  >("");

  const departments = useMemo(() => {
    const names = new Set<string>();
    for (const row of processes) {
      if (row.departmentName?.trim()) names.add(row.departmentName.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [processes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return processes.filter((row) => {
      if (department && row.departmentName !== department) return false;
      if (kind && row.terminationKind !== kind) return false;
      if (status && row.status !== status) return false;
      if (leaveHandling && row.leaveHandling !== leaveHandling) return false;
      if (!q) return true;
      return (
        row.fullName.toLowerCase().includes(q) ||
        row.empNo.toLowerCase().includes(q) ||
        (row.departmentName?.toLowerCase().includes(q) ?? false) ||
        (row.positionName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [processes, search, department, kind, status, leaveHandling]);

  const filtersActive =
    Boolean(search.trim()) ||
    Boolean(department) ||
    Boolean(kind) ||
    Boolean(status) ||
    Boolean(leaveHandling);

  if (processes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <UserMinus
            className="h-8 w-8 text-[var(--venue-primary,#818a40)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            No offboarding processes yet. Start one to track an exit.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
          <Input
            placeholder="Search name, emp no, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className={selectClass}
          aria-label="Filter by department"
        >
          <option value="">All departments</option>
          {departments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as "" | OffboardingTerminationKind)
          }
          className={selectClass}
          aria-label="Filter by termination type"
        >
          <option value="">All types</option>
          {OFFBOARDING_TERMINATION_KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={leaveHandling}
          onChange={(e) =>
            setLeaveHandling(e.target.value as "" | OffboardingLeaveHandling)
          }
          className={selectClass}
          aria-label="Filter by leave handling"
        >
          <option value="">All leave handling</option>
          <option value="pay_off">Pay off</option>
          <option value="use_on_last_days">Use leave</option>
        </select>
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as "" | OffboardingProcessStatus)
          }
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUS_FILTER_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {OFFBOARDING_PROCESS_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDepartment("");
              setKind("");
              setStatus("");
              setLeaveHandling("");
            }}
            className="h-10 rounded-md px-3 text-sm font-medium text-black/55 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="text-sm text-black/50">
        {filtered.length} process{filtered.length === 1 ? "" : "es"}
        {filtersActive ? ` of ${processes.length}` : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No processes match these filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 bg-[#f7f6f1] text-[10px] font-semibold uppercase tracking-wide text-black/45">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Notified</th>
                  <th className="px-4 py-3">Last day</th>
                  <th className="px-4 py-3 text-right">AL</th>
                  <th className="px-4 py-3 text-right">PH</th>
                  <th className="px-4 py-3">Leave handling</th>
                  <th className="px-4 py-3 text-right">Settlement</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-black/5 last:border-0",
                      onOpenProcess
                        ? "cursor-pointer hover:bg-[var(--venue-primary,#818a40)]/[0.06]"
                        : "hover:bg-black/[0.015]",
                    )}
                    onClick={() => onOpenProcess?.(row)}
                    onKeyDown={(e) => {
                      if (!onOpenProcess) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenProcess(row);
                      }
                    }}
                    tabIndex={onOpenProcess ? 0 : undefined}
                    role={onOpenProcess ? "button" : undefined}
                    aria-label={
                      onOpenProcess
                        ? `Open offboarding settings for ${row.fullName}`
                        : undefined
                    }
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/hr/${row.staffId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
                      >
                        {row.fullName}
                      </Link>
                      <p className="mt-0.5 text-xs text-black/45">
                        {row.empNo}
                        {row.departmentName ? ` · ${row.departmentName}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[#3D421F]">
                      {terminationKindLabel(row.terminationKind)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-black/70">
                      {formatDateOnly(row.notificationDate)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-black/70">
                      {formatDateOnly(row.terminationDate)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#3D421F]">
                      {formatDays(row.alBalance)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#3D421F]">
                      {formatDays(row.phBalance)}
                    </td>
                    <td className="px-4 py-3 text-xs text-black/65">
                      {row.leaveHandling === "pay_off"
                        ? "Pay off"
                        : row.leaveEntries.length === 0
                          ? "Use leave"
                          : `Use leave · ${row.leaveEntries.length} entr${row.leaveEntries.length === 1 ? "y" : "ies"}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#3D421F]">
                      {row.leaveHandling === "pay_off"
                        ? formatAed(row.settlement.estimatedTotal)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDays(n: number): string {
  return `${(Math.round(n * 10) / 10).toLocaleString("en-AE", {
    maximumFractionDigits: 1,
  })} d`;
}

function StatusPill({ status }: { status: OffboardingProcessStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        statusClass(status),
      )}
    >
      {OFFBOARDING_PROCESS_STATUS_LABELS[status]}
    </span>
  );
}

function statusClass(status: OffboardingProcessStatus): string {
  switch (status) {
    case "draft":
      return "bg-black/5 text-black/55";
    case "in_progress":
      return "bg-amber-100 text-amber-900";
    case "settlement_pending":
      return "bg-sky-100 text-sky-900";
    case "completed":
      return "bg-emerald-100 text-emerald-900";
    case "cancelled":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-black/5 text-black/55";
  }
}
