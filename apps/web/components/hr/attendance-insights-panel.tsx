"use client";

import {
  AttendanceDayRangePicker,
  AttendanceMultiWeekPicker,
  AttendancePayrollMonthPicker,
  mondayKeyForWorkDate,
} from "@/components/hr/attendance-date-filters";
import { AttendanceInsightsPunchCharts } from "@/components/hr/attendance-insights-punch-charts";
import { StatusBadge } from "@/components/hr/status-badge";
import { usePersistedHrAttendanceInsightsFilters } from "@/components/hr/use-persisted-hr-filters";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import type { HrAttendanceDay } from "@/lib/types/database";
import {
  isOffBoardingForWeek,
  resolveWorkingStatus,
  WORKING_STATUS,
} from "@/lib/hr/working-status";
import { X } from "lucide-react";
import { useMemo } from "react";

type StaffLookup = {
  id: string;
  emp_no: string;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
  employment_status: string | null;
  working_status: string | null;
  termination_date: string | null;
};

type ScheduleLabelDay = {
  workDate: string;
  labelCode: string;
};

type Props = {
  days: HrAttendanceDay[];
  staffByEmp: Record<string, StaffLookup>;
  /** Roster labels for working-status inference (same window as loaded days). */
  scheduleDaysByStaffId: Record<string, ScheduleLabelDay[]>;
  loadedFromDate: string;
  loadedToDate: string;
  /** Venue payroll period start day (1–28). */
  payrollPeriodStartDay: number;
  /** Venue payroll period end day (1–28). */
  payrollPeriodEndDay: number;
};

type StaffInsightRow = {
  staffId: string;
  empNo: string;
  fullName: string;
  departmentId: string | null;
  departmentName: string;
  employmentStatus: string | null;
  workingStatus: string | null;
  dayCount: number;
  completeDayCount: number;
  totalHours: number;
  /** Null when there were no SHIFT days (e.g. leave / OFF only). */
  punchCompletePct: number | null;
};

type DepartmentGroup = {
  departmentId: string | null;
  departmentName: string;
  rows: StaffInsightRow[];
  totalHours: number;
  dayCount: number;
  completeDayCount: number;
  punchCompletePct: number;
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

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y!, m! - 1, d! + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function labelCodesForPeriod(
  days: ScheduleLabelDay[] | undefined,
  fromDate: string,
  toDate: string,
): string[] {
  if (!days?.length) return [];
  const codes: string[] = [];
  for (const day of days) {
    if (day.workDate < fromDate || day.workDate > toDate) continue;
    if (day.labelCode) codes.push(day.labelCode);
  }
  return codes;
}

/** Roster days that require punches — leave / OFF / ABS / PH do not count. */
function isPunchShiftLabel(labelCode: string | null | undefined): boolean {
  return (labelCode ?? "").trim().toUpperCase() === "SHIFT";
}

function workDateInInsightsFilter(
  workDate: string,
  opts: {
    hasWeekFilter: boolean;
    hasDayRange: boolean;
    weekKeySet: Set<string>;
    rangeStart: string;
    rangeEnd: string;
  },
): boolean {
  if (!opts.hasWeekFilter && !opts.hasDayRange) return true;
  const mondayKey = mondayKeyForWorkDate(workDate);
  const inWeek = Boolean(mondayKey && opts.weekKeySet.has(mondayKey));
  const inDays =
    opts.hasDayRange &&
    workDate >= opts.rangeStart &&
    workDate <= opts.rangeEnd;
  return (opts.hasWeekFilter && inWeek) || (opts.hasDayRange && inDays);
}

export function AttendanceInsightsPanel({
  days,
  staffByEmp,
  scheduleDaysByStaffId,
  loadedFromDate,
  loadedToDate,
  payrollPeriodStartDay,
  payrollPeriodEndDay,
}: Props) {
  const {
    dayStart,
    dayEnd,
    selectedWeekKeys,
    setSelectedWeekKeys,
    setDayRange,
  } = usePersistedHrAttendanceInsightsFilters();

  const weekKeySet = useMemo(
    () => new Set(selectedWeekKeys),
    [selectedWeekKeys],
  );

  const hasWeekFilter = selectedWeekKeys.length > 0;
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

  const statusPeriod = useMemo(() => {
    if (hasDayRange) {
      return { fromDate: rangeStart, toDate: rangeEnd };
    }
    if (hasWeekFilter) {
      const sorted = [...selectedWeekKeys].sort();
      const first = sorted[0]!;
      const last = sorted[sorted.length - 1]!;
      return { fromDate: first, toDate: addDaysIso(last, 6) };
    }
    return { fromDate: loadedFromDate, toDate: loadedToDate };
  }, [
    hasDayRange,
    hasWeekFilter,
    rangeStart,
    rangeEnd,
    selectedWeekKeys,
    loadedFromDate,
    loadedToDate,
  ]);

  const filteredDays = useMemo(() => {
    return days.filter((day) => {
      if (hasWeekFilter || hasDayRange) {
        const mondayKey = mondayKeyForWorkDate(day.work_date);
        const inWeek = Boolean(mondayKey && weekKeySet.has(mondayKey));
        const inDays =
          hasDayRange &&
          day.work_date >= rangeStart &&
          day.work_date <= rangeEnd;
        const matchesWeek = hasWeekFilter && inWeek;
        const matchesDays = hasDayRange && inDays;
        if (!matchesWeek && !matchesDays) return false;
      }

      return true;
    });
  }, [
    days,
    hasWeekFilter,
    hasDayRange,
    weekKeySet,
    rangeStart,
    rangeEnd,
  ]);

  const groups = useMemo(() => {
    const filterOpts = {
      hasWeekFilter,
      hasDayRange,
      weekKeySet,
      rangeStart,
      rangeEnd,
    };

    /** Attendance keyed by staffId|workDate (preferred) and empNo|workDate. */
    const attendanceByStaffDate = new Map<string, HrAttendanceDay>();
    const attendanceByEmpDate = new Map<string, HrAttendanceDay>();
    const attendanceDaysByEmp = new Map<string, HrAttendanceDay[]>();
    const hoursByEmp = new Map<string, { empNo: string; totalHours: number }>();
    const empKeysWithAttendance = new Set<string>();

    for (const day of filteredDays) {
      const empKey = day.emp_no.trim().toLowerCase();
      empKeysWithAttendance.add(empKey);
      attendanceByEmpDate.set(`${empKey}|${day.work_date}`, day);
      if (day.staff_id) {
        attendanceByStaffDate.set(`${day.staff_id}|${day.work_date}`, day);
      }
      const list = attendanceDaysByEmp.get(empKey) ?? [];
      list.push(day);
      attendanceDaysByEmp.set(empKey, list);
      const hoursAgg = hoursByEmp.get(empKey) ?? {
        empNo: day.emp_no,
        totalHours: 0,
      };
      if (day.total_hours != null) {
        hoursAgg.totalHours += Number(day.total_hours);
      }
      hoursByEmp.set(empKey, hoursAgg);
    }

    const empKeys = new Set<string>(empKeysWithAttendance);
    for (const [empKey, staff] of Object.entries(staffByEmp)) {
      const schedule = scheduleDaysByStaffId[staff.id];
      if (!schedule?.length) continue;
      const hasShift = schedule.some(
        (d) =>
          workDateInInsightsFilter(d.workDate, filterOpts) &&
          isPunchShiftLabel(d.labelCode),
      );
      if (hasShift) empKeys.add(empKey);
    }

    const rows: StaffInsightRow[] = [];
    for (const empKey of empKeys) {
      const staff = staffByEmp[empKey];
      const departmentName = staff?.department_name?.trim();
      if (!staff || !departmentName) continue;

      let dayCount = 0;
      let completeDayCount = 0;
      const schedule = scheduleDaysByStaffId[staff.id] ?? [];
      const scheduleInPeriod = schedule.filter((d) =>
        workDateInInsightsFilter(d.workDate, filterOpts),
      );

      if (scheduleInPeriod.some((d) => d.labelCode?.trim())) {
        for (const sched of scheduleInPeriod) {
          if (!isPunchShiftLabel(sched.labelCode)) continue;
          dayCount += 1;
          const att =
            attendanceByStaffDate.get(`${staff.id}|${sched.workDate}`) ??
            attendanceByEmpDate.get(`${empKey}|${sched.workDate}`);
          if (att?.status === "complete") completeDayCount += 1;
        }
      } else {
        // No roster in range — fall back to attendance rows only.
        for (const day of attendanceDaysByEmp.get(empKey) ?? []) {
          dayCount += 1;
          if (day.status === "complete") completeDayCount += 1;
        }
      }

      // No roster SHIFT days and no attendance → skip.
      if (dayCount === 0 && !empKeysWithAttendance.has(empKey)) continue;

      const weekLabelCodes = labelCodesForPeriod(
        schedule,
        statusPeriod.fromDate,
        statusPeriod.toDate,
      );
      rows.push({
        staffId: staff.id,
        empNo: staff.emp_no,
        fullName: staff.full_name,
        departmentId: staff.department_id,
        departmentName,
        employmentStatus: staff.employment_status,
        workingStatus: resolveWorkingStatus({
          workingStatus: staff.working_status,
          isOffBoarding: isOffBoardingForWeek(
            staff.termination_date,
            statusPeriod.fromDate,
            statusPeriod.toDate,
          ),
          weekLabelCodes,
        }),
        dayCount,
        completeDayCount,
        totalHours: hoursByEmp.get(empKey)?.totalHours ?? 0,
        punchCompletePct:
          dayCount === 0 ? null : (completeDayCount / dayCount) * 100,
      });
    }

    const byDept = new Map<string, DepartmentGroup>();
    for (const row of rows) {
      const deptKey = row.departmentId ?? `__name:${row.departmentName}`;
      const group = byDept.get(deptKey) ?? {
        departmentId: row.departmentId,
        departmentName: row.departmentName,
        rows: [],
        totalHours: 0,
        dayCount: 0,
        completeDayCount: 0,
        punchCompletePct: 0,
      };
      group.rows.push(row);
      group.totalHours += row.totalHours;
      group.dayCount += row.dayCount;
      group.completeDayCount += row.completeDayCount;
      byDept.set(deptKey, group);
    }

    return [...byDept.values()]
      .map((group) => ({
        ...group,
        punchCompletePct:
          group.dayCount === 0
            ? 0
            : (group.completeDayCount / group.dayCount) * 100,
        rows: group.rows.sort((a, b) => a.fullName.localeCompare(b.fullName)),
      }))
      .sort((a, b) => a.departmentName.localeCompare(b.departmentName));
  }, [
    filteredDays,
    staffByEmp,
    scheduleDaysByStaffId,
    statusPeriod,
    hasWeekFilter,
    hasDayRange,
    weekKeySet,
    rangeStart,
    rangeEnd,
  ]);

  const staffRows = useMemo(
    () => groups.flatMap((group) => group.rows),
    [groups],
  );

  /** Charts: only staff with SHIFT days; unpaid leave still excluded. */
  const punchStaffRows = useMemo(
    () =>
      staffRows.flatMap((row) => {
        if (
          row.dayCount <= 0 ||
          row.punchCompletePct == null ||
          row.workingStatus === WORKING_STATUS.unpaidLeave
        ) {
          return [];
        }
        return [
          {
            empNo: row.empNo,
            fullName: row.fullName,
            departmentName: row.departmentName,
            dayCount: row.dayCount,
            completeDayCount: row.completeDayCount,
            punchCompletePct: row.punchCompletePct,
          },
        ];
      }),
    [staffRows],
  );
  const punchDepartmentRows = useMemo(() => {
    const byDept = new Map<
      string,
      {
        departmentName: string;
        staffCount: number;
        dayCount: number;
        completeDayCount: number;
      }
    >();
    for (const row of punchStaffRows) {
      if (row.dayCount === 0) continue;
      const group = byDept.get(row.departmentName) ?? {
        departmentName: row.departmentName,
        staffCount: 0,
        dayCount: 0,
        completeDayCount: 0,
      };
      group.staffCount += 1;
      group.dayCount += row.dayCount;
      group.completeDayCount += row.completeDayCount;
      byDept.set(row.departmentName, group);
    }
    return [...byDept.values()].map((group) => ({
      ...group,
      punchCompletePct:
        group.dayCount === 0
          ? 0
          : (group.completeDayCount / group.dayCount) * 100,
    }));
  }, [punchStaffRows]);

  const staffCount = staffRows.length;
  const totalHours = groups.reduce((sum, g) => sum + g.totalHours, 0);

  const hasActiveFilters = Boolean(
    dayStart || dayEnd || selectedWeekKeys.length,
  );

  function clearFilters() {
    setDayRange("", "");
    setSelectedWeekKeys([]);
  }

  if (!days.length) {
    return (
      <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-10 text-center">
        <p className="text-sm text-black/55">
          No attendance records for this month. Import an InOutData file under
          Settings → Data Management → Attendance, or pick another month.
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
            setDayRange(startDate, endDate);
            if (startDate || endDate) {
              setSelectedWeekKeys([]);
            }
          }}
        />
        <AttendanceMultiWeekPicker
          selectedWeekKeys={selectedWeekKeys}
          onChange={(keys) => {
            setSelectedWeekKeys(keys);
            if (keys.length > 0) {
              setDayRange("", "");
            }
          }}
        />
        <AttendancePayrollMonthPicker
          fieldLabel="Payroll"
          periodStartDay={payrollPeriodStartDay}
          periodEndDay={payrollPeriodEndDay}
          startDate={dayStart}
          endDate={dayEnd}
          onChange={({ startDate, endDate }) => {
            setDayRange(startDate, endDate);
            setSelectedWeekKeys([]);
          }}
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

      <AttendanceInsightsPunchCharts
        staffRows={punchStaffRows}
        departmentRows={punchDepartmentRows}
      />

      <p className="text-sm text-black/50">
        {staffCount} staff · {filteredDays.length} day
        {filteredDays.length === 1 ? "" : "s"} · {formatHours(totalHours)} hours
        total
        {!hasWeekFilter && !hasDayRange
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
                <th className="px-3 py-2.5 font-medium">Emp no</th>
                <th className="px-3 py-2.5 font-medium">Staff</th>
                <th className="px-3 py-2.5 font-medium">Employment</th>
                <th className="px-3 py-2.5 font-medium">Working</th>
                <th className="px-3 py-2.5 font-medium text-right">
                  Shift days
                </th>
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
                <DepartmentTableSection
                  key={group.departmentId ?? group.departmentName}
                  group={group}
                />
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
          colSpan={7}
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
          className="border-b border-black/5 last:border-0 hover:bg-black/[0.015]"
        >
          <td className="px-3 py-2 font-mono text-xs text-[#3D421F]">
            <StaffDirectoryLink staffId={row.staffId} empNo={row.empNo} />
          </td>
          <td className="px-3 py-2 font-medium text-[#3D421F]">
            {row.fullName}
          </td>
          <td className="px-3 py-2">
            <StatusBadge status={row.employmentStatus} />
          </td>
          <td className="px-3 py-2">
            <WorkingStatusBadge status={row.workingStatus} />
          </td>
          <td className="px-3 py-2 text-right tabular-nums text-black/70">
            {row.dayCount === 0
              ? "—"
              : `${row.completeDayCount}/${row.dayCount}`}
          </td>
          <td className="px-3 py-2 text-right tabular-nums">
            {formatHours(row.totalHours)}
          </td>
          <td
            className={
              row.punchCompletePct == null
                ? "px-3 py-2 text-right tabular-nums text-black/30"
                : `px-3 py-2 text-right tabular-nums font-medium ${punchPctClass(row.punchCompletePct)}`
            }
          >
            {row.punchCompletePct == null
              ? "—"
              : formatPct(row.punchCompletePct)}
          </td>
        </tr>
      ))}
    </>
  );
}
