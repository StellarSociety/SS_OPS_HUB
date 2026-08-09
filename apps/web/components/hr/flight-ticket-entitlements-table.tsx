"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plane, RefreshCw } from "lucide-react";
import { prepareFlightTicketBenefits } from "@/lib/actions/hr-flight-ticket";
import {
  dubaiPayrollMonthKey,
  flightTicketStatusLabel,
  type FlightTicketEntitlement,
} from "@/lib/hr/benefits/flight-ticket";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { StatusBadge } from "@/components/hr/status-badge";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import {
  FlightTicketPrepareDialog,
  isFlightTicketPrepareCandidate,
} from "@/components/hr/flight-ticket-prepare-dialog";
import { FlightTicketUnpaidDaysDialog } from "@/components/hr/flight-ticket-unpaid-days-dialog";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";

type FlightTicketEntitlementsTableProps = {
  rows: FlightTicketEntitlement[];
  canEdit: boolean;
  migrationRequired?: boolean;
};

const NO_MONTH_KEY = "__none__";
const COL_COUNT = 14;

function statusTone(status: FlightTicketEntitlement["status"]): string {
  switch (status) {
    case "due":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "upcoming":
      return "border-indigo-200 bg-indigo-50 text-indigo-900";
    case "prepared":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "imported":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "not_eligible":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "contract_excluded":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "no_ticket_value":
    case "missing_joining_date":
      return "border-black/10 bg-black/[0.03] text-black/55";
    default:
      return "border-black/10 bg-white text-[#3D421F]";
  }
}

function payrollMonthLabel(monthKey: string): string {
  if (monthKey === NO_MONTH_KEY || !/^\d{4}-\d{2}/.test(monthKey)) {
    return "No payroll month";
  }
  const [y, m] = monthKey.slice(0, 7).split("-").map(Number);
  if (!y || !m) return "No payroll month";
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthGroupKey(row: FlightTicketEntitlement): string {
  return row.payrollMonth?.slice(0, 10) || NO_MONTH_KEY;
}

function contractKindClass(contractKind: string | null): string | null {
  const kind = (contractKind ?? "").trim().toLowerCase();
  if (!kind || kind === "full-time") return null;
  if (kind === "freelancing") {
    return "inline-flex rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-900";
  }
  return "inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-950";
}

function EntitlementRow({
  row,
  highlight,
  onUnpaidClick,
}: {
  row: FlightTicketEntitlement;
  highlight?: boolean;
  onUnpaidClick?: (row: FlightTicketEntitlement) => void;
}) {
  const contractHighlight = contractKindClass(row.contractKind);
  const unpaidClickable =
    Boolean(row.calendarDays) &&
    row.unpaidLeaveDays > 0 &&
    typeof onUnpaidClick === "function";
  return (
    <tr
      className={cn(
        "border-b border-black/5",
        highlight && "bg-black/[0.04]",
      )}
    >
      <td className="px-3 py-2.5">
        <div className="flex min-w-0 items-stretch gap-2.5">
          <StaffPhotoThumbnail
            fullName={row.fullName}
            photoUrl={row.photoUrl}
            size="fill"
            empNo={row.empNo}
            department={row.departmentName}
            position={row.positionName}
            employeeStatus={row.employmentStatusName}
            workingStatus={row.workingStatusName}
            nationality={row.nationalityName}
            joiningDate={row.joiningDate}
          />
          <div className="min-w-0">
            <div className="truncate font-medium text-[#3D421F]">
              {row.fullName}
            </div>
            <div className="truncate text-xs text-black/45">
              {row.empNo}
              {row.departmentName ? ` · ${row.departmentName}` : ""}
            </div>
            {row.workingStatusName || row.employmentStatusName ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {row.employmentStatusName ? (
                  <StatusBadge status={row.employmentStatusName} />
                ) : null}
                {row.workingStatusName ? (
                  <WorkingStatusBadge status={row.workingStatusName} />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-black/70">
        {row.nationalityName || "—"}
      </td>
      <td className="px-3 py-2.5 text-black/70">
        {row.contractKind ? (
          contractHighlight ? (
            <span className={contractHighlight}>{row.contractKind}</span>
          ) : (
            row.contractKind
          )
        ) : (
          "—"
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-black/70">
        {row.joiningDate ? formatDateOnly(row.joiningDate) : "—"}
      </td>
      <td className="px-3 py-2.5">
        <div className="whitespace-nowrap tabular-nums text-black/70">
          {row.anniversaryDate ? formatDateOnly(row.anniversaryDate) : "—"}
        </div>
        {row.yearsCompleted > 0 ? (
          <div className="text-xs text-black/45">Year {row.yearsCompleted}</div>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-black/60">
        {row.workYearStart && row.workYearEnd
          ? `${formatDateOnly(row.workYearStart)} → ${formatDateOnly(row.workYearEnd)}`
          : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[#3D421F]">
        {row.ticketValuePerYear > 0 ? formatAed(row.ticketValuePerYear) : "—"}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-black/70">
        {!row.calendarDays ? (
          "—"
        ) : unpaidClickable ? (
          <button
            type="button"
            onClick={() => onUnpaidClick?.(row)}
            className="font-medium text-[var(--venue-primary,#818a40)] underline decoration-[var(--venue-primary,#818a40)]/40 underline-offset-2 hover:decoration-[var(--venue-primary,#818a40)]"
            title="View unpaid leave days"
          >
            {row.unpaidLeaveDays}
          </button>
        ) : (
          row.unpaidLeaveDays
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-black/70">
        {row.calendarDays ? row.creditedDays : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-black/70">
        {row.deductionAmount > 0
          ? formatAed(row.deductionAmount)
          : row.calendarDays
            ? formatAed(0)
            : "—"}
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums",
          row.status === "upcoming" ? "text-black/45" : "text-[#3D421F]",
        )}
      >
        {row.payableAmount > 0
          ? formatAed(row.payableAmount)
          : row.status === "due" ||
              row.status === "pending" ||
              row.status === "prepared" ||
              row.status === "imported" ||
              row.status === "upcoming" ||
              row.status === "contract_excluded"
            ? formatAed(0)
            : "—"}
      </td>
      <td className="px-3 py-2.5 text-center align-middle">
        <span
          className={cn(
            "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
            statusTone(row.status),
          )}
        >
          {flightTicketStatusLabel(row.status, row.contractKind)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center align-middle">
        {row.preparedForPayroll ? (
          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900">
            Prepared
          </span>
        ) : (
          <span className="text-xs text-black/35">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center align-middle">
        {row.paidOnPayrollMonth || row.status === "imported" ? (
          <div className="space-y-0.5">
            <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-900">
              Paid
            </span>
            {row.paidOnPayrollMonth ? (
              <div className="text-[11px] tabular-nums text-black/55">
                {payrollMonthLabel(row.paidOnPayrollMonth)}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-black/35">—</span>
        )}
      </td>
    </tr>
  );
}

export function FlightTicketEntitlementsTable({
  rows,
  canEdit,
  migrationRequired = false,
}: FlightTicketEntitlementsTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedEmploymentStatuses, setSelectedEmploymentStatuses] = useState<
    string[]
  >([]);
  const [selectedWorkingStatuses, setSelectedWorkingStatuses] = useState<
    string[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [unpaidDetailRow, setUnpaidDetailRow] =
    useState<FlightTicketEntitlement | null>(null);
  const [pending, startTransition] = useTransition();

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      if (row.departmentName?.trim()) names.add(row.departmentName.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const employmentStatusOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      if (row.employmentStatusName?.trim()) {
        names.add(row.employmentStatusName.trim());
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const workingStatusOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      if (row.workingStatusName?.trim()) {
        names.add(row.workingStatusName.trim());
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const deptSet =
      selectedDepartments.length > 0 ? new Set(selectedDepartments) : null;
    const empSet =
      selectedEmploymentStatuses.length > 0
        ? new Set(selectedEmploymentStatuses)
        : null;
    const workSet =
      selectedWorkingStatuses.length > 0
        ? new Set(selectedWorkingStatuses)
        : null;

    return rows.filter((row) => {
      if (deptSet && !deptSet.has(row.departmentName ?? "")) return false;
      if (empSet && !empSet.has(row.employmentStatusName ?? "")) return false;
      if (workSet && !workSet.has(row.workingStatusName ?? "")) return false;
      if (!q) return true;
      const hay = [
        row.empNo,
        row.fullName,
        row.departmentName,
        row.nationalityName,
        row.positionName,
        row.employmentStatusName,
        row.workingStatusName,
        row.contractKind,
        row.payrollMonth,
        payrollMonthLabel(monthGroupKey(row)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    rows,
    search,
    selectedDepartments,
    selectedEmploymentStatuses,
    selectedWorkingStatuses,
  ]);

  const currentPayrollMonth = useMemo(() => dubaiPayrollMonthKey(), []);

  const monthGroups = useMemo(() => {
    const map = new Map<string, FlightTicketEntitlement[]>();
    for (const row of filtered) {
      const key = monthGroupKey(row);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === NO_MONTH_KEY) return 1;
        if (b === NO_MONTH_KEY) return -1;
        return a.localeCompare(b);
      })
      .map(([monthKey, monthRows]) => ({
        monthKey,
        rows: monthRows.sort((x, y) => {
          const joinCmp = (x.joiningDate ?? "").localeCompare(
            y.joiningDate ?? "",
          );
          if (joinCmp !== 0) return joinCmp;
          return x.empNo.localeCompare(y.empNo);
        }),
        payable: monthRows.reduce((sum, r) => sum + (r.payableAmount || 0), 0),
      }));
  }, [filtered]);

  const anniversaryCount = rows.filter(
    (r) => r.status === "due" || r.status === "pending",
  ).length;
  const prepareCount = rows.filter(isFlightTicketPrepareCandidate).length;
  const payableTotal = rows
    .filter(isFlightTicketPrepareCandidate)
    .reduce((sum, r) => sum + r.payableAmount, 0);

  function handlePrepareSelected(staffIds: string[]) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await prepareFlightTicketBenefits({ staffIds });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPrepareOpen(false);
      setMessage(
        `Prepared ${result.preparedCount} flight ticket${result.preparedCount === 1 ? "" : "s"} across ${result.monthCount} payroll month${result.monthCount === 1 ? "" : "s"}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Search
            </p>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="h-10 w-56"
              disabled={pending}
            />
          </div>
          <div className="min-w-[11rem] w-44 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Department
            </p>
            <MultiSelect
              options={departmentOptions}
              selected={selectedDepartments}
              onChange={setSelectedDepartments}
              placeholder="All departments"
              searchPlaceholder="Search department…"
              className="[&_button]:h-10 [&_button]:text-sm"
            />
          </div>
          <div className="min-w-[11rem] w-44 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Employment status
            </p>
            <MultiSelect
              options={employmentStatusOptions}
              selected={selectedEmploymentStatuses}
              onChange={setSelectedEmploymentStatuses}
              placeholder="All statuses"
              searchPlaceholder="Search status…"
              className="[&_button]:h-10 [&_button]:text-sm"
            />
          </div>
          <div className="min-w-[10rem] w-40 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Working status
            </p>
            <MultiSelect
              options={workingStatusOptions}
              selected={selectedWorkingStatuses}
              onChange={setSelectedWorkingStatuses}
              placeholder="All statuses"
              searchPlaceholder="Search status…"
              className="[&_button]:h-10 [&_button]:text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-black/55">
            Due / pending:{" "}
            <span className="font-semibold text-[#3D421F]">
              {anniversaryCount}
            </span>
            {" · "}
            Ready to prepare:{" "}
            <span className="font-semibold text-[#3D421F]">{prepareCount}</span>
            {" · "}
            Payable:{" "}
            <span className="font-semibold text-[#3D421F]">
              {formatAed(payableTotal)}
            </span>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              setMessage(null);
              startTransition(() => {
                router.refresh();
              });
            }}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-4 w-4", pending && "animate-spin")}
            />
            Refresh
          </button>
          {canEdit ? (
            <button
              type="button"
              disabled={pending || migrationRequired || prepareCount === 0}
              onClick={() => {
                setError(null);
                setPrepareOpen(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--venue-primary,#818a40)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Plane className="h-4 w-4" />
              Prepare for payroll import
            </button>
          ) : null}
        </div>
      </div>

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Database migration required</p>
          <p className="mt-1 text-amber-900/80">
            Apply{" "}
            <code className="rounded bg-white/70 px-1">
              20260809001000_hr_flight_ticket_benefit.sql
            </code>{" "}
            then refresh this page.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      {monthGroups.length === 0 ? (
        <div className="rounded-xl border border-black/10 bg-white px-3 py-10 text-center text-sm text-black/45">
          No eligible employees found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-full min-w-[1280px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[12%]" />
              <col className="w-[7%]" />
              <col className="w-[5%]" />
              <col className="w-[5%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[8%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/60 text-[11px] font-semibold uppercase tracking-wide text-[#3D421F]">
                <th className="px-3 py-2.5">Employee</th>
                <th className="px-3 py-2.5">Nationality</th>
                <th className="px-3 py-2.5">Contract</th>
                <th className="px-3 py-2.5">Joining</th>
                <th className="px-3 py-2.5">Anniversary</th>
                <th className="px-3 py-2.5">Work year</th>
                <th className="px-3 py-2.5 text-right">Ticket / yr</th>
                <th className="px-3 py-2.5 text-right">Unpaid</th>
                <th className="px-3 py-2.5 text-right">Credited</th>
                <th className="px-3 py-2.5 text-right">Deduction</th>
                <th className="px-3 py-2.5 text-right">Payable</th>
                <th className="px-3 py-2.5 text-center">Status</th>
                <th className="px-3 py-2.5 text-center">Prepared</th>
                <th className="px-3 py-2.5 text-center">Paid</th>
              </tr>
            </thead>
            <tbody>
              {monthGroups.map((group) => (
                <FragmentMonth
                  key={group.monthKey}
                  monthKey={group.monthKey}
                  rows={group.rows}
                  payable={group.payable}
                  highlightCurrent={group.monthKey === currentPayrollMonth}
                  onUnpaidClick={setUnpaidDetailRow}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-black/45">
        Ticket values come from Nationalities → Fly home ticket / year. One full
        ticket equals one completed work year; unpaid leave (UPL/ABS) reduces the
        payable amount. Paid leave counts as worked. Only Full-time contracts
        are entitled (Part-time and Freelancing are excluded). Current-month
        anniversaries are Due; skipped tickets stay Pending until prepared.
        Import under Payroll → Import benefits → Flight ticket for that month.
      </p>

      <FlightTicketPrepareDialog
        open={prepareOpen}
        rows={rows}
        pending={pending}
        onClose={() => {
          if (!pending) setPrepareOpen(false);
        }}
        onConfirm={handlePrepareSelected}
      />

      <FlightTicketUnpaidDaysDialog
        open={unpaidDetailRow != null}
        row={unpaidDetailRow}
        onClose={() => setUnpaidDetailRow(null)}
      />
    </div>
  );
}

function FragmentMonth({
  monthKey,
  rows,
  payable,
  highlightCurrent,
  onUnpaidClick,
}: {
  monthKey: string;
  rows: FlightTicketEntitlement[];
  payable: number;
  highlightCurrent?: boolean;
  onUnpaidClick?: (row: FlightTicketEntitlement) => void;
}) {
  return (
    <>
      <tr
        className={cn(
          "border-b border-black/10",
          highlightCurrent
            ? "bg-black/[0.07]"
            : "bg-[var(--venue-secondary,#F0F3DD)]/35",
        )}
      >
        <td colSpan={COL_COUNT} className="px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-serif text-base text-[#3D421F]">
              {payrollMonthLabel(monthKey)}
              {highlightCurrent ? (
                <span className="ml-2 text-xs font-sans font-medium uppercase tracking-wide text-black/45">
                  Current month
                </span>
              ) : null}
            </span>
            <span className="text-xs text-black/45">
              {rows.length} employee{rows.length === 1 ? "" : "s"}
              {" · "}
              Payable{" "}
              <span className="font-medium text-[#3D421F]">
                {formatAed(payable)}
              </span>
            </span>
          </div>
        </td>
      </tr>
      {rows.map((row) => (
        <EntitlementRow
          key={row.staffId}
          row={row}
          highlight={highlightCurrent}
          onUnpaidClick={onUnpaidClick}
        />
      ))}
    </>
  );
}
