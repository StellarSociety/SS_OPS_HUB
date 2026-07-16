"use client";

import {
  AttendanceDayRangePicker,
  AttendanceMultiMonthPicker,
  AttendanceMultiWeekPicker,
  mondayKeyForWorkDate,
  monthKeyForWorkDate,
  monthKeyFromDate,
} from "@/components/hr/attendance-date-filters";
import type { HrAttendanceDay } from "@/lib/types/database";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

type StaffLookup = {
  emp_no: string;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
};

type Props = {
  days: HrAttendanceDay[];
  staffByEmp: Record<string, StaffLookup>;
  /** Default selected month key (YYYY-MM), typically current month. */
  defaultMonthKey?: string;
};

type StaffInsightRow = {
  empNo: string;
  fullName: string;
  departmentId: string | null;
  departmentName: string;
  dayCount: number;
  completeDayCount: number;
  totalHours: number;
  punchCompletePct: number;
};

type DepartmentGroup = {
  departmentId: string | null;
  departmentName: string;
  rows: StaffInsightRow[];
  totalHours: number;
};

function formatHours(hours: number): string {
  return hours.toFixed(2);
}

function formatPct(pct: number): string {
  return `${Math.round(pct)}%`;
}

function punchPctClass(pct: number): string {
  if (pct >= 95) return "text-emerald-800";
  if (pct >= 80) return "text-amber-900";
  return "text-rose-800";
}

export function AttendanceInsightsPanel({
  days,
  staffByEmp,
  defaultMonthKey,
}: Props) {
  const [dayStart, setDayStart] = useState("");
  const [dayEnd, setDayEnd] = useState("");
  const [selectedWeekKeys, setSelectedWeekKeys] = useState<string[]>([]);
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<string[]>(() =>
    defaultMonthKey ? [defaultMonthKey] : [monthKeyFromDate(new Date())],
  );

  const weekKeySet = useMemo(
    () => new Set(selectedWeekKeys),
    [selectedWeekKeys],
  );
  const monthKeySet = useMemo(
    () => new Set(selectedMonthKeys),
    [selectedMonthKeys],
  );

  const hasWeekFilter = selectedWeekKeys.length > 0;
  const hasMonthFilter = selectedMonthKeys.length > 0;
  const hasDayRange = Boolean(dayStart && dayEnd);
  const rangeStart =
    dayStart && dayEnd
      ? dayStart <= dayEnd
        ? dayStart
        : dayEnd
      : "";
  const rangeEnd =
    dayStart && dayEnd
      ? dayStart <= dayEnd
        ? dayEnd
        : dayStart
      : "";

  const filteredDays = useMemo(() => {
    const anyPeriod = hasWeekFilter || hasDayRange || hasMonthFilter;
    if (!anyPeriod) return days;

    return days.filter((day) => {
      const mondayKey = mondayKeyForWorkDate(day.work_date);
      const monthKey = monthKeyForWorkDate(day.work_date);
      const inWeek = Boolean(mondayKey && weekKeySet.has(mondayKey));
      const inMonth = Boolean(monthKey && monthKeySet.has(monthKey));
      const inDays =
        hasDayRange &&
        day.work_date >= rangeStart &&
        day.work_date <= rangeEnd;

      const matchesWeek = hasWeekFilter && inWeek;
      const matchesDays = hasDayRange && inDays;
      const matchesMonth = hasMonthFilter && inMonth;
      return matchesWeek || matchesDays || matchesMonth;
    });
  }, [
    days,
    hasWeekFilter,
    hasDayRange,
    hasMonthFilter,
    weekKeySet,
    monthKeySet,
    rangeStart,
    rangeEnd,
  ]);

  const groups = useMemo(() => {
    const byEmp = new Map<
      string,
      {
        empNo: string;
        dayCount: number;
        completeDayCount: number;
        totalHours: number;
      }
    >();

    for (const day of filteredDays) {
      const key = day.emp_no.trim().toLowerCase();
      const existing = byEmp.get(key) ?? {
        empNo: day.emp_no,
        dayCount: 0,
        completeDayCount: 0,
        totalHours: 0,
      };
      existing.dayCount += 1;
      if (day.status === "complete") existing.completeDayCount += 1;
      if (day.total_hours != null) {
        existing.totalHours += Number(day.total_hours);
      }
      byEmp.set(key, existing);
    }

    const rows: StaffInsightRow[] = [...byEmp.values()].map((agg) => {
      const staff = staffByEmp[agg.empNo.trim().toLowerCase()];
      return {
        empNo: agg.empNo,
        fullName: staff?.full_name ?? agg.empNo,
        departmentId: staff?.department_id ?? null,
        departmentName: staff?.department_name?.trim() || "Unassigned",
        dayCount: agg.dayCount,
        completeDayCount: agg.completeDayCount,
        totalHours: agg.totalHours,
        punchCompletePct:
          agg.dayCount === 0
            ? 0
            : (agg.completeDayCount / agg.dayCount) * 100,
      };
    });

    const byDept = new Map<string, DepartmentGroup>();
    for (const row of rows) {
      const deptKey = row.departmentId ?? `__name:${row.departmentName}`;
      const group = byDept.get(deptKey) ?? {
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        rows: [],
        totalHours: 0,
      };
      group.rows.push(row);
      group.totalHours += row.totalHours;
      byDept.set(deptKey, group);
    }

    return [...byDept.values()]
      .map((group) => ({
        ...group,
        rows: group.rows.sort((a, b) => a.fullName.localeCompare(b.fullName)),
      }))
      .sort((a, b) => {
        if (a.departmentName === "Unassigned") return 1;
        if (b.departmentName === "Unassigned") return -1;
        return a.departmentName.localeCompare(b.departmentName);
      });
  }, [filteredDays, staffByEmp]);

  const staffCount = groups.reduce((sum, g) => sum + g.rows.length, 0);
  const totalHours = groups.reduce((sum, g) => sum + g.totalHours, 0);

  const hasActiveFilters = Boolean(
    dayStart || dayEnd || selectedWeekKeys.length || selectedMonthKeys.length,
  );

  function clearFilters() {
    setDayStart("");
    setDayEnd("");
    setSelectedWeekKeys([]);
    setSelectedMonthKeys([]);
  }

  if (!days.length) {
    return (
      <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-10 text-center">
        <p className="text-sm text-black/55">
          No attendance records yet. Import an InOutData file under Settings →
          Data Management → Attendance to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <AttendanceDayRangePicker
          startDate={dayStart}
          endDate={dayEnd}
          onChange={({ startDate, endDate }) => {
            setDayStart(startDate);
            setDayEnd(endDate);
          }}
        />
        <AttendanceMultiWeekPicker
          selectedWeekKeys={selectedWeekKeys}
          onChange={setSelectedWeekKeys}
        />
        <AttendanceMultiMonthPicker
          selectedMonthKeys={selectedMonthKeys}
          onChange={setSelectedMonthKeys}
        />
        <button
          type="button"
          onClick={clearFilters}
          disabled={!hasActiveFilters}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-sm text-black/60 hover:bg-black/[0.02] disabled:pointer-events-none disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
          Clear filters
        </button>
      </div>

      <p className="text-sm text-black/50">
        {staffCount} staff · {filteredDays.length} day
        {filteredDays.length === 1 ? "" : "s"} · {formatHours(totalHours)} hours
        total
        {!hasWeekFilter && !hasDayRange && !hasMonthFilter
          ? " · showing all loaded records"
          : ""}
      </p>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-10 text-center">
          <p className="text-sm text-black/55">
            No staff match the selected period.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white/70">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-black/10 bg-black/[0.03] text-xs uppercase tracking-wide text-black/45">
              <tr>
                <th className="px-3 py-2.5 font-medium">Staff</th>
                <th className="px-3 py-2.5 font-medium">Emp no</th>
                <th className="px-3 py-2.5 font-medium text-right">Days</th>
                <th className="px-3 py-2.5 font-medium text-right">
                  Hours worked
                </th>
                <th className="px-3 py-2.5 font-medium text-right">
                  Punch complete
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <DepartmentTableSection key={group.departmentId ?? group.departmentName} group={group} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DepartmentTableSection({ group }: { group: DepartmentGroup }) {
  return (
    <>
      <tr className="border-b border-black/10 bg-[var(--venue-secondary)]/25">
        <td
          colSpan={5}
          className="px-3 py-2 font-nav text-xs font-semibold uppercase tracking-[0.08em] text-[#3D421F]"
        >
          <span className="inline-flex items-baseline gap-2">
            {group.departmentName}
            <span className="font-sans text-[11px] font-normal normal-case tracking-normal text-black/45">
              {group.rows.length} staff · {formatHours(group.totalHours)} hrs
            </span>
          </span>
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr
          key={row.empNo}
          className="border-b border-black/5 last:border-0 hover:bg-black/[0.02]"
        >
          <td className="px-3 py-2 text-[#3D421F]">{row.fullName}</td>
          <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-black/60">
            {row.empNo}
          </td>
          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-black/70">
            {row.dayCount}
          </td>
          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#3D421F]">
            {formatHours(row.totalHours)}
          </td>
          <td
            className={`whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium ${punchPctClass(row.punchCompletePct)}`}
            title={`${row.completeDayCount} of ${row.dayCount} days with both in & out`}
          >
            {formatPct(row.punchCompletePct)}
          </td>
        </tr>
      ))}
    </>
  );
}
