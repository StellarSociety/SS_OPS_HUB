"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import {
  addPayrollAdjustment,
  exportPayrollGl,
  generatePayslips,
  generateWpsFile,
  markPayrollPaid,
  recalculatePayrollRun,
  setEmployeeIncluded,
  transitionPayrollRun,
  updatePayrollBudgetRevenue,
  upsertSettlement,
  waivePayrollException,
} from "@/lib/actions/hr-payroll";
import {
  PAYROLL_STATUS_LABELS,
  PAYROLL_STATUS_TRANSITIONS,
  canEditPayrollRun,
  formatPayrollMonthLabel,
  isPayrollLocked,
  type PayrollLineCategory,
  type PayrollStatus,
} from "@/lib/hr/payroll";
import { downloadTextFile } from "@/lib/sales/vouchers-export";
import { cn } from "@/lib/utils";
import type { PayrollRunTab } from "@/lib/hr/payroll";

const lightSelectClass =
  "flex h-8 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

function formatMoney(
  amount: number | null | undefined,
  canViewSalary: boolean,
): string {
  if (!canViewSalary) return "—";
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return value;
  return d;
}

/**
 * Working status for payroll display.
 * Leavers in this run are Off-boarding (final settlement through month end).
 * Otherwise use the staff directory working status.
 */
export function resolvePayrollWorkingStatus(
  row: Pick<PayrollEmployeeRow, "working_status" | "is_leaver">,
): string {
  if (row.is_leaver) return "OFF-Boarding";
  const status = row.working_status?.trim();
  return status || "Active";
}

function statusLabel(status: string): string {
  return (
    PAYROLL_STATUS_LABELS[status as PayrollStatus] ??
    status.replace(/_/g, " ")
  );
}

export type PayrollRunRow = {
  id: string;
  payroll_month: string;
  period_start: string;
  period_end: string;
  payment_date: string | null;
  status: string;
  budget_amount: number | null;
  revenue_amount: number | null;
  totals: Record<string, unknown> | null;
  notes: string | null;
};

export type PayrollEmployeeRow = {
  id: string;
  staff_id: string;
  emp_no: string;
  full_name: string;
  department_name: string | null;
  /** Staff working status name (Active, Paid Leave, Unpaid Leave, OFF-Boarding). */
  working_status: string | null;
  included: boolean;
  exclude_reason: string | null;
  is_new_joiner: boolean;
  is_leaver: boolean;
  paid_days: number;
  unpaid_days: number;
  fixed_earnings: number;
  variable_earnings: number;
  total_deductions: number;
  net_salary: number;
};

export type PayrollLineRow = {
  id: string;
  run_employee_id: string;
  category: string;
  code: string;
  label: string;
  amount: number;
  sort_order: number;
};

export type PayrollExceptionRow = {
  id: string;
  emp_no: string | null;
  severity: string;
  exception_type: string;
  message: string;
  work_date: string | null;
  waived: boolean;
  waive_comment: string | null;
};

export type PayrollAdjustmentRow = {
  id: string;
  staff_id: string;
  category: string;
  code: string;
  label: string;
  amount: number;
  percent_of_daily_rate: number | null;
  days_applied: number | null;
  reason: string;
  created_at: string;
};

export type PayrollSettlementRow = {
  id: string;
  run_employee_id: string;
  staff_id: string;
  termination_date: string | null;
  leave_encashment: number;
  outstanding_advances: number;
  eosb_amount: number;
  other_amount: number;
  net_settlement: number;
  include_in_run: boolean;
  notes: string | null;
};

export type PayrollPaymentRow = {
  id: string;
  run_employee_id: string;
  staff_id: string;
  wps_employee_id: string | null;
  iban: string | null;
  bank_name: string | null;
  fixed_salary: number;
  variable_salary: number;
  days_paid: number;
  leave_days: number;
  net_salary: number;
  payment_method: string;
  status: string;
};

export type PayrollEventRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  comment: string | null;
  created_at: string;
};

export type PayrollStaffOption = {
  id: string;
  emp_no: string;
  full_name: string;
};

type PayrollRunClientProps = {
  tab: PayrollRunTab;
  run: PayrollRunRow;
  employees: PayrollEmployeeRow[];
  lines: PayrollLineRow[];
  exceptions: PayrollExceptionRow[];
  adjustments: PayrollAdjustmentRow[];
  settlements: PayrollSettlementRow[];
  payments: PayrollPaymentRow[];
  events: PayrollEventRow[];
  staffOptions: PayrollStaffOption[];
  canViewSalary: boolean;
  canEdit: boolean;
};

type PayrollActionOutcome =
  | { ok: true }
  | { ok: false; error?: string }
  | void;

type PayrollCsvOutcome =
  | { ok: true; csv: string; filename: string }
  | { ok: false; error: string };

type PayrollActionFn = () => Promise<PayrollActionOutcome>;
type PayrollCsvFn = () => Promise<PayrollCsvOutcome>;

const PAYROLL_STATUSES_ORDER: PayrollStatus[] = [
  "draft",
  "attendance_validated",
  "hr_review",
  "finance_review",
  "final_approval",
  "payment_processing",
  "paid",
  "locked",
];

export function PayrollRunClient({
  tab,
  run,
  employees,
  lines,
  exceptions,
  adjustments,
  settlements,
  payments,
  events,
  staffOptions,
  canViewSalary,
  canEdit,
}: PayrollRunClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [budget, setBudget] = useState(
    run.budget_amount != null ? String(run.budget_amount) : "",
  );
  const [revenue, setRevenue] = useState(
    run.revenue_amount != null ? String(run.revenue_amount) : "",
  );

  const totals = (run.totals ?? {}) as Record<string, number>;
  const includedCount =
    totals.includedCount ?? employees.filter((e) => e.included).length;
  const excludedCount =
    totals.excludedCount ?? employees.filter((e) => !e.included).length;
  const joinerCount =
    totals.newJoinerCount ?? employees.filter((e) => e.is_new_joiner).length;
  const leaverCount =
    totals.leaverCount ?? employees.filter((e) => e.is_leaver).length;

  const editable = canEdit && canEditPayrollRun(run.status);
  const locked = isPayrollLocked(run.status);
  const nextStatuses =
    PAYROLL_STATUS_TRANSITIONS[run.status as PayrollStatus] ?? [];

  const linesByEmployee: Map<string, PayrollLineRow[]> = new Map();
  for (const line of lines) {
    const list = linesByEmployee.get(line.run_employee_id) ?? [];
    list.push(line);
    linesByEmployee.set(line.run_employee_id, list);
  }

  const employeeById: Map<string, PayrollEmployeeRow> = new Map(
    employees.map((e) => [e.id, e]),
  );
  const employeeByStaff: Map<string, PayrollEmployeeRow> = new Map(
    employees.map((e) => [e.staff_id, e]),
  );

  function refresh() {
    router.refresh();
  }

  function runAction(label: string, action: PayrollActionFn) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result && "ok" in result && result.ok === false) {
          setMessage(result.error ?? `${label} failed`);
          return;
        }
        setMessage(`${label} complete`);
        refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : `${label} failed`);
      }
    });
  }

  function downloadCsv(label: string, action: PayrollCsvFn) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        downloadTextFile(result.csv, result.filename);
        setMessage(`${label} downloaded`);
        refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : `${label} failed`);
      }
    });
  }

  function handleTransition(to: PayrollStatus) {
    const fromIdx = PAYROLL_STATUSES_ORDER.indexOf(run.status as PayrollStatus);
    const toIdx = PAYROLL_STATUSES_ORDER.indexOf(to);
    const isBackward = fromIdx > toIdx;

    // Returning to draft is a common attendance fix path — don't block on a
    // cancelable prompt (browser prompts often feel like a no-op when dismissed).
    let comment: string | undefined;
    if (to === "draft") {
      comment = "Returned to draft";
    } else if (isBackward) {
      const entered = window.prompt(
        "Comment for sending this run back (optional):",
        `Returned to ${statusLabel(to)}`,
      );
      // Cancel → still proceed with a default note so the action isn't silent
      comment = entered?.trim() || `Returned to ${statusLabel(to)}`;
    } else {
      const entered = window.prompt("Optional comment:");
      comment = entered?.trim() || undefined;
    }

    runAction(`Move to ${statusLabel(to)}`, () =>
      transitionPayrollRun(run.id, to, comment),
    );
  }

  function handleSaveBudget() {
    const b = budget.trim() === "" ? null : Number(budget);
    const r = revenue.trim() === "" ? null : Number(revenue);
    if (b != null && Number.isNaN(b)) {
      setMessage("Budget must be a number");
      return;
    }
    if (r != null && Number.isNaN(r)) {
      setMessage("Revenue must be a number");
      return;
    }
    runAction("Update budget/revenue", () =>
      updatePayrollBudgetRevenue(run.id, b, r),
    );
  }

  function handleToggleIncluded(id: string, included: boolean) {
    const reason = !included
      ? (window.prompt("Reason for excluding (optional):") ?? undefined)
      : undefined;
    runAction(included ? "Include employee" : "Exclude employee", () =>
      setEmployeeIncluded(id, included, reason?.trim() || undefined),
    );
  }

  const paymentHint = run.payment_date
    ? ` · Payment ${formatDate(run.payment_date)}`
    : "";
  const countsHint = `${includedCount} included · ${excludedCount} excluded · ${joinerCount} joiners · ${leaverCount} leavers`;

  const departmentSummary = useMemo(() => {
    const byDept = new Map<
      string,
      { department: string; people: number; totalPay: number }
    >();
    for (const row of employees) {
      if (!row.included) continue;
      const name = row.department_name?.trim() || "No department";
      const key = name.toLowerCase();
      const existing = byDept.get(key);
      if (existing) {
        existing.people += 1;
        existing.totalPay += Number(row.net_salary) || 0;
      } else {
        byDept.set(key, {
          department: name,
          people: 1,
          totalPay: Number(row.net_salary) || 0,
        });
      }
    }
    return [...byDept.values()].sort((a, b) =>
      a.department.localeCompare(b.department, undefined, {
        sensitivity: "base",
      }),
    );
  }, [employees]);

  const departmentTotals = useMemo(() => {
    let people = 0;
    let totalPay = 0;
    for (const row of departmentSummary) {
      people += row.people;
      totalPay += row.totalPay;
    }
    return { people, totalPay };
  }, [departmentSummary]);

  const attendanceHref = `/hr/attendance/validation?from=${encodeURIComponent(run.period_start.slice(0, 10))}&to=${encodeURIComponent(run.period_end.slice(0, 10))}&payrollRunId=${encodeURIComponent(run.id)}`;
  const canReturnToDraft = nextStatuses.includes("draft");

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl text-[#3D421F]">
              {formatPayrollMonthLabel(run.payroll_month)}
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Period {formatDate(run.period_start)}
              {" → "}
              {formatDate(run.period_end)}
              {paymentHint}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-black/10 bg-[var(--venue-secondary,#F0F3DD)] px-2.5 py-0.5 text-xs font-medium text-[#3D421F]">
                {statusLabel(run.status)}
              </span>
              <span className="text-xs text-black/50">{countsHint}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={attendanceHref}
              className="inline-flex h-9 items-center justify-center rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-[#3D421F] transition hover:bg-[var(--venue-secondary,#F0F3DD)]/60"
            >
              Update attendance
            </Link>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-black/15 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary,#F0F3DD)]/60"
              disabled={pending || !editable}
              onClick={() =>
                runAction("Recalculate", () => recalculatePayrollRun(run.id))
              }
            >
              Recalculate
            </Button>
            {canReturnToDraft ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-black/15 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary,#F0F3DD)]/60"
                disabled={pending || !canEdit || locked}
                onClick={() => handleTransition("draft")}
              >
                ← Back to draft
              </Button>
            ) : null}
            {nextStatuses
              .filter((to) => to !== "draft")
              .map((to) => (
                <Button
                  key={to}
                  type="button"
                  size="sm"
                  disabled={pending || !canEdit || locked}
                  onClick={() => handleTransition(to)}
                >
                  {`→ ${statusLabel(to)}`}
                </Button>
              ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-black/15 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary,#F0F3DD)]/60"
              disabled={pending || !canEdit}
              onClick={() =>
                downloadCsv("WPS file", () => generateWpsFile(run.id))
              }
            >
              Generate WPS
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-black/15 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary,#F0F3DD)]/60"
              disabled={pending || !canEdit}
              onClick={() =>
                runAction("Mark paid", () => markPayrollPaid(run.id))
              }
            >
              Mark paid / lock
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-black/15 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary,#F0F3DD)]/60"
              disabled={pending || !canEdit}
              onClick={() =>
                runAction("Generate payslips", () => generatePayslips(run.id))
              }
            >
              Generate payslips
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-black/15 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary,#F0F3DD)]/60"
              disabled={pending || !canEdit}
              onClick={() =>
                downloadCsv("GL export", () => exportPayrollGl(run.id))
              }
            >
              Export GL
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-black/5 pt-4">
          <div className="space-y-1">
            <Label className="text-xs text-black/50">Budget (AED)</Label>
            <Input
              className="h-8 w-36"
              value={budget}
              disabled={!editable || pending}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-black/50">Revenue (AED)</Label>
            <Input
              className="h-8 w-36"
              value={revenue}
              disabled={!editable || pending}
              onChange={(e) => setRevenue(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!editable || pending}
            onClick={handleSaveBudget}
          >
            Save budget
          </Button>
          <p className="ml-auto text-sm text-black/55">
            Net {formatMoney(totals.netPayroll ?? null, canViewSalary)}
          </p>
        </div>

        {message ? (
          <p className="text-sm text-[#3D421F]">{message}</p>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-black/10 bg-white p-5 shadow-sm">
        <div>
          <h3 className="font-serif text-lg text-[#3D421F]">By department</h3>
          <p className="text-sm text-black/55">
            Included employees and net amount to pay per department.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-black/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Department</th>
                <th className="px-3 py-2.5 text-right font-medium">People</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Amount to pay
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {departmentSummary.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-8 text-center text-sm text-black/45"
                  >
                    No included employees yet.
                  </td>
                </tr>
              ) : (
                departmentSummary.map((row) => (
                  <tr key={row.department}>
                    <td className="px-3 py-2.5 text-[#3D421F]">
                      {row.department}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-black/70">
                      {row.people}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#3D421F]">
                      {formatMoney(row.totalPay, canViewSalary)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {departmentSummary.length > 0 ? (
              <tfoot className="border-t-2 border-black/10 bg-black/[0.03]">
                <tr className="font-medium text-[#3D421F]">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {departmentTotals.people}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatMoney(departmentTotals.totalPay, canViewSalary)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      {tab === "run" ? (
        <RunEmployeesTab
          employees={employees}
          linesByEmployee={linesByEmployee}
          expanded={expanded}
          setExpanded={setExpanded}
          canViewSalary={canViewSalary}
          editable={editable}
          pending={pending}
          onToggleIncluded={handleToggleIncluded}
        />
      ) : null}

      {tab === "exceptions" ? (
        <ExceptionsTab
          exceptions={exceptions}
          editable={editable}
          pending={pending}
          onWaive={(id) => {
            const comment = window.prompt("Waive comment:");
            if (!comment?.trim()) return;
            runAction("Waive exception", () =>
              waivePayrollException(id, comment.trim()),
            );
          }}
        />
      ) : null}

      {tab === "adjustments" ? (
        <AdjustmentsTab
          adjustments={adjustments}
          staffOptions={staffOptions}
          employeeByStaff={employeeByStaff}
          canViewSalary={canViewSalary}
          editable={editable}
          pending={pending}
          onAdd={(input) =>
            runAction("Add adjustment", () =>
              addPayrollAdjustment({ runId: run.id, ...input }),
            )
          }
        />
      ) : null}

      {tab === "settlements" ? (
        <SettlementsTab
          leavers={employees.filter((e) => e.is_leaver)}
          settlements={settlements}
          canViewSalary={canViewSalary}
          editable={editable}
          pending={pending}
          onSave={(input) =>
            runAction("Save settlement", () =>
              upsertSettlement({ runId: run.id, ...input }),
            )
          }
        />
      ) : null}

      {tab === "payments" ? (
        <PaymentsTab
          payments={payments}
          employeeById={employeeById}
          canViewSalary={canViewSalary}
          pending={pending}
          canEdit={canEdit}
          onGenerateWps={() =>
            downloadCsv("WPS file", () => generateWpsFile(run.id))
          }
        />
      ) : null}

      {events.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-serif text-lg text-[#3D421F]">Activity</h3>
          <ul className="divide-y divide-black/5 rounded-lg border border-black/10 bg-white text-sm">
            {events.map((ev) => (
              <li key={ev.id} className="px-3 py-2.5 text-black/65">
                <span className="font-medium text-[#3D421F]">
                  {ev.from_status
                    ? `${statusLabel(ev.from_status)} → ${statusLabel(ev.to_status)}`
                    : statusLabel(ev.to_status)}
                </span>
                {ev.comment ? ` · ${ev.comment}` : ""}
                <span className="ml-2 text-xs text-black/40">
                  {new Date(ev.created_at).toLocaleString("en-AE")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );

}

function RunEmployeesTab({
  employees,
  linesByEmployee,
  expanded,
  setExpanded,
  canViewSalary,
  editable,
  pending,
  onToggleIncluded,
}: {
  employees: PayrollEmployeeRow[];
  linesByEmployee: Map<string, PayrollLineRow[]>;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  onToggleIncluded: (id: string, included: boolean) => void;
}) {
  type SortKey =
    | "emp_no"
    | "full_name"
    | "department_name"
    | "working_status"
    | "paid_days"
    | "unpaid_days"
    | "fixed_earnings"
    | "variable_earnings"
    | "total_deductions"
    | "net_salary"
    | "included";
  type SortDir = "asc" | "desc";

  const [sortKey, setSortKey] = useState<SortKey>("emp_no");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [query, setQuery] = useState("");
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedWorkingStatuses, setSelectedWorkingStatuses] = useState<
    string[]
  >([]);
  const [selectedIncluded, setSelectedIncluded] = useState<string[]>([]);
  const [netFilter, setNetFilter] = useState<"all" | "zero" | "nonzero">(
    "all",
  );

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of employees) {
      names.add(row.department_name?.trim() || "No department");
    }
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [employees]);

  const workingStatusOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of employees) {
      names.add(resolvePayrollWorkingStatus(row));
    }
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [employees]);

  const includedOptions = ["Included", "Excluded"];

  function sortValue(
    row: PayrollEmployeeRow,
    key: SortKey,
  ): string | number | boolean {
    switch (key) {
      case "emp_no":
        return row.emp_no.toLowerCase();
      case "full_name":
        return row.full_name.toLowerCase();
      case "department_name":
        return (row.department_name ?? "").toLowerCase();
      case "working_status":
        return resolvePayrollWorkingStatus(row).toLowerCase();
      case "paid_days":
        return Number(row.paid_days);
      case "unpaid_days":
        return Number(row.unpaid_days);
      case "fixed_earnings":
        return Number(row.fixed_earnings);
      case "variable_earnings":
        return Number(row.variable_earnings);
      case "total_deductions":
        return Number(row.total_deductions);
      case "net_salary":
        return Number(row.net_salary);
      case "included":
        return row.included;
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(
      key === "emp_no" ||
        key === "full_name" ||
        key === "department_name" ||
        key === "working_status"
        ? "asc"
        : "desc",
    );
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const deptSet =
      selectedDepartments.length > 0 ? new Set(selectedDepartments) : null;
    const statusSet =
      selectedWorkingStatuses.length > 0
        ? new Set(selectedWorkingStatuses)
        : null;
    const includedSet =
      selectedIncluded.length > 0 ? new Set(selectedIncluded) : null;

    return employees.filter((row) => {
      const net = Number(row.net_salary) || 0;
      const isZeroNet = Math.abs(net) < 0.005;
      if (netFilter === "zero" && !isZeroNet) return false;
      if (netFilter === "nonzero" && isZeroNet) return false;
      if (deptSet) {
        const dept = row.department_name?.trim() || "No department";
        if (!deptSet.has(dept)) return false;
      }
      if (statusSet) {
        if (!statusSet.has(resolvePayrollWorkingStatus(row))) return false;
      }
      if (includedSet) {
        const label = row.included ? "Included" : "Excluded";
        if (!includedSet.has(label)) return false;
      }
      if (!q) return true;
      const status = resolvePayrollWorkingStatus(row).toLowerCase();
      return (
        row.full_name.toLowerCase().includes(q) ||
        row.emp_no.toLowerCase().includes(q) ||
        (row.department_name ?? "").toLowerCase().includes(q) ||
        status.includes(q)
      );
    });
  }, [
    employees,
    query,
    selectedDepartments,
    selectedWorkingStatuses,
    selectedIncluded,
    netFilter,
  ]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "boolean" && typeof bv === "boolean") {
        if (av === bv) return a.emp_no.localeCompare(b.emp_no);
        return (av === bv ? 0 : av ? 1 : -1) * dir;
      }
      if (typeof av === "number" && typeof bv === "number") {
        if (av === bv) return a.emp_no.localeCompare(b.emp_no);
        return (av - bv) * dir;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (cmp === 0) return a.emp_no.localeCompare(b.emp_no);
      return cmp * dir;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const columnTotals = useMemo(() => {
    let paidDays = 0;
    let unpaidDays = 0;
    let fixedEarnings = 0;
    let variableEarnings = 0;
    let totalDeductions = 0;
    let netSalary = 0;
    let includedCount = 0;
    for (const row of filtered) {
      paidDays += Number(row.paid_days) || 0;
      unpaidDays += Number(row.unpaid_days) || 0;
      fixedEarnings += Number(row.fixed_earnings) || 0;
      variableEarnings += Number(row.variable_earnings) || 0;
      totalDeductions += Number(row.total_deductions) || 0;
      netSalary += Number(row.net_salary) || 0;
      if (row.included) includedCount += 1;
    }
    return {
      employeeCount: filtered.length,
      includedCount,
      paidDays,
      unpaidDays,
      fixedEarnings,
      variableEarnings,
      totalDeductions,
      netSalary,
    };
  }, [filtered]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    selectedDepartments.length > 0 ||
    selectedWorkingStatuses.length > 0 ||
    selectedIncluded.length > 0 ||
    netFilter !== "all";

  function SortLabel({
    label,
    column,
    align = "start",
  }: {
    label: string;
    column: SortKey;
    align?: "start" | "center" | "end";
  }) {
    const active = sortKey === column;
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
        className={cn(
          "inline-flex w-full items-center gap-1 whitespace-nowrap transition-colors hover:text-[#3D421F]",
          align === "center" && "justify-center",
          align === "end" && "justify-end",
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

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-serif text-lg text-[#3D421F]">Employees</h3>
        <p className="text-sm text-black/55">
          Expand a row to see earnings and deduction lines. Click a column
          header to sort.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white/70 p-3">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Search
          </p>
          <Input
            className="h-9"
            placeholder="Name or emp no…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
            className="[&_button]:h-9 [&_button]:text-sm"
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
            className="[&_button]:h-9 [&_button]:text-sm"
          />
        </div>
        <div className="min-w-[9rem] w-36 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Included
          </p>
          <MultiSelect
            options={includedOptions}
            selected={selectedIncluded}
            onChange={setSelectedIncluded}
            placeholder="All"
            searchPlaceholder="Filter…"
            className="[&_button]:h-9 [&_button]:text-sm"
          />
        </div>
        <div className="min-w-[8rem] w-36 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Net
          </p>
          <select
            className={cn(lightSelectClass, "h-9")}
            value={netFilter}
            onChange={(e) =>
              setNetFilter(e.target.value as "all" | "zero" | "nonzero")
            }
            aria-label="Filter by net amount"
          >
            <option value="all">All</option>
            <option value="zero">Zero</option>
            <option value="nonzero">Non-zero</option>
          </select>
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSelectedDepartments([]);
              setSelectedWorkingStatuses([]);
              setSelectedIncluded([]);
              setNetFilter("all");
            }}
            className="mb-1.5 text-xs font-medium text-black/45 transition hover:text-[#3D421F]"
          >
            Clear filters
          </button>
        ) : null}
        <p className="mb-1.5 ml-auto text-xs text-black/45">
          Showing {filtered.length} of {employees.length}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel label="Emp no" column="emp_no" />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel label="Name" column="full_name" />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel label="Dept" column="department_name" />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel label="Status" column="working_status" />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel label="Paid days" column="paid_days" align="end" />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel label="Unpaid" column="unpaid_days" align="end" />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel label="Fixed" column="fixed_earnings" align="end" />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel
                  label="Variable"
                  column="variable_earnings"
                  align="end"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel
                  label="Deductions"
                  column="total_deductions"
                  align="end"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel label="Net" column="net_salary" align="end" />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel label="Included" column="included" align="center" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {employees.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No employees on this run yet. Recalculate to populate.
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No employees match the current filters.
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const open = expanded.has(row.id);
                const empLines = linesByEmployee.get(row.id) ?? [];
                return (
                  <FragmentRows
                    key={row.id}
                    row={row}
                    open={open}
                    empLines={empLines}
                    canViewSalary={canViewSalary}
                    editable={editable}
                    pending={pending}
                    onToggleExpand={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                    onToggleIncluded={onToggleIncluded}
                  />
                );
              })
            )}
          </tbody>
          {sorted.length > 0 ? (
            <tfoot className="border-t-2 border-black/10 bg-black/[0.03]">
              <tr className="font-medium text-[#3D421F]">
                <td colSpan={4} className="px-3 py-3 text-sm">
                  Totals
                  <span className="ml-2 text-xs font-normal text-black/50">
                    {columnTotals.employeeCount} employee
                    {columnTotals.employeeCount === 1 ? "" : "s"}
                    {" · "}
                    {columnTotals.includedCount} included
                    {hasActiveFilters ? " (filtered)" : ""}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {columnTotals.paidDays.toFixed(2)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {columnTotals.unpaidDays.toFixed(2)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(columnTotals.fixedEarnings, canViewSalary)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(columnTotals.variableEarnings, canViewSalary)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(columnTotals.totalDeductions, canViewSalary)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(columnTotals.netSalary, canViewSalary)}
                </td>
                <td className="px-3 py-3 text-center tabular-nums text-sm">
                  {columnTotals.includedCount}/{columnTotals.employeeCount}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}

function FragmentRows({
  row,
  open,
  empLines,
  canViewSalary,
  editable,
  pending,
  onToggleExpand,
  onToggleIncluded,
}: {
  row: PayrollEmployeeRow;
  open: boolean;
  empLines: PayrollLineRow[];
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  onToggleExpand: () => void;
  onToggleIncluded: (id: string, included: boolean) => void;
}) {
  return (
    <>
      <tr
        className={cn(
          "cursor-pointer hover:bg-[var(--venue-secondary,#F0F3DD)]/25",
          !row.included && "opacity-60",
        )}
        onClick={onToggleExpand}
      >
        <td className="px-3 py-2 font-mono text-xs text-[#3D421F]">
          <Link
            href={`/hr/${row.staff_id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Open staff directory entry"
            className="rounded text-[var(--venue-primary,#818a40)] underline-offset-2 transition hover:bg-[var(--venue-secondary,#F0F3DD)] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.emp_no}
          </Link>
        </td>
        <td className="px-3 py-2 text-[#3D421F]">
          {row.full_name}
          {row.is_new_joiner ? (
            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-black/40">
              joiner
            </span>
          ) : null}
          {row.is_leaver ? (
            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-black/40">
              leaver
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2 text-black/60">
          {row.department_name ?? "—"}
        </td>
        <td className="px-3 py-2">
          <WorkingStatusBadge status={resolvePayrollWorkingStatus(row)} />
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {Number(row.paid_days).toFixed(2)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {Number(row.unpaid_days).toFixed(2)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(row.fixed_earnings, canViewSalary)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(row.variable_earnings, canViewSalary)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(row.total_deductions, canViewSalary)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums font-medium text-[#3D421F]">
          {formatMoney(row.net_salary, canViewSalary)}
        </td>
        <td
          className="px-3 py-2 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={row.included}
            disabled={!editable || pending}
            onChange={(e) => onToggleIncluded(row.id, e.target.checked)}
            className="h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
            aria-label={`Include ${row.full_name}`}
          />
        </td>
      </tr>
      {open ? (
        <tr className="bg-black/[0.015]">
          <td colSpan={11} className="px-4 py-3">
            {empLines.length === 0 ? (
              <p className="text-xs text-black/45">No lines for this employee.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-black/45">
                    <th className="py-1 font-medium">Category</th>
                    <th className="py-1 font-medium">Code</th>
                    <th className="py-1 font-medium">Label</th>
                    <th className="py-1 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {[...empLines]
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((line) => (
                      <tr key={line.id} className="border-t border-black/5">
                        <td className="py-1.5 capitalize text-black/55">
                          {line.category}
                        </td>
                        <td className="py-1.5 font-mono">{line.code}</td>
                        <td className="py-1.5">{line.label}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatMoney(line.amount, canViewSalary)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
            {row.exclude_reason ? (
              <p className="mt-2 text-xs text-amber-800/80">
                Exclude reason: {row.exclude_reason}
              </p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ExceptionsTab({
  exceptions,
  editable,
  pending,
  onWaive,
}: {
  exceptions: PayrollExceptionRow[];
  editable: boolean;
  pending: boolean;
  onWaive: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-serif text-lg text-[#3D421F]">Exceptions</h3>
        <p className="text-sm text-black/55">
          Blocking items should be resolved or waived before advancing the run.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2.5 font-medium">Severity</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Emp</th>
              <th className="px-3 py-2.5 font-medium">Message</th>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {exceptions.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No exceptions for this run.
                </td>
              </tr>
            ) : (
              exceptions.map((ex) => (
                <tr
                  key={ex.id}
                  className={cn(ex.waived && "opacity-50")}
                >
                  <td className="px-3 py-2 capitalize">
                    <SeverityBadge severity={ex.severity} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {ex.exception_type}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {ex.emp_no ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-black/70">{ex.message}</td>
                  <td className="px-3 py-2 text-black/50">
                    {formatDate(ex.work_date)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!ex.waived && editable ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => onWaive(ex.id)}
                      >
                        Waive
                      </Button>
                    ) : ex.waived ? (
                      <span className="text-xs text-black/40">Waived</span>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const tone =
    severity === "blocking"
      ? "border-red-200 bg-red-50 text-red-800"
      : severity === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-black/10 bg-black/[0.03] text-black/60";
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone,
      )}
    >
      {severity}
    </span>
  );
}

function AdjustmentsTab({
  adjustments,
  staffOptions,
  employeeByStaff,
  canViewSalary,
  editable,
  pending,
  onAdd,
}: {
  adjustments: PayrollAdjustmentRow[];
  staffOptions: PayrollStaffOption[];
  employeeByStaff: Map<string, PayrollEmployeeRow>;
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  onAdd: (input: {
    staffId: string;
    category: PayrollLineCategory;
    code: string;
    label: string;
    amount?: number | null;
    percentOfDailyRate?: number | null;
    daysApplied?: number | null;
    reason: string;
  }) => void;
}) {
  const [staffId, setStaffId] = useState(staffOptions[0]?.id ?? "");
  const [category, setCategory] = useState<PayrollLineCategory>("variable");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-serif text-lg text-[#3D421F]">Adjustments</h3>
        <p className="text-sm text-black/55">
          Manual earnings or deductions. Use amount, or percent of daily rate ×
          days.
        </p>
      </div>

      {editable ? (
        <form
          className="grid gap-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!staffId || !code.trim() || !label.trim() || !reason.trim()) {
              return;
            }
            const amountNum = amount.trim() === "" ? null : Number(amount);
            const percentNum = percent.trim() === "" ? null : Number(percent);
            const daysNum = days.trim() === "" ? null : Number(days);
            if (amountNum == null && (percentNum == null || daysNum == null)) {
              return;
            }
            onAdd({
              staffId,
              category,
              code: code.trim(),
              label: label.trim(),
              amount: amountNum,
              percentOfDailyRate: percentNum,
              daysApplied: daysNum,
              reason: reason.trim(),
            });
            setCode("");
            setLabel("");
            setAmount("");
            setPercent("");
            setDays("");
            setReason("");
          }}
        >
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label>Staff</Label>
            <select
              className={lightSelectClass}
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              required
            >
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emp_no} — {s.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select
              className={lightSelectClass}
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as PayrollLineCategory)
              }
            >
              <option value="fixed">Fixed</option>
              <option value="variable">Variable</option>
              <option value="deduction">Deduction</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input
              className="h-8"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input
              className="h-8"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (AED)</Label>
            <Input
              className="h-8"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>% of daily rate</Label>
            <Input
              className="h-8"
              type="number"
              step="0.01"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Days applied</Label>
            <Input
              className="h-8"
              type="number"
              step="0.01"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Reason</Label>
            <Input
              className="h-8"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={pending || !staffId}>
              Add adjustment
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2.5 font-medium">Staff</th>
              <th className="px-3 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Code</th>
              <th className="px-3 py-2.5 font-medium">Label</th>
              <th className="px-3 py-2.5 font-medium text-right">Amount</th>
              <th className="px-3 py-2.5 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {adjustments.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No adjustments yet.
                </td>
              </tr>
            ) : (
              adjustments.map((adj) => {
                const emp = employeeByStaff.get(adj.staff_id);
                return (
                  <tr key={adj.id}>
                    <td className="px-3 py-2">
                      {emp
                        ? `${emp.emp_no} — ${emp.full_name}`
                        : adj.staff_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 capitalize">{adj.category}</td>
                    <td className="px-3 py-2 font-mono text-xs">{adj.code}</td>
                    <td className="px-3 py-2">{adj.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(adj.amount, canViewSalary)}
                    </td>
                    <td className="px-3 py-2 text-black/60">{adj.reason}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SettlementsTab({
  leavers,
  settlements,
  canViewSalary,
  editable,
  pending,
  onSave,
}: {
  leavers: PayrollEmployeeRow[];
  settlements: PayrollSettlementRow[];
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  onSave: (input: {
    runEmployeeId: string;
    staffId: string;
    terminationDate?: string | null;
    leaveEncashment?: number;
    outstandingAdvances?: number;
    eosbAmount?: number;
    otherAmount?: number;
    netSettlement?: number;
    includeInRun?: boolean;
    notes?: string | null;
  }) => void;
}) {
  const byEmployee = new Map(
    settlements.map((s) => [s.run_employee_id, s]),
  );

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-serif text-lg text-[#3D421F]">Settlements</h3>
        <p className="text-sm text-black/55">
          Final settlement amounts for leavers in this run.
        </p>
      </div>
      {leavers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-12 text-center text-sm text-black/50">
          No leavers on this run.
        </div>
      ) : (
        <ul className="space-y-4">
          {leavers.map((emp) => {
            const existing = byEmployee.get(emp.id);
            return (
              <li
                key={emp.id}
                className="rounded-xl border border-black/10 bg-white p-4 shadow-sm"
              >
                <SettlementForm
                  employee={emp}
                  existing={existing}
                  canViewSalary={canViewSalary}
                  editable={editable}
                  pending={pending}
                  onSave={onSave}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SettlementForm({
  employee,
  existing,
  canViewSalary,
  editable,
  pending,
  onSave,
}: {
  employee: PayrollEmployeeRow;
  existing: PayrollSettlementRow | undefined;
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  onSave: (input: {
    runEmployeeId: string;
    staffId: string;
    terminationDate?: string | null;
    leaveEncashment?: number;
    outstandingAdvances?: number;
    eosbAmount?: number;
    otherAmount?: number;
    netSettlement?: number;
    includeInRun?: boolean;
    notes?: string | null;
  }) => void;
}) {
  const [terminationDate, setTerminationDate] = useState(
    existing?.termination_date?.slice(0, 10) ?? "",
  );
  const [leaveEncashment, setLeaveEncashment] = useState(
    String(existing?.leave_encashment ?? 0),
  );
  const [advances, setAdvances] = useState(
    String(existing?.outstanding_advances ?? 0),
  );
  const [eosb, setEosb] = useState(String(existing?.eosb_amount ?? 0));
  const [other, setOther] = useState(String(existing?.other_amount ?? 0));
  const [net, setNet] = useState(String(existing?.net_settlement ?? 0));
  const [includeInRun, setIncludeInRun] = useState(
    existing?.include_in_run ?? true,
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          runEmployeeId: employee.id,
          staffId: employee.staff_id,
          terminationDate: terminationDate || null,
          leaveEncashment: Number(leaveEncashment) || 0,
          outstandingAdvances: Number(advances) || 0,
          eosbAmount: Number(eosb) || 0,
          otherAmount: Number(other) || 0,
          netSettlement: Number(net) || 0,
          includeInRun,
          notes: notes.trim() || null,
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-[#3D421F]">
            {employee.emp_no} — {employee.full_name}
          </p>
          <p className="text-xs text-black/45">
            Net pay {formatMoney(employee.net_salary, canViewSalary)}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            checked={includeInRun}
            disabled={!editable || pending}
            onChange={(e) => setIncludeInRun(e.target.checked)}
            className="h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
          />
          Include in run
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Termination date</Label>
          <Input
            type="date"
            className="h-8"
            value={terminationDate}
            disabled={!editable || pending}
            onChange={(e) => setTerminationDate(e.target.value)}
          />
        </div>
        {(
          [
            ["Leave encashment", leaveEncashment, setLeaveEncashment],
            ["Outstanding advances", advances, setAdvances],
            ["EOSB", eosb, setEosb],
            ["Other", other, setOther],
            ["Net settlement", net, setNet],
          ] as const
        ).map(([label, value, setter]) => (
          <div key={label} className="space-y-1.5">
            <Label>{label}</Label>
            <Input
              type="number"
              step="0.01"
              className="h-8"
              value={value}
              disabled={!editable || pending || !canViewSalary}
              onChange={(e) => setter(e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Input
          className="h-8"
          value={notes}
          disabled={!editable || pending}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {editable ? (
        <Button type="submit" size="sm" disabled={pending}>
          Save settlement
        </Button>
      ) : null}
    </form>
  );
}

function PaymentsTab({
  payments,
  employeeById,
  canViewSalary,
  pending,
  canEdit,
  onGenerateWps,
}: {
  payments: PayrollPaymentRow[];
  employeeById: Map<string, PayrollEmployeeRow>;
  canViewSalary: boolean;
  pending: boolean;
  canEdit: boolean;
  onGenerateWps: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg text-[#3D421F]">Payments</h3>
          <p className="text-sm text-black/55">
            Payment rows for WPS / bank transfer processing.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || !canEdit}
          onClick={onGenerateWps}
        >
          Generate WPS
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2.5 font-medium">Employee</th>
              <th className="px-3 py-2.5 font-medium">WPS ID</th>
              <th className="px-3 py-2.5 font-medium">IBAN</th>
              <th className="px-3 py-2.5 font-medium text-right">Net</th>
              <th className="px-3 py-2.5 font-medium">Method</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {payments.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No payment rows yet.
                </td>
              </tr>
            ) : (
              payments.map((p) => {
                const emp = employeeById.get(p.run_employee_id);
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-[#3D421F]">
                      {emp
                        ? `${emp.emp_no} — ${emp.full_name}`
                        : p.staff_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {p.wps_employee_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {p.iban ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(p.net_salary, canViewSalary)}
                    </td>
                    <td className="px-3 py-2 capitalize">
                      {p.payment_method.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2 capitalize">
                      {p.status.replace(/_/g, " ")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
