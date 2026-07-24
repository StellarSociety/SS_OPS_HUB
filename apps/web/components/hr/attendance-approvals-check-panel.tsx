"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AttendancePayrollMonthPicker } from "@/components/hr/attendance-date-filters";
import type { AttendanceApprovalKind } from "@/lib/hr/attendance-approval";
import {
  mergePayrollSettings,
  payrollMonthContainingDate,
  payrollMonthInputValue,
  resolvePayrollPeriod,
} from "@/lib/hr/payroll";
import { formatIsoDateShort } from "@/lib/hr/schedules";
import { Input } from "@/components/ui/input";

export type ApprovalsCheckDay = {
  staffId: string | null;
  workDate: string;
  empNo: string;
  fullName: string;
  departmentId: string | null;
  departmentName: string | null;
  rosterLabel: string | null;
  kind: AttendanceApprovalKind;
  reason: string;
  approvalStatus: string | null;
};

type DepartmentOption = { id: string; name: string };

type Props = {
  days: ApprovalsCheckDay[];
  departments: DepartmentOption[];
  payrollMonthInput: string;
  periodStartDay: number;
  periodEndDay: number;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  /** True when toDate was extended past Pay settings period end for leavers. */
  periodExtended?: boolean;
  settingsPeriodEnd?: string;
};

function kindLabel(kind: AttendanceApprovalKind): string {
  return kind === "leave" ? "Leave" : "Worked";
}

function kindClass(kind: AttendanceApprovalKind): string {
  return kind === "leave"
    ? "bg-sky-50 text-sky-900"
    : "bg-amber-50 text-amber-950";
}

export function AttendanceApprovalsCheckPanel({
  days,
  departments,
  payrollMonthInput,
  periodStartDay,
  periodEndDay,
  periodStart,
  periodEnd,
  periodLabel,
  periodExtended = false,
  settingsPeriodEnd,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [departmentId, setDepartmentId] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | AttendanceApprovalKind>(
    "all",
  );
  const [query, setQuery] = useState("");

  const payrollSettings = useMemo(
    () =>
      mergePayrollSettings({
        periodStartDay,
        periodEndDay,
      }),
    [periodStartDay, periodEndDay],
  );

  const pickerRange = useMemo(() => {
    try {
      const period = resolvePayrollPeriod(payrollMonthInput, payrollSettings);
      return {
        startDate: period.periodStart,
        endDate: period.periodEnd,
      };
    } catch {
      return { startDate: "", endDate: "" };
    }
  }, [payrollMonthInput, payrollSettings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return days.filter((d) => {
      if (departmentId && d.departmentId !== departmentId) return false;
      if (kindFilter !== "all" && d.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        d.fullName.toLowerCase().includes(q) ||
        d.empNo.toLowerCase().includes(q) ||
        (d.departmentName ?? "").toLowerCase().includes(q) ||
        (d.rosterLabel ?? "").toLowerCase().includes(q)
      );
    });
  }, [days, departmentId, kindFilter, query]);

  const groups = useMemo(() => {
    const byEmp = new Map<
      string,
      {
        staffId: string | null;
        empNo: string;
        fullName: string;
        departmentName: string | null;
        leaveCount: number;
        workedCount: number;
        days: ApprovalsCheckDay[];
      }
    >();

    for (const day of filtered) {
      const key = day.staffId ?? day.empNo.trim().toLowerCase();
      let group = byEmp.get(key);
      if (!group) {
        group = {
          staffId: day.staffId,
          empNo: day.empNo,
          fullName: day.fullName,
          departmentName: day.departmentName,
          leaveCount: 0,
          workedCount: 0,
          days: [],
        };
        byEmp.set(key, group);
      }
      if (day.kind === "leave") group.leaveCount += 1;
      else group.workedCount += 1;
      group.days.push(day);
    }

    return [...byEmp.values()]
      .map((g) => ({
        ...g,
        days: [...g.days].sort((a, b) => a.workDate.localeCompare(b.workDate)),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [filtered]);

  const totalLeave = filtered.filter((d) => d.kind === "leave").length;
  const totalWorked = filtered.filter((d) => d.kind === "worked").length;

  function onMonthChange(value: string) {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    const params = new URLSearchParams();
    params.set("month", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white/60 p-3">
        <AttendancePayrollMonthPicker
          fieldLabel="Payroll month"
          periodStartDay={periodStartDay}
          periodEndDay={periodEndDay}
          startDate={pickerRange.startDate}
          endDate={pickerRange.endDate}
          footerHint={`Uses Pay settings period ${periodStartDay}→${periodEndDay}.`}
          onChange={({ endDate }) => {
            try {
              const month = payrollMonthContainingDate(
                endDate,
                payrollSettings,
              );
              onMonthChange(payrollMonthInputValue(month));
            } catch {
              // ignore invalid range
            }
          }}
        />
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Period from settings
          </p>
          <p className="text-sm text-[#3D421F]">
            {periodLabel}: {formatIsoDateShort(periodStart)} →{" "}
            {formatIsoDateShort(periodEnd)}
            {periodExtended && settingsPeriodEnd
              ? ` (includes leavers through ${formatIsoDateShort(periodEnd)}; pay window ends ${formatIsoDateShort(settingsPeriodEnd)})`
              : ""}
          </p>
        </div>
        <div className="text-sm text-black/55">
          {groups.length} employee{groups.length === 1 ? "" : "s"} ·{" "}
          {filtered.length} day{filtered.length === 1 ? "" : "s"} pending
          {filtered.length > 0
            ? ` (${totalLeave} leave · ${totalWorked} worked)`
            : ""}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[14rem] flex-1">
          <SearchableSelect
            value={departmentId}
            onChange={setDepartmentId}
            options={[
              { value: "", label: "All departments" },
              ...departments.map((d) => ({ value: d.id, label: d.name })),
            ]}
            placeholder="Department"
          />
        </div>
        <div className="w-40">
          <SearchableSelect
            value={kindFilter}
            onChange={(v) =>
              setKindFilter(v as "all" | AttendanceApprovalKind)
            }
            options={[
              { value: "all", label: "All types" },
              { value: "leave", label: "Leave only" },
              { value: "worked", label: "Worked only" },
            ]}
            placeholder="Type"
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <Input
            className="h-9"
            placeholder="Search employee…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 bg-white/40 px-4 py-10 text-center">
          <p className="text-sm font-medium text-[#3D421F]">
            No leavers need approval this month
          </p>
          <p className="mt-1 text-sm text-black/55">
            Only staff with a termination date in this payroll month appear
            here. Leave, ABS, and out-of-tolerance worked days for those
            leavers are clear.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((group) => (
            <li
              key={`${group.empNo}::${group.staffId ?? ""}`}
              className="overflow-hidden rounded-lg border border-black/10 bg-white/70"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
                <div>
                  <p className="font-medium text-[#3D421F]">
                    {group.fullName}
                    <span className="ml-2 text-sm font-normal text-black/45">
                      #{group.empNo}
                    </span>
                  </p>
                  <p className="text-xs text-black/50">
                    {group.departmentName ?? "No department"} ·{" "}
                    {group.leaveCount} leave · {group.workedCount} worked
                  </p>
                </div>
                {group.staffId ? (
                  <Link
                    href={`/hr/attendance/validation?staffId=${encodeURIComponent(group.staffId)}&from=${encodeURIComponent(periodStart)}&to=${encodeURIComponent(periodEnd)}`}
                    className="inline-flex h-8 items-center rounded-md border border-black/15 bg-white px-3 text-xs font-medium text-[#3D421F] transition hover:bg-black/[0.03]"
                  >
                    Open in Validation
                  </Link>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-black/45">
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Roster</th>
                      <th className="px-4 py-2 font-medium">Reason</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.days.map((day) => (
                      <tr
                        key={`${day.empNo}::${day.workDate}`}
                        className="border-b border-black/5 last:border-0"
                      >
                        <td className="whitespace-nowrap px-4 py-2 text-[#3D421F]">
                          {formatIsoDateShort(day.workDate)}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${kindClass(day.kind)}`}
                          >
                            {kindLabel(day.kind)}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-black/70">
                          {day.rosterLabel ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-black/65">{day.reason}</td>
                        <td className="px-4 py-2 capitalize text-black/55">
                          {day.approvalStatus ?? "pending"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
