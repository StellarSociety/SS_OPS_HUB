"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { PayslipDownloadButton } from "@/components/hr/payslip-download-button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import type { PayslipListItem } from "@/lib/actions/hr-payroll";
import { formatPayrollMonthLabel } from "@/lib/hr/payroll";
import { cn } from "@/lib/utils";

const lightSelectClass =
  "flex h-9 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

const NO_DEPARTMENT = "No department";

type PayslipsHistoryClientProps = {
  payslips: PayslipListItem[];
};

export function PayslipsHistoryClient({ payslips }: PayslipsHistoryClientProps) {
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [payrollMonth, setPayrollMonth] = useState("");

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of payslips) {
      names.add(row.department_name?.trim() || NO_DEPARTMENT);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [payslips]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const row of payslips) {
      if (row.payroll_month) months.add(row.payroll_month);
    }
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [payslips]);

  const hasActiveFilters =
    employeeQuery.trim().length > 0 ||
    selectedDepartments.length > 0 ||
    payrollMonth.length > 0;

  const filtered = useMemo(() => {
    if (!hasActiveFilters) return [];

    const q = employeeQuery.trim().toLowerCase();
    const deptSet =
      selectedDepartments.length > 0 ? new Set(selectedDepartments) : null;

    return payslips.filter((row) => {
      if (payrollMonth && row.payroll_month !== payrollMonth) return false;
      if (deptSet) {
        const dept = row.department_name?.trim() || NO_DEPARTMENT;
        if (!deptSet.has(dept)) return false;
      }
      if (!q) return true;
      return (
        (row.full_name ?? "").toLowerCase().includes(q) ||
        (row.emp_no ?? "").toLowerCase().includes(q)
      );
    });
  }, [
    payslips,
    employeeQuery,
    selectedDepartments,
    payrollMonth,
    hasActiveFilters,
  ]);

  function clearFilters() {
    setEmployeeQuery("");
    setSelectedDepartments([]);
    setPayrollMonth("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white/70 p-3">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Employee
          </p>
          <div className="relative">
            <Input
              className={cn("h-9", employeeQuery.trim() && "pr-9")}
              placeholder="Name or emp no…"
              value={employeeQuery}
              onChange={(e) => setEmployeeQuery(e.target.value)}
              aria-label="Search by employee"
            />
            {employeeQuery.trim() ? (
              <button
                type="button"
                onClick={() => setEmployeeQuery("")}
                aria-label="Clear employee search"
                className="absolute right-2 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-black/5 text-black/45 transition-colors hover:bg-black/15 hover:text-[#3D421F]"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
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
            className="[&_button]:h-9 [&_button]:text-sm"
          />
        </div>

        <div className="min-w-[10rem] w-44 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Month
          </p>
          <div className="relative">
            <select
              className={cn(
                lightSelectClass,
                payrollMonth && "pr-14",
              )}
              value={payrollMonth}
              onChange={(e) => setPayrollMonth(e.target.value)}
              aria-label="Filter by payroll month"
            >
              <option value="">All months</option>
              {monthOptions.map((month) => (
                <option key={month} value={month}>
                  {formatPayrollMonthLabel(month)}
                </option>
              ))}
            </select>
            {payrollMonth ? (
              <button
                type="button"
                onClick={() => setPayrollMonth("")}
                aria-label="Clear month filter"
                className="absolute right-7 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-black/5 text-black/45 transition-colors hover:bg-black/15 hover:text-[#3D421F]"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="mb-1.5 text-xs font-medium text-black/45 transition hover:text-[#3D421F]"
          >
            Clear filters
          </button>
        ) : null}

        {hasActiveFilters ? (
          <p className="mb-1.5 ml-auto text-xs text-black/45">
            Showing {filtered.length} of {payslips.length}
          </p>
        ) : null}
      </div>

      {!hasActiveFilters ? (
        <div className="rounded-lg border border-dashed border-black/15 bg-white/50 px-4 py-12 text-center">
          <p className="text-sm text-black/55">
            Search by employee, department, or month to find payslips.
          </p>
          {payslips.length > 0 ? (
            <p className="mt-1 text-xs text-black/40">
              {payslips.length} payslip
              {payslips.length === 1 ? "" : "s"} available
            </p>
          ) : (
            <p className="mt-1 text-xs text-black/40">
              No payslips yet. Generate them from a payroll run.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Month</th>
                <th className="px-3 py-2.5 font-medium">Employee</th>
                <th className="px-3 py-2.5 font-medium">Department</th>
                <th className="px-3 py-2.5 font-medium text-right">Version</th>
                <th className="px-3 py-2.5 font-medium">Email</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-12 text-center text-sm text-black/45"
                  >
                    No payslips match these filters.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2.5 text-[#3D421F]">
                      {row.payroll_month
                        ? formatPayrollMonthLabel(row.payroll_month)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.emp_no
                        ? `${row.emp_no} — ${row.full_name ?? ""}`
                        : (row.full_name ?? "—")}
                    </td>
                    <td className="px-3 py-2.5 text-black/70">
                      {row.department_name?.trim() || NO_DEPARTMENT}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      v{row.version}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-black/60">
                      {row.email_status.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex items-center gap-3">
                        <PayslipDownloadButton payslipId={row.id} />
                        <Link
                          href={`/hr/payroll/${row.run_id}?tab=run`}
                          className="text-sm font-medium text-black/55 underline-offset-2 hover:underline"
                        >
                          Run
                        </Link>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
