"use client";

import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/hr/status-badge";
import { formatDateOnly } from "@/lib/hr/derived";
import {
  employmentStatusSurfaceClass,
  findStatusNameById,
} from "@/lib/hr/employment-status";
import type {
  Department,
  EmploymentStatus,
  StaffWithLookups,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type StaffDirectoryProps = {
  staff: StaffWithLookups[];
  departments: Department[];
  statuses: EmploymentStatus[];
};

export function StaffDirectory({
  staff,
  departments,
  statuses,
}: StaffDirectoryProps) {
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [statusId, setStatusId] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return staff.filter((s) => {
      if (departmentId && s.department_id !== departmentId) return false;
      if (statusId && s.employment_status_id !== statusId) return false;
      if (!q) return true;
      return (
        s.full_name.toLowerCase().includes(q) ||
        s.emp_no.toLowerCase().includes(q) ||
        (s.work_email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [staff, search, departmentId, statusId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
          <Input
            placeholder="Search name, emp no, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          value={statusId}
          onChange={(e) => setStatusId(e.target.value)}
          className={cn(
            "h-10 rounded-md border border-black/10 bg-white px-3 text-sm",
            employmentStatusSurfaceClass(findStatusNameById(statuses, statusId)),
          )}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-black/50">
        {filtered.length} staff member{filtered.length === 1 ? "" : "s"}
      </p>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-black/10 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-4 py-3">Emp no</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Nationality</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                className="border-b border-black/5 hover:bg-[var(--venue-secondary)]/30"
              >
                <td className="px-4 py-3 font-mono text-xs">{s.emp_no}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/hr/${s.id}`}
                    className="font-medium text-[#3D421F] hover:underline"
                  >
                    {s.full_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-black/70">
                  {s.department?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-black/70">
                  {s.position?.name ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.employment_status?.name} />
                </td>
                <td className="px-4 py-3 text-black/70">
                  {s.nationality?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-black/70">
                  {formatDateOnly(s.joining_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {filtered.map((s) => (
          <Link
            key={s.id}
            href={`/hr/${s.id}`}
            className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[#3D421F]">{s.full_name}</p>
                <p className="font-mono text-xs text-black/50">{s.emp_no}</p>
              </div>
              <StatusBadge status={s.employment_status?.name} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-black/60">
              <div>
                <dt className="text-black/40">Dept</dt>
                <dd>{s.department?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-black/40">Position</dt>
                <dd>{s.position?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-black/40">Nationality</dt>
                <dd>{s.nationality?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-black/40">Joined</dt>
                <dd>{formatDateOnly(s.joining_date)}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-black/50">
          No staff match your filters.
        </p>
      ) : null}
    </div>
  );
}
