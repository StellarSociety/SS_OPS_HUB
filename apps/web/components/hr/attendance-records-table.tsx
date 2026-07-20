"use client";

import { useMemo, useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AttendanceDayRangePicker,
  AttendanceMultiWeekPicker,
  mondayKeyForWorkDate,
  monthKeyForWorkDate,
} from "@/components/hr/attendance-date-filters";
import { AttendanceMonthUrlPicker } from "@/components/hr/attendance-month-url-picker";
import { usePersistedHrAttendanceRecordsFilters } from "@/components/hr/use-persisted-hr-filters";
import type { HrAttendanceDay } from "@/lib/types/database";
import { ChevronDown, ChevronsUpDown, ChevronUp, X } from "lucide-react";

type StaffLookup = {
  emp_no: string;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
};

type DepartmentOption = { id: string; name: string };

type Props = {
  days: HrAttendanceDay[];
  staffByEmp: Record<string, StaffLookup>;
  departments: DepartmentOption[];
  /**
   * Optional month keys (YYYY-MM) from the URL picker. When set, only those
   * months are shown (handles non-contiguous multi-select within the loaded
   * span). Empty means no month constraint — filter with weeks/days instead.
   */
  monthKeys?: string[];
};

const ATTENDANCE_STATUSES: HrAttendanceDay["status"][] = [
  "complete",
  "missing_clock_in",
  "missing_clock_out",
  "incomplete",
  "no_punches",
];

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: HrAttendanceDay["status"]): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "missing_clock_in":
      return "Missing in";
    case "missing_clock_out":
      return "Missing out";
    case "incomplete":
      return "Incomplete";
    case "no_punches":
      return "No punches";
    default:
      return status;
  }
}

function statusClass(status: HrAttendanceDay["status"]): string {
  switch (status) {
    case "complete":
      return "bg-emerald-50 text-emerald-800";
    case "missing_clock_in":
    case "missing_clock_out":
      return "bg-amber-50 text-amber-900";
    case "incomplete":
      return "bg-rose-50 text-rose-800";
    default:
      return "bg-black/5 text-black/60";
  }
}

type SortKey =
  | "work_date"
  | "emp_no"
  | "name"
  | "department"
  | "clock_in"
  | "clock_out"
  | "hours"
  | "status";

type SortDir = "asc" | "desc";

const SORTABLE_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "work_date", label: "Date" },
  { key: "emp_no", label: "Emp no" },
  { key: "name", label: "Name" },
  { key: "department", label: "Department" },
  { key: "clock_in", label: "Clock in" },
  { key: "clock_out", label: "Clock out" },
  { key: "hours", label: "Hours" },
  { key: "status", label: "Status" },
];

function compareNullableString(a: string | null, b: string | null): number {
  const left = (a ?? "").trim().toLowerCase();
  const right = (b ?? "").trim().toLowerCase();
  if (!left && right) return 1;
  if (left && !right) return -1;
  return left.localeCompare(right);
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

export function AttendanceRecordsTable({
  days,
  staffByEmp,
  departments,
  monthKeys = [],
}: Props) {
  const {
    empNo,
    departmentId,
    status,
    selectedWeekKeys,
    dayStart,
    dayEnd,
    setEmpNo,
    setDepartmentId,
    setStatus,
    setSelectedWeekKeys,
    setDayStart,
    setDayEnd,
  } = usePersistedHrAttendanceRecordsFilters();
  const [sortKey, setSortKey] = useState<SortKey>("work_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const monthKeySet = useMemo(() => new Set(monthKeys), [monthKeys]);
  const hasMonthFilter = monthKeys.length > 0;

  const employees = useMemo(() => {
    const seen = new Set<string>();
    const list: {
      empNo: string;
      fullName: string;
      departmentId: string | null;
    }[] = [];
    for (const day of days) {
      const key = day.emp_no.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const staff = staffByEmp[key];
      list.push({
        empNo: day.emp_no,
        fullName: staff?.full_name ?? day.emp_no,
        departmentId: staff?.department_id ?? null,
      });
    }
    return list.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [days, staffByEmp]);

  const employeeOptions = useMemo(() => {
    const pool = departmentId
      ? employees.filter((e) => e.departmentId === departmentId)
      : employees;
    return pool.map((employee) => ({
      value: employee.empNo,
      label: `${employee.fullName} (${employee.empNo})`,
    }));
  }, [employees, departmentId]);

  const departmentOptions = useMemo(
    () =>
      departments.map((d) => ({
        value: d.id,
        label: d.name,
      })),
    [departments],
  );

  const statusOptions = useMemo(
    () =>
      ATTENDANCE_STATUSES.map((value) => ({
        value,
        label: statusLabel(value),
      })),
    [],
  );

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

  const filtered = useMemo(() => {
    return days.filter((day) => {
      const staff = staffByEmp[day.emp_no.trim().toLowerCase()];

      if (empNo && day.emp_no !== empNo) return false;
      if (departmentId && staff?.department_id !== departmentId) return false;
      if (status && day.status !== status) return false;

      if (hasMonthFilter) {
        const monthKey = monthKeyForWorkDate(day.work_date);
        if (!monthKey || !monthKeySet.has(monthKey)) return false;
      }

      if (hasWeekFilter || hasDayRange) {
        const mondayKey = mondayKeyForWorkDate(day.work_date);
        const inWeek = Boolean(mondayKey && weekKeySet.has(mondayKey));
        const inDays =
          hasDayRange &&
          day.work_date >= rangeStart &&
          day.work_date <= rangeEnd;
        const matchesWeek = hasWeekFilter && inWeek;
        const matchesDays = hasDayRange && inDays;
        // Weeks and days are alternate period tools — match either.
        if (!matchesWeek && !matchesDays) return false;
      }

      return true;
    });
  }, [
    days,
    staffByEmp,
    empNo,
    departmentId,
    status,
    hasMonthFilter,
    monthKeySet,
    hasWeekFilter,
    hasDayRange,
    weekKeySet,
    rangeStart,
    rangeEnd,
  ]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const staffA = staffByEmp[a.emp_no.trim().toLowerCase()];
      const staffB = staffByEmp[b.emp_no.trim().toLowerCase()];
      let cmp = 0;
      switch (sortKey) {
        case "work_date":
          cmp = a.work_date.localeCompare(b.work_date);
          break;
        case "emp_no":
          cmp = a.emp_no.localeCompare(b.emp_no, undefined, {
            numeric: true,
            sensitivity: "base",
          });
          break;
        case "name":
          cmp = compareNullableString(
            staffA?.full_name ?? null,
            staffB?.full_name ?? null,
          );
          break;
        case "department":
          cmp = compareNullableString(
            staffA?.department_name ?? null,
            staffB?.department_name ?? null,
          );
          break;
        case "clock_in":
          cmp = compareNullableString(a.clock_in, b.clock_in);
          break;
        case "clock_out":
          cmp = compareNullableString(a.clock_out, b.clock_out);
          break;
        case "hours":
          cmp = compareNullableNumber(
            a.total_hours == null ? null : Number(a.total_hours),
            b.total_hours == null ? null : Number(b.total_hours),
          );
          break;
        case "status":
          cmp = statusLabel(a.status).localeCompare(statusLabel(b.status));
          break;
      }
      if (cmp !== 0) return cmp * dir;
      // Stable secondary: date desc, then emp no.
      const byDate = b.work_date.localeCompare(a.work_date);
      if (byDate !== 0) return byDate;
      return a.emp_no.localeCompare(b.emp_no, undefined, { numeric: true });
    });
  }, [filtered, staffByEmp, sortKey, sortDir]);

  const hasActiveFilters = Boolean(
    empNo ||
      departmentId ||
      status ||
      selectedWeekKeys.length ||
      dayStart ||
      dayEnd,
  );

  function clearFilters() {
    setEmpNo("");
    setDepartmentId("");
    setStatus("");
    setSelectedWeekKeys([]);
    setDayStart("");
    setDayEnd("");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "work_date" || key === "hours" ? "desc" : "asc");
    }
  }

  const filterBar = (
    <div className="flex flex-nowrap items-end gap-3 overflow-x-auto pb-0.5">
      <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
          Employee
        </span>
        <SearchableSelect
          value={empNo}
          onChange={setEmpNo}
          options={employeeOptions}
          placeholder="All employees"
          searchPlaceholder="Search employee…"
        />
      </div>
      <div className="flex min-w-[10rem] w-[12rem] shrink-0 flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
          Department
        </span>
        <SearchableSelect
          value={departmentId}
          onChange={(next) => {
            setDepartmentId(next);
            if (next && empNo) {
              const selected = employees.find((e) => e.empNo === empNo);
              if (selected && selected.departmentId !== next) {
                setEmpNo("");
              }
            }
          }}
          options={departmentOptions}
          placeholder="All departments"
          searchPlaceholder="Search department…"
        />
      </div>
      <div className="flex w-[11rem] shrink-0 flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
          Status
        </span>
        <SearchableSelect
          value={status}
          onChange={setStatus}
          options={statusOptions}
          placeholder="All statuses"
          searchPlaceholder="Search status…"
        />
      </div>
      <div className="shrink-0">
        <AttendanceMonthUrlPicker selectedMonthKeys={monthKeys} />
      </div>
      <AttendanceMultiWeekPicker
        selectedWeekKeys={selectedWeekKeys}
        onChange={(keys) => {
          setSelectedWeekKeys(keys);
          // Weeks and days are alternate period tools — using one clears the other.
          if (keys.length > 0) {
            setDayStart("");
            setDayEnd("");
          }
        }}
      />
      <AttendanceDayRangePicker
        startDate={dayStart}
        endDate={dayEnd}
        onChange={({ startDate, endDate }) => {
          setDayStart(startDate);
          setDayEnd(endDate);
          if (startDate || endDate) {
            setSelectedWeekKeys([]);
          }
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
  );

  if (!days.length) {
    return (
      <div className="space-y-3">
        {filterBar}
        <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-10 text-center">
          <p className="text-sm text-black/55">
            No attendance records yet. Import an InOutData file under Settings →
            Data Management → Attendance to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filterBar}

      <p className="text-sm text-black/50">
        {filtered.length} of {days.length} record{days.length === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-10 text-center">
          <p className="text-sm text-black/55">No records match your filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white/70">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-black/10 bg-black/[0.03] text-xs uppercase tracking-wide text-black/45">
              <tr>
                {SORTABLE_COLUMNS.map((col) => {
                  const active = sortKey === col.key;
                  return (
                    <th key={col.key} className="px-3 py-2.5 font-medium" aria-sort={
                      active
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }>
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="flex w-full items-center gap-1 whitespace-nowrap text-xs font-medium uppercase tracking-wide text-black/45 transition-colors hover:text-[#3D421F]"
                      >
                        {col.label}
                        {active ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5 text-[var(--venue-primary)]" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-[var(--venue-primary)]" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 text-black/25" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((day) => {
                const staff = staffByEmp[day.emp_no.trim().toLowerCase()];
                return (
                  <tr
                    key={day.id}
                    className="border-b border-black/5 last:border-0 hover:bg-black/[0.02]"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-[#3D421F]">
                      {day.work_date}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                      {day.emp_no}
                    </td>
                    <td className="px-3 py-2 text-black/70">
                      {staff?.full_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-black/70">
                      {staff?.department_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatTime(day.clock_in)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatTime(day.clock_out)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {day.total_hours == null
                        ? "—"
                        : Number(day.total_hours).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusClass(day.status)}`}
                      >
                        {statusLabel(day.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
