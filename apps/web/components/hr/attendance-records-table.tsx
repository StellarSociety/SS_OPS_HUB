"use client";

import { Input } from "@/components/ui/input";
import type { HrAttendanceDay } from "@/lib/types/database";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

type StaffName = { emp_no: string; full_name: string };

type Props = {
  days: HrAttendanceDay[];
  staffByEmp: Record<string, StaffName>;
};

const ATTENDANCE_STATUSES: HrAttendanceDay["status"][] = [
  "complete",
  "missing_clock_in",
  "missing_clock_out",
  "incomplete",
  "no_punches",
];

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]";

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

export function AttendanceRecordsTable({ days, staffByEmp }: Props) {
  const [search, setSearch] = useState("");
  const [empNo, setEmpNo] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const employees = useMemo(() => {
    const seen = new Set<string>();
    const list: { empNo: string; fullName: string }[] = [];
    for (const day of days) {
      const key = day.emp_no.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const staff = staffByEmp[key];
      list.push({
        empNo: day.emp_no,
        fullName: staff?.full_name ?? day.emp_no,
      });
    }
    return list.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [days, staffByEmp]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return days.filter((day) => {
      const staff = staffByEmp[day.emp_no.trim().toLowerCase()];
      const fullName = staff?.full_name ?? "";

      if (empNo && day.emp_no !== empNo) return false;
      if (status && day.status !== status) return false;
      if (fromDate && day.work_date < fromDate) return false;
      if (toDate && day.work_date > toDate) return false;
      if (!q) return true;

      return (
        day.work_date.includes(q) ||
        day.emp_no.toLowerCase().includes(q) ||
        fullName.toLowerCase().includes(q) ||
        statusLabel(day.status).toLowerCase().includes(q)
      );
    });
  }, [days, staffByEmp, search, empNo, status, fromDate, toDate]);

  const hasFilters = Boolean(search || empNo || status || fromDate || toDate);

  function clearFilters() {
    setSearch("");
    setEmpNo("");
    setStatus("");
    setFromDate("");
    setToDate("");
  }

  if (!days.length) {
    return (
      <div className="rounded-xl border border-dashed border-black/15 bg-white/40 px-5 py-10 text-center">
        <p className="text-sm text-black/55">
          No attendance records yet. Import an InOutData file from the fingerprint
          machine to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
          <Input
            placeholder="Search date, name, emp no, status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={empNo}
          onChange={(e) => setEmpNo(e.target.value)}
          className={selectClass}
          aria-label="Filter by employee"
        >
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.empNo} value={employee.empNo}>
              {employee.fullName} ({employee.empNo})
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {ATTENDANCE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex flex-col gap-1 text-xs text-black/50">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={selectClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-black/50">
            To
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={selectClass}
            />
          </label>
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-sm text-black/60 hover:bg-black/[0.02]"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        ) : null}
      </div>

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
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Emp no</th>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Clock in</th>
                <th className="px-3 py-2.5 font-medium">Clock out</th>
                <th className="px-3 py-2.5 font-medium">Hours</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((day) => {
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
