"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { PayslipDownloadButton } from "@/components/hr/payslip-download-button";
import { PayslipViewButton } from "@/components/hr/payslip-view-button";
import { PayrollMonthPicker } from "@/components/hr/payroll-month-picker";
import { StatusBadge } from "@/components/hr/status-badge";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  generatePayslips,
  type PayslipListItem,
} from "@/lib/actions/hr-payroll";
import { sendPayslipsEmail } from "@/lib/actions/hr-payslip-email";
import {
  formatPayrollMonthLabel,
  PAYROLL_STATUS_LABELS,
  type PayrollStatus,
} from "@/lib/hr/payroll";
import { SalesImportProgressBar } from "@/components/sales/sales-import-progress-bar";
import { cn } from "@/lib/utils";

const lightSelectClass =
  "flex h-9 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

const NO_DEPARTMENT = "No department";
const NO_EMPLOYMENT_STATUS = "No status";

export type PayslipRunOption = {
  id: string;
  payroll_month: string;
  status: string;
};

function employeeKey(row: PayslipListItem): string {
  if (row.staff_id) return `staff:${row.staff_id}`;
  if (row.emp_no?.trim()) return `emp:${row.emp_no.trim().toLowerCase()}`;
  return `name:${(row.full_name ?? "").trim().toLowerCase() || row.id}`;
}

function employeeLabel(row: PayslipListItem): string {
  if (row.emp_no?.trim()) {
    return `${row.emp_no.trim()} — ${row.full_name ?? ""}`.trim();
  }
  return row.full_name?.trim() || "Unknown employee";
}

function monthKey(value: string): string {
  return value.trim().slice(0, 7);
}

function statusLabel(status: string): string {
  return (
    PAYROLL_STATUS_LABELS[status as PayrollStatus] ??
    status.replace(/_/g, " ")
  );
}

function emailStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function findRunForMonth(
  runs: PayslipRunOption[],
  month: string,
): PayslipRunOption | undefined {
  const key = monthKey(month);
  if (!key) return undefined;
  return runs.find((run) => monthKey(run.payroll_month) === key);
}

/** Latest payslip version per employee for a given month. */
function latestPayslipsForMonth(
  payslips: PayslipListItem[],
  month: string,
): PayslipListItem[] {
  const key = monthKey(month);
  if (!key) return [];
  const byEmployee = new Map<string, PayslipListItem>();
  for (const row of payslips) {
    if (monthKey(row.payroll_month ?? "") !== key) continue;
    const emp = employeeKey(row);
    const existing = byEmployee.get(emp);
    if (!existing || row.version > existing.version) {
      byEmployee.set(emp, row);
    }
  }
  return [...byEmployee.values()].sort((a, b) =>
    employeeLabel(a).localeCompare(employeeLabel(b)),
  );
}

/** Keep the highest version per employee + payroll month. */
function keepLatestVersions(rows: PayslipListItem[]): PayslipListItem[] {
  const byKey = new Map<string, PayslipListItem>();
  for (const row of rows) {
    const key = `${employeeKey(row)}|${monthKey(row.payroll_month ?? "")}`;
    const existing = byKey.get(key);
    if (!existing || row.version > existing.version) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

type PayslipsHistoryClientProps = {
  payslips: PayslipListItem[];
  runs?: PayslipRunOption[];
  canGenerate?: boolean;
  periodStartDay?: number;
  periodEndDay?: number;
};

export function PayslipsHistoryClient({
  payslips,
  runs = [],
  canGenerate = false,
  periodStartDay,
  periodEndDay,
}: PayslipsHistoryClientProps) {
  const router = useRouter();
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedEmploymentStatuses, setSelectedEmploymentStatuses] = useState<
    string[]
  >([]);
  const [payrollMonth, setPayrollMonth] = useState("");
  const [latestOnly, setLatestOnly] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [generateMonth, setGenerateMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [sendMonth, setSendMonth] = useState("");
  const [sendDepartments, setSendDepartments] = useState<string[]>([]);
  const [selectedPayslipIds, setSelectedPayslipIds] = useState<string[]>([]);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of payslips) {
      names.add(row.department_name?.trim() || NO_DEPARTMENT);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [payslips]);

  const employmentStatusOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of payslips) {
      names.add(row.employment_status?.trim() || NO_EMPLOYMENT_STATUS);
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

  const employeeOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const row of payslips) {
      const key = employeeKey(row);
      if (!byKey.has(key)) byKey.set(key, employeeLabel(row));
    }
    return [...byKey.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [payslips]);

  const hasActiveFilters =
    selectedEmployee.length > 0 ||
    selectedDepartments.length > 0 ||
    selectedEmploymentStatuses.length > 0 ||
    payrollMonth.length > 0 ||
    latestOnly;

  const filtered = useMemo(() => {
    if (!hasActiveFilters) return [];

    const deptSet =
      selectedDepartments.length > 0 ? new Set(selectedDepartments) : null;
    const statusSet =
      selectedEmploymentStatuses.length > 0
        ? new Set(selectedEmploymentStatuses)
        : null;

    const matched = payslips.filter((row) => {
      if (payrollMonth && row.payroll_month !== payrollMonth) return false;
      if (deptSet) {
        const dept = row.department_name?.trim() || NO_DEPARTMENT;
        if (!deptSet.has(dept)) return false;
      }
      if (statusSet) {
        const status = row.employment_status?.trim() || NO_EMPLOYMENT_STATUS;
        if (!statusSet.has(status)) return false;
      }
      if (selectedEmployee && employeeKey(row) !== selectedEmployee) {
        return false;
      }
      return true;
    });

    return latestOnly ? keepLatestVersions(matched) : matched;
  }, [
    payslips,
    selectedEmployee,
    selectedDepartments,
    selectedEmploymentStatuses,
    payrollMonth,
    latestOnly,
    hasActiveFilters,
  ]);

  const matchedRun = useMemo(
    () => findRunForMonth(runs, generateMonth),
    [runs, generateMonth],
  );

  const sendCandidates = useMemo(() => {
    const latest = latestPayslipsForMonth(payslips, sendMonth);
    if (sendDepartments.length === 0) return latest;
    const deptSet = new Set(sendDepartments);
    return latest.filter((row) =>
      deptSet.has(row.department_name?.trim() || NO_DEPARTMENT),
    );
  }, [payslips, sendMonth, sendDepartments]);

  const sendDepartmentOptions = useMemo(() => {
    const latest = latestPayslipsForMonth(payslips, sendMonth);
    const names = new Set<string>();
    for (const row of latest) {
      names.add(row.department_name?.trim() || NO_DEPARTMENT);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [payslips, sendMonth]);

  const allSendSelected =
    sendCandidates.length > 0 &&
    sendCandidates.every((row) => selectedPayslipIds.includes(row.id));

  function clearFilters() {
    setSelectedEmployee("");
    setSelectedDepartments([]);
    setSelectedEmploymentStatuses([]);
    setPayrollMonth("");
    setLatestOnly(false);
  }

  function openGenerateDialog() {
    const preferred =
      (payrollMonth ? monthKey(payrollMonth) : "") ||
      (runs[0] ? monthKey(runs[0].payroll_month) : "") ||
      generateMonth;
    setGenerateMonth(preferred);
    setGenerateMessage(null);
    setGenerateError(null);
    setGenerateOpen(true);
  }

  function openSendDialog() {
    const preferred =
      (payrollMonth ? monthKey(payrollMonth) : "") ||
      monthOptions[0] ||
      (runs[0] ? monthKey(runs[0].payroll_month) : "") ||
      generateMonth;
    setSendMonth(preferred);
    setSendDepartments([]);
    const initial = latestPayslipsForMonth(payslips, preferred);
    setSelectedPayslipIds(initial.map((row) => row.id));
    setSendMessage(null);
    setSendError(null);
    setSendOpen(true);
  }

  function handleSendMonthChange(month: string) {
    setSendMonth(month);
    setSendDepartments([]);
    setSelectedPayslipIds(
      latestPayslipsForMonth(payslips, month).map((row) => row.id),
    );
    setSendError(null);
  }

  function handleSendDepartmentsChange(next: string[]) {
    setSendDepartments(next);
    const latest = latestPayslipsForMonth(payslips, sendMonth);
    const filteredRows =
      next.length === 0
        ? latest
        : latest.filter((row) =>
            next.includes(row.department_name?.trim() || NO_DEPARTMENT),
          );
    setSelectedPayslipIds(filteredRows.map((row) => row.id));
    setSendError(null);
  }

  function togglePayslip(id: string) {
    setSelectedPayslipIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAllCandidates() {
    setSelectedPayslipIds(sendCandidates.map((row) => row.id));
  }

  function deselectAllCandidates() {
    setSelectedPayslipIds([]);
  }

  function handleGenerate() {
    setGenerateMessage(null);
    setGenerateError(null);
    const run = findRunForMonth(runs, generateMonth);
    if (!run) {
      setGenerateError(
        "No payroll run exists for that month. Create a payroll run first.",
      );
      return;
    }
    startTransition(async () => {
      try {
        const result = await generatePayslips(run.id);
        if (!result.ok) {
          setGenerateError(result.error ?? "Generate payslips failed");
          return;
        }
        setGenerateMessage("Payslips generated");
        setGenerateOpen(false);
        router.refresh();
      } catch (err) {
        setGenerateError(
          err instanceof Error ? err.message : "Generate payslips failed",
        );
      }
    });
  }

  function handleSend() {
    setSendMessage(null);
    setSendError(null);
    if (selectedPayslipIds.length === 0) {
      setSendError("Select at least one employee.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await sendPayslipsEmail(selectedPayslipIds);
        if (!result.ok) {
          setSendError(result.error);
          return;
        }
        const parts = [
          `${result.sent} sent`,
          result.failed > 0 ? `${result.failed} failed` : null,
          result.skipped > 0 ? `${result.skipped} skipped` : null,
        ].filter(Boolean);
        setSendMessage(`Payslips emailed — ${parts.join(", ")}`);
        if (result.errors.length > 0) {
          setSendError(result.errors.slice(0, 5).join(" · "));
        } else {
          setSendOpen(false);
        }
        router.refresh();
      } catch (err) {
        setSendError(
          err instanceof Error ? err.message : "Send payslips failed",
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      {canGenerate ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
            onClick={openGenerateDialog}
            disabled={pending}
          >
            Generate payslips
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-9 border border-black/10 bg-white text-[#3D421F] hover:bg-black/5"
            onClick={openSendDialog}
            disabled={pending || payslips.length === 0}
          >
            Send payslips
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white/70 p-3">
        <div className="min-w-[10rem] w-44 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Month
          </p>
          <div className="relative">
            <select
              className={cn(lightSelectClass, payrollMonth && "pr-14")}
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

        <div className="min-w-[11rem] w-48 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Employment status
          </p>
          <MultiSelect
            options={employmentStatusOptions}
            selected={selectedEmploymentStatuses}
            onChange={setSelectedEmploymentStatuses}
            placeholder="All statuses"
            searchPlaceholder="Search status…"
            className="[&_button]:h-9 [&_button]:text-sm"
          />
        </div>

        <div className="min-w-[12rem] flex-1 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Employee
          </p>
          <SearchableSelect
            value={selectedEmployee}
            onChange={setSelectedEmployee}
            options={employeeOptions}
            placeholder="All employees"
            searchPlaceholder="Search employee…"
            className="[&_button]:h-9 [&_button]:text-sm"
          />
        </div>

        <label className="mb-0.5 flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-[#3D421F]">
          <input
            type="checkbox"
            checked={latestOnly}
            onChange={(e) => setLatestOnly(e.target.checked)}
            className="size-4 rounded border-black/20 text-[var(--venue-primary,#818a40)] focus:ring-[var(--venue-primary,#818a40)]/30"
          />
          Latest version only
        </label>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="mb-0.5 text-xs font-medium text-black/45 transition hover:text-[#3D421F]"
          >
            Clear filters
          </button>
        ) : null}

        {hasActiveFilters ? (
          <p className="ml-auto mb-2 text-xs text-black/45">
            Showing {filtered.length} of {payslips.length}
          </p>
        ) : null}
      </div>

      {generateMessage ? (
        <p className="rounded-lg border border-[var(--venue-primary,#818a40)]/25 bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-2 text-sm text-[#3D421F]">
          {generateMessage}
        </p>
      ) : null}

      {sendMessage ? (
        <p className="rounded-lg border border-[var(--venue-primary,#818a40)]/25 bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-2 text-sm text-[#3D421F]">
          {sendMessage}
        </p>
      ) : null}

      {!hasActiveFilters ? (
        <div className="rounded-lg border border-dashed border-black/15 bg-white/50 px-4 py-12 text-center">
          <p className="text-sm text-black/55">
            Select a month, department, employment status, or employee to find
            payslips — or turn on “Latest version only”.
          </p>
          {payslips.length > 0 ? (
            <p className="mt-1 text-xs text-black/40">
              {payslips.length} payslip
              {payslips.length === 1 ? "" : "s"} available
            </p>
          ) : (
            <p className="mt-1 text-xs text-black/40">
              {canGenerate
                ? "No payslips yet. Use Generate payslips to create them for a payroll month."
                : "No payslips yet."}
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
                <th className="px-3 py-2.5 font-medium">Employment status</th>
                <th className="px-3 py-2.5 font-medium text-right">Version</th>
                <th className="px-3 py-2.5 font-medium">Email</th>
                <th className="px-3 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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
                    <td className="px-3 py-2.5">
                      <StatusBadge status={row.employment_status} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      v{row.version}
                    </td>
                    <td className="px-3 py-2.5 capitalize text-black/60">
                      {emailStatusLabel(row.email_status)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex items-center gap-2">
                        <PayslipViewButton payslipId={row.id} />
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

      {generateOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (!pending && event.target === event.currentTarget) {
              setGenerateOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-payslips-title"
            className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
          >
            <h2
              id="generate-payslips-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              Generate payslips
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Choose the payroll month to generate payslip versions for. A new
              version is created for each included employee on that run.
            </p>

            <div className="mt-4">
              <PayrollMonthPicker
                id="generate_payslips_month"
                value={generateMonth}
                onChange={(month) => {
                  setGenerateMonth(month);
                  setGenerateError(null);
                }}
                periodStartDay={periodStartDay}
                periodEndDay={periodEndDay}
                disabled={pending}
              />
            </div>

            {matchedRun ? (
              <p className="mt-3 text-sm text-black/60">
                Using payroll run for{" "}
                <span className="font-medium text-[#3D421F]">
                  {formatPayrollMonthLabel(matchedRun.payroll_month)}
                </span>{" "}
                · {statusLabel(matchedRun.status)}
              </p>
            ) : (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900/80">
                No payroll run exists for this month. Create one under Payroll
                first.
              </p>
            )}

            {generateError ? (
              <p className="mt-3 text-sm text-red-700">{generateError}</p>
            ) : null}

            {pending && generateOpen ? (
              <SalesImportProgressBar label="Generating payslips…" />
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                disabled={pending}
                onClick={() => setGenerateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                disabled={pending || !matchedRun}
                onClick={handleGenerate}
              >
                {pending ? "Generating…" : "Generate"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {sendOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (!pending && event.target === event.currentTarget) {
              setSendOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-payslips-title"
            className="flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col rounded-xl border border-black/10 bg-white p-6 shadow-xl"
          >
            <h2
              id="send-payslips-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              Send payslips
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Email the latest payslip version for each selected employee.
              Previously sent payslips stay selectable and show their status.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                  Month
                </p>
                <select
                  className={lightSelectClass}
                  value={sendMonth}
                  onChange={(e) => handleSendMonthChange(e.target.value)}
                  disabled={pending}
                  aria-label="Payroll month to send"
                >
                  {monthOptions.length === 0 ? (
                    <option value="">No payslips</option>
                  ) : (
                    monthOptions.map((month) => (
                      <option key={month} value={month}>
                        {formatPayrollMonthLabel(month)}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                  Department
                </p>
                <MultiSelect
                  options={sendDepartmentOptions}
                  selected={sendDepartments}
                  onChange={handleSendDepartmentsChange}
                  placeholder="All departments"
                  searchPlaceholder="Search department…"
                  className="[&_button]:h-9 [&_button]:text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                Employees
              </p>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-[var(--venue-primary,#818a40)] hover:underline"
                  disabled={pending || sendCandidates.length === 0}
                  onClick={selectAllCandidates}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs font-medium text-black/45 hover:underline"
                  disabled={pending || selectedPayslipIds.length === 0}
                  onClick={deselectAllCandidates}
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-black/10">
              {sendCandidates.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-black/45">
                  No payslips for this month
                  {sendDepartments.length > 0 ? " and department" : ""}.
                  Generate payslips first.
                </p>
              ) : (
                <ul className="divide-y divide-black/5">
                  {sendCandidates.map((row) => {
                    const checked = selectedPayslipIds.includes(row.id);
                    const sentBefore =
                      row.email_status === "sent" || Boolean(row.email_sent_at);
                    return (
                      <li key={row.id}>
                        <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-black/[0.02]">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-black/20"
                            checked={checked}
                            disabled={pending}
                            onChange={() => togglePayslip(row.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-[#3D421F]">
                              {employeeLabel(row)}
                            </span>
                            <span className="mt-0.5 block text-xs text-black/45">
                              {row.department_name?.trim() || NO_DEPARTMENT}
                              {" · "}v{row.version}
                              {" · "}
                              <span
                                className={cn(
                                  "capitalize",
                                  sentBefore
                                    ? "text-amber-800"
                                    : "text-black/45",
                                )}
                              >
                                {emailStatusLabel(row.email_status)}
                                {row.email_sent_at
                                  ? ` · ${new Date(row.email_sent_at).toLocaleDateString("en-GB")}`
                                  : ""}
                              </span>
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <p className="mt-2 text-xs text-black/45">
              {selectedPayslipIds.length} of {sendCandidates.length} selected
              {allSendSelected && sendCandidates.length > 0
                ? " (all)"
                : ""}
            </p>

            {sendError ? (
              <p className="mt-2 text-sm text-red-700">{sendError}</p>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => setSendOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                disabled={pending || selectedPayslipIds.length === 0}
                onClick={handleSend}
              >
                {pending ? "Sending…" : "Send emails"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
