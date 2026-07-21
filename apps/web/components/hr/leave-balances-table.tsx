"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Search,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/hr/status-badge";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  carryForwardLeaveBalances,
  getStaffLeaveUsageDays,
  getStaffPhReplacementCredits,
} from "@/lib/actions/hr-leave";
import { formatDateOnly } from "@/lib/hr/derived";
import {
  compareEmploymentStatusNames,
  EMPLOYMENT_STATUS_NAMES,
} from "@/lib/hr/employment-status";
import type {
  EmployeeLeaveSummary,
  LeaveUsageDayEntry,
  LeaveUsageKind,
  PhReplacementCreditEntry,
} from "@/lib/hr/leave";
import { cn } from "@/lib/utils";

const headerFilterInputClass =
  "h-7 w-full rounded border border-black/10 bg-white pl-7 pr-2 text-xs font-normal normal-case text-[#3D421F] placeholder:text-black/40 outline-none transition focus:border-[var(--venue-primary,#818a40)]/50";

const lightInputClass =
  "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] placeholder:text-black/40 outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

type SortKey =
  | "empNo"
  | "fullName"
  | "departmentName"
  | "employmentStatus"
  | "workedMonths"
  | "alAvail"
  | "alUsed"
  | "alScheduled"
  | "alBalance"
  | "phAvail"
  | "phUsed"
  | "phBalance"
  | "sickFpUsed"
  | "sickHpUsed"
  | "sickUpUsed"
  | "absUsed"
  | "uplUsed";

type SortDir = "asc" | "desc";

const NUMERIC_SORT_KEYS = new Set<SortKey>([
  "workedMonths",
  "alAvail",
  "alUsed",
  "alScheduled",
  "alBalance",
  "phAvail",
  "phUsed",
  "phBalance",
  "sickFpUsed",
  "sickHpUsed",
  "sickUpUsed",
  "absUsed",
  "uplUsed",
]);

function defaultSelectedStatuses(summaries: EmployeeLeaveSummary[]): string[] {
  const names = new Set<string>();
  for (const row of summaries) {
    const n = row.employmentStatus?.trim();
    if (n) names.add(n);
  }
  return Array.from(names)
    .filter((n) => n.toUpperCase() !== EMPLOYMENT_STATUS_NAMES.out)
    .sort(compareEmploymentStatusNames);
}

function sortValue(
  row: EmployeeLeaveSummary,
  key: SortKey,
): string | number | null {
  switch (key) {
    case "empNo":
      return row.empNo;
    case "fullName":
      return row.fullName;
    case "departmentName":
      return row.departmentName;
    case "employmentStatus":
      return row.employmentStatus;
    case "workedMonths":
      return row.workedMonths;
    case "alAvail":
      return row.alAvail;
    case "alUsed":
      return row.alUsed;
    case "alScheduled":
      return row.alScheduled;
    case "alBalance":
      return row.alBalance;
    case "phAvail":
      return row.phAvail;
    case "phUsed":
      return row.phUsed;
    case "phBalance":
      return row.phBalance;
    case "sickFpUsed":
      return row.sickFpUsed;
    case "sickHpUsed":
      return row.sickHpUsed;
    case "sickUpUsed":
      return row.sickUpUsed;
    case "absUsed":
      return row.absUsed;
    case "uplUsed":
      return row.uplUsed;
  }
}

function SortLabel({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  className,
  align = "start",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "start" | "center";
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSort(sortKey);
      }}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-[#3D421F]",
        align === "center" && "justify-center",
        className,
      )}
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      {active ? (
        sortDir === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-black/25" />
      )}
    </button>
  );
}

type LeaveBalancesTableProps = {
  year: number;
  summaries: EmployeeLeaveSummary[];
  carryForwardMaxDays: number;
  canManage: boolean;
  onSelectStaff: (staffId: string) => void;
};

export function LeaveBalancesTable({
  year,
  summaries,
  carryForwardMaxDays,
  canManage,
  onSelectStaff,
}: LeaveBalancesTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [empSearch, setEmpSearch] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState(() =>
    defaultSelectedStatuses(summaries),
  );
  const [sortKey, setSortKey] = useState<SortKey>("empNo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showCarry, setShowCarry] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"ok" | "error">("ok");
  const [pending, startTransition] = useTransition();
  const [phCreditsPending, startPhCredits] = useTransition();
  const [phCreditsOpen, setPhCreditsOpen] = useState(false);
  const [phCreditsError, setPhCreditsError] = useState<string | null>(null);
  const [phCreditsStaff, setPhCreditsStaff] = useState<{
    staffId: string;
    fullName: string;
    empNo: string;
  } | null>(null);
  const [phCredits, setPhCredits] = useState<PhReplacementCreditEntry[]>([]);

  const [usagePending, startUsage] = useTransition();
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usageStaff, setUsageStaff] = useState<{
    staffId: string;
    fullName: string;
    empNo: string;
  } | null>(null);
  const [usageMeta, setUsageMeta] = useState<{
    kind: LeaveUsageKind;
    title: string;
    description: string;
  } | null>(null);
  const [usageDays, setUsageDays] = useState<LeaveUsageDayEntry[]>([]);

  function openPhCredits(row: EmployeeLeaveSummary) {
    setPhCreditsStaff({
      staffId: row.staffId,
      fullName: row.fullName,
      empNo: row.empNo,
    });
    setPhCredits([]);
    setPhCreditsError(null);
    setPhCreditsOpen(true);
    startPhCredits(async () => {
      const result = await getStaffPhReplacementCredits({
        staffId: row.staffId,
        leaveYear: year,
      });
      if (result.error) {
        setPhCreditsError(result.error);
        return;
      }
      setPhCredits(result.credits);
    });
  }

  function openUsage(row: EmployeeLeaveSummary, kind: LeaveUsageKind) {
    setUsageStaff({
      staffId: row.staffId,
      fullName: row.fullName,
      empNo: row.empNo,
    });
    setUsageMeta(null);
    setUsageDays([]);
    setUsageError(null);
    setUsageOpen(true);
    startUsage(async () => {
      const result = await getStaffLeaveUsageDays({
        staffId: row.staffId,
        leaveYear: year,
        kind,
      });
      if (result.error) {
        setUsageError(result.error);
        setUsageMeta({
          kind,
          title: kind,
          description: "",
        });
        return;
      }
      setUsageMeta({
        kind: result.kind,
        title: result.title,
        description: result.description,
      });
      setUsageDays(result.days);
    });
  }

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of summaries) {
      const n = row.departmentName?.trim();
      if (n) names.add(n);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [summaries]);

  const statusOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of summaries) {
      const n = row.employmentStatus?.trim();
      if (n) names.add(n);
    }
    return Array.from(names).sort(compareEmploymentStatusNames);
  }, [summaries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const empQ = empSearch.trim().toLowerCase();
    const deptFilterActive = selectedDepartments.length > 0;
    const deptSet = new Set(selectedDepartments);
    const statusFilterActive = selectedStatuses.length > 0;
    const statusSet = new Set(selectedStatuses);

    const rows = summaries.filter((row) => {
      if (deptFilterActive) {
        const dept = row.departmentName?.trim() ?? "";
        if (!deptSet.has(dept)) return false;
      }
      if (statusFilterActive) {
        const status = row.employmentStatus?.trim() ?? "";
        if (!statusSet.has(status)) return false;
      }
      if (empQ && !row.empNo.toLowerCase().includes(empQ)) return false;
      if (q && !row.fullName.toLowerCase().includes(q)) return false;
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return (
        String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * dir
      );
    });
  }, [
    summaries,
    search,
    empSearch,
    selectedDepartments,
    selectedStatuses,
    sortKey,
    sortDir,
  ]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(NUMERIC_SORT_KEYS.has(key) ? "desc" : "asc");
  }

  function runCarryForward() {
    setMessage(null);
    startTransition(async () => {
      const result = await carryForwardLeaveBalances({
        fromYear: year,
        reason,
      });
      if (result.error) {
        setMessageTone("error");
        setMessage(result.error);
        return;
      }
      setMessageTone("ok");
      setMessage(
        `Carried forward for ${result.carried} employee(s); skipped ${result.skipped}.`,
      );
      setShowCarry(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto rounded-md border border-black/8 bg-white/70 px-2.5 py-1.5 text-xs tabular-nums text-black/50">
          {filtered.length}
          {filtered.length !== summaries.length
            ? ` of ${summaries.length}`
            : ""}{" "}
          employees
        </span>

        {canManage ? (
          <Button
            type="button"
            variant={showCarry ? "default" : "secondary"}
            size="sm"
            className={cn(
              "h-10 gap-2 rounded-lg px-3 shadow-none",
              !showCarry &&
                "border border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary,#F0F3DD)]",
            )}
            onClick={() => {
              setShowCarry((v) => !v);
              setMessage(null);
            }}
            aria-expanded={showCarry}
          >
            <ArrowRightLeft className="h-4 w-4 shrink-0 opacity-80" />
            <span className="font-medium">Carry forward</span>
            <span className="inline-flex items-center gap-1 tabular-nums text-[0.8125rem] opacity-80">
              <span>{year}</span>
              <ArrowRight className="h-3 w-3" />
              <span>{year + 1}</span>
            </span>
          </Button>
        ) : null}
      </div>

      {showCarry ? (
        <div className="overflow-hidden rounded-xl border border-[var(--venue-primary,#818a40)]/25 bg-[var(--venue-secondary,#F0F3DD)]/45">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--venue-primary,#818a40)]/15 px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[#3D421F]">
                  Year-end carry-forward
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium tabular-nums text-[#3D421F] ring-1 ring-black/5">
                  {year}
                  <ArrowRight className="h-3 w-3 text-black/40" />
                  {year + 1}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#3D421F]/80">
                Moves remaining annual leave and public-holiday replacement
                into the next year as carried forward, capped at{" "}
                <span className="font-medium text-[#3D421F]">
                  {carryForwardMaxDays} day
                  {carryForwardMaxDays === 1 ? "" : "s"}
                </span>{" "}
                per type per employee (Leave Policy).
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
              onClick={() => setShowCarry(false)}
              aria-label="Close carry-forward"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 py-3">
            {carryForwardMaxDays <= 0 ? (
              <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-sm text-amber-900/85">
                Carry-forward max is 0. Increase it under HR Settings →
                Attendance → Leave before running this.
              </p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 space-y-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-black/45">
                    Reason
                  </span>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Year-end close for annual leave"
                    className={lightInputClass}
                    disabled={pending}
                  />
                </label>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 rounded-lg px-4"
                    disabled={pending || !reason.trim()}
                    onClick={runCarryForward}
                  >
                    {pending ? "Carrying…" : "Confirm"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-10 rounded-lg px-3"
                    disabled={pending}
                    onClick={() => {
                      setShowCarry(false);
                      setReason("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {message ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
            messageTone === "ok"
              ? "border-[var(--venue-primary,#818a40)]/25 bg-[var(--venue-secondary,#F0F3DD)]/50 text-[#3D421F]"
              : "border-red-200 bg-red-50 text-red-900/85",
          )}
          role="status"
        >
          {messageTone === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--venue-primary,#818a40)]" />
          ) : null}
          <p className="min-w-0 flex-1">{message}</p>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-current/50 transition hover:bg-black/5 hover:text-current"
            onClick={() => setMessage(null)}
            aria-label="Dismiss message"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-black/[0.02] text-[11px] font-medium uppercase tracking-wide text-black/45">
                <th
                  className="min-w-[6.5rem] px-3 py-2.5 align-top"
                  rowSpan={2}
                >
                  <div className="flex flex-col gap-2">
                    <SortLabel
                      label="Emp"
                      sortKey="empNo"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/35" />
                      <input
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                        placeholder="Search…"
                        className={headerFilterInputClass}
                        aria-label="Search emp no"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </th>
                <th
                  className="min-w-[12rem] px-3 py-2.5 align-top"
                  rowSpan={2}
                >
                  <div className="flex flex-col gap-2">
                    <SortLabel
                      label="Employee"
                      sortKey="fullName"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-black/35" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search…"
                        className={headerFilterInputClass}
                        aria-label="Search employee name"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </th>
                <th
                  className="min-w-[10rem] px-3 py-2.5 align-top"
                  rowSpan={2}
                >
                  <div className="flex flex-col gap-2">
                    <SortLabel
                      label="Department"
                      sortKey="departmentName"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <MultiSelect
                      options={departmentOptions}
                      selected={selectedDepartments}
                      onChange={setSelectedDepartments}
                      placeholder="All"
                      searchPlaceholder="Search department…"
                    />
                  </div>
                </th>
                <th
                  className="min-w-[8.5rem] px-3 py-2.5 align-top"
                  rowSpan={2}
                >
                  <div className="flex flex-col gap-2">
                    <SortLabel
                      label="Status"
                      sortKey="employmentStatus"
                      activeKey={sortKey}
                      sortDir={sortDir}
                      onSort={toggleSort}
                    />
                    <MultiSelect
                      options={statusOptions}
                      selected={selectedStatuses}
                      onChange={setSelectedStatuses}
                      placeholder="All"
                      searchPlaceholder="Search status…"
                    />
                  </div>
                </th>
                <th
                  className="min-w-[10.5rem] whitespace-nowrap px-3 py-2.5 align-top"
                  rowSpan={2}
                  title="Time since joining (until termination or today)"
                >
                  <SortLabel
                    label="Worked Time"
                    sortKey="workedMonths"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                </th>
                <th
                  className="border-l border-black/8 px-3 py-1.5 text-center align-top font-semibold text-[var(--venue-primary,#818a40)]"
                  colSpan={4}
                >
                  Annual leave
                </th>
                <th
                  className="border-l border-black/8 px-3 py-1.5 text-center align-top font-semibold text-black/55"
                  colSpan={3}
                  title="Public holiday replacement"
                >
                  PH-REPL
                </th>
                <th
                  className="border-l border-black/8 px-3 py-1.5 text-center align-top font-semibold text-black/55"
                  colSpan={3}
                >
                  Sick Leave
                </th>
                <th
                  className="border-l border-black/8 px-3 py-1.5 text-center align-top font-semibold text-black/55"
                  colSpan={2}
                  title="Unauthorised absence (ABS) and unpaid leave (UPL)"
                >
                  Unpaid Leave
                </th>
              </tr>
              <tr className="border-b border-black/10 bg-black/[0.015] text-[11px] font-medium uppercase tracking-wide text-black/40">
                <th
                  className="border-l border-black/8 px-3 py-2 text-center"
                  title="Working pool (accrued + carried + adjusted)"
                >
                  <SortLabel
                    label="Avail."
                    sortKey="alAvail"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th className="px-3 py-2 text-center" title="Used">
                  <SortLabel
                    label="Used"
                    sortKey="alUsed"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th className="px-3 py-2 text-center" title="Scheduled">
                  <SortLabel
                    label="Sched."
                    sortKey="alScheduled"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th
                  className="px-3 py-2 text-center"
                  title="Remaining balance"
                >
                  <SortLabel
                    label="Balance"
                    sortKey="alBalance"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th
                  className="border-l border-black/8 px-3 py-2 text-center"
                  title="Working pool (accrued + carried + adjusted)"
                >
                  <SortLabel
                    label="Avail."
                    sortKey="phAvail"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th className="px-3 py-2 text-center" title="Used">
                  <SortLabel
                    label="Used"
                    sortKey="phUsed"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th
                  className="px-3 py-2 text-center"
                  title="Remaining balance"
                >
                  <SortLabel
                    label="Balance"
                    sortKey="phBalance"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th
                  className="border-l border-black/8 px-3 py-2 text-center"
                  title="Full pay days used"
                >
                  <SortLabel
                    label="FP"
                    sortKey="sickFpUsed"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th className="px-3 py-2 text-center" title="Half pay days used">
                  <SortLabel
                    label="HP"
                    sortKey="sickHpUsed"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th className="px-3 py-2 text-center" title="Unpaid days used">
                  <SortLabel
                    label="UP"
                    sortKey="sickUpUsed"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th
                  className="border-l border-black/8 px-3 py-2 text-center"
                  title="Unauthorised absence (ABS) days on the roster this year"
                >
                  <SortLabel
                    label="ABS"
                    sortKey="absUsed"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
                <th
                  className="px-3 py-2 text-center"
                  title="Unpaid leave (UPL) days on the roster this year"
                >
                  <SortLabel
                    label="UPL"
                    sortKey="uplUsed"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                    align="center"
                    className="w-full"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={17}
                    className="px-3 py-12 text-center text-sm text-black/45"
                  >
                    {summaries.length === 0
                      ? `No leave balances for ${year} yet.`
                      : "No employees match this search."}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.staffId}
                    className={cn(
                      "cursor-pointer transition-colors",
                      row.onProbation
                        ? "bg-orange-50 hover:bg-orange-100/80"
                        : "hover:bg-[var(--venue-secondary,#F0F3DD)]/45",
                    )}
                    onClick={() => onSelectStaff(row.staffId)}
                    title={
                      row.onProbation ? "On probation (Pending)" : undefined
                    }
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-black/55">
                      <Link
                        href={`/hr/${row.staffId}`}
                        title="Open staff directory entry"
                        className="rounded text-[var(--venue-primary,#818a40)] underline-offset-2 transition hover:bg-[var(--venue-secondary,#F0F3DD)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.empNo}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                      {row.fullName}
                    </td>
                    <td className="px-3 py-2.5 text-black/55">
                      {row.departmentName ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={row.employmentStatus} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-black/70">
                      {row.workedTime ?? "—"}
                    </td>
                    <td className="border-l border-black/5 px-3 py-2.5 text-center tabular-nums text-black/70">
                      {fmt(row.alAvail)}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-black/70">
                      <UsageLink
                        value={row.alUsed}
                        title="View annual leave days used"
                        onOpen={() => openUsage(row, "al-used")}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-black/70">
                      <UsageLink
                        value={row.alScheduled}
                        title="View annual leave days scheduled"
                        onOpen={() => openUsage(row, "al-scheduled")}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums font-medium text-[#3D421F]">
                      {fmt(row.alBalance)}
                    </td>
                    <td className="border-l border-black/5 px-3 py-2.5 text-center tabular-nums text-black/70">
                      <UsageLink
                        value={row.phAvail}
                        title="View public holiday dates that earned this credit"
                        onOpen={() => openPhCredits(row)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-black/70">
                      <UsageLink
                        value={row.phUsed}
                        title="View PH-REPL days taken"
                        onOpen={() => openUsage(row, "ph-used")}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums font-medium text-[#3D421F]">
                      {fmt(row.phBalance)}
                    </td>
                    <td className="border-l border-black/5 px-3 py-2.5 text-center tabular-nums text-black/70">
                      <UsageLink
                        value={row.sickFpUsed}
                        title="View full-pay sick days"
                        onOpen={() => openUsage(row, "sick-fp")}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-black/70">
                      <UsageLink
                        value={row.sickHpUsed}
                        title="View half-pay sick days"
                        onOpen={() => openUsage(row, "sick-hp")}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-black/70">
                      <UsageLink
                        value={row.sickUpUsed}
                        title="View unpaid sick days"
                        onOpen={() => openUsage(row, "sick-up")}
                      />
                    </td>
                    <td className="border-l border-black/5 px-3 py-2.5 text-center tabular-nums text-black/70">
                      <UsageLink
                        value={row.absUsed}
                        title="View unauthorised absence (ABS) days"
                        onOpen={() => openUsage(row, "abs-used")}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-black/70">
                      <UsageLink
                        value={row.uplUsed}
                        title="View unpaid leave (UPL) days"
                        onOpen={() => openUsage(row, "upl-used")}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-black/40">
        Calendar year {year} · click a row to open the employee leave detail ·
        orange rows are still on probation · click Used / Sched. / PH / Sick /
        ABS / UPL counts for justifying dates
      </p>

      {phCreditsOpen && phCreditsStaff ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPhCreditsOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ph-credits-title"
            className="w-full max-w-md rounded-xl border border-black/10 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-black/45">
                  PH-REPL · {year}
                </p>
                <h2
                  id="ph-credits-title"
                  className="font-serif text-xl text-[#3D421F]"
                >
                  Public holiday credits
                </h2>
                <p className="mt-1 truncate text-sm text-black/55">
                  {phCreditsStaff.fullName}{" "}
                  <span className="font-mono text-xs">
                    ({phCreditsStaff.empNo})
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhCreditsOpen(false)}
                className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/[0.04] hover:text-[#3D421F]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-3 text-sm text-black/55">
              Dates this employee worked a public holiday and earned a
              replacement day.
            </p>

            {phCreditsPending ? (
              <p className="mt-4 text-sm text-black/45">Loading…</p>
            ) : phCreditsError ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900/85">
                {phCreditsError}
              </p>
            ) : phCredits.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-black/15 bg-black/[0.02] px-3 py-6 text-center text-sm text-black/45">
                No PH replacement credits earned in {year}.
              </p>
            ) : (
              <ul className="mt-4 max-h-72 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/10">
                {phCredits.map((credit) => (
                  <li
                    key={credit.date}
                    className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#3D421F]">
                        {formatDateOnly(credit.date)}
                      </p>
                      <p className="truncate text-xs text-black/50">
                        {credit.holidayName?.trim() || "Public holiday"}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-black/40">
                      {credit.labelCode}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!phCreditsPending && !phCreditsError ? (
              <p className="mt-3 text-xs tabular-nums text-black/45">
                {phCredits.length} credit{phCredits.length === 1 ? "" : "s"} ·
                pool avail. matches roster × holidays
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {usageOpen && usageStaff ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setUsageOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-usage-title"
            className="w-full max-w-md rounded-xl border border-black/10 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-black/45">
                  {usageMeta?.kind ?? "usage"} · {year}
                </p>
                <h2
                  id="leave-usage-title"
                  className="font-serif text-xl text-[#3D421F]"
                >
                  {usageMeta?.title ?? "Leave usage"}
                </h2>
                <p className="mt-1 truncate text-sm text-black/55">
                  {usageStaff.fullName}{" "}
                  <span className="font-mono text-xs">
                    ({usageStaff.empNo})
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUsageOpen(false)}
                className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/[0.04] hover:text-[#3D421F]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {usageMeta?.description ? (
              <p className="mt-3 text-sm text-black/55">
                {usageMeta.description}
              </p>
            ) : null}

            {usagePending ? (
              <p className="mt-4 text-sm text-black/45">Loading…</p>
            ) : usageError ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900/85">
                {usageError}
              </p>
            ) : usageDays.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-black/15 bg-black/[0.02] px-3 py-6 text-center text-sm text-black/45">
                No matching roster days in {year}.
              </p>
            ) : (
              <ul className="mt-4 max-h-72 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/10">
                {usageDays.map((day) => (
                  <li
                    key={`${day.date}:${day.labelCode}:${day.detail ?? ""}`}
                    className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#3D421F]">
                        {formatDateOnly(day.date)}
                      </p>
                      {day.detail ? (
                        <p className="truncate text-xs text-black/50">
                          {day.detail}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-black/40">
                      {day.labelCode}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!usagePending && !usageError ? (
              <p className="mt-3 text-xs tabular-nums text-black/45">
                {usageDays.length} day{usageDays.length === 1 ? "" : "s"} · from
                roster
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UsageLink({
  value,
  title,
  onOpen,
}: {
  value: number;
  title: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded px-1.5 py-0.5 tabular-nums underline-offset-2 transition",
        "text-[var(--venue-primary,#818a40)] hover:bg-[var(--venue-secondary,#F0F3DD)] hover:underline",
      )}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {fmt(value)}
    </button>
  );
}

function fmt(n: number): string {
  return String(Math.round(Number(n) || 0));
}
