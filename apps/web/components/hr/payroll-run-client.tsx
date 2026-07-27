"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import {
  addPayrollAdjustment,
  updatePayrollAdjustment,
  deletePayrollAdjustment,
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
  adjustmentCodesForCategory,
  canEditPayrollRun,
  defaultLabelForAdjustmentCode,
  isInternalAdjustmentCode,
  adjustmentFoldsIntoFixedPay,
  isSalaryCorrectionCode,
  isNewJoinerCorrectionCode,
  inferOrphanedInternalAdjustment,
  isOrphanPayrollAdjustment,
  formatPayrollMonthLabel,
  DEFAULT_PAYROLL_ADJUSTMENT_CODES,
  resolveManualAdjustmentAmount,
  isPayrollLocked,
  summarizePayrollLeave,
  parsePayrollRunTab,
  payrollOverRevenuePct,
  type PayrollAdjustmentCodeConfig,
  type PayrollDayFraction,
  type PayrollLineCategory,
  PAYROLL_LINE_CATEGORY_LABELS,
  type PayrollPeriodNetRevenue,
  type PayrollRunTab,
  type PayrollStatus,
} from "@/lib/hr/payroll";
import {
  resolveWorkingStatus,
  type WorkingStatusLabel,
} from "@/lib/hr/working-status";
import { downloadTextFile } from "@/lib/sales/vouchers-export";
import { cn } from "@/lib/utils";

const lightSelectClass =
  "flex h-8 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(1)}%`;
}

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

/** Signed payroll line amount — deductions reduce the net total. */
function signedPayrollLineAmount(
  line: Pick<PayrollLineRow, "category" | "amount">,
): number {
  const amount = Number(line.amount || 0);
  return line.category === "deduction" ? -amount : amount;
}

function adjustmentForPayLine(
  line: PayrollLineRow,
  adjustments: PayrollAdjustmentRow[],
): PayrollAdjustmentRow | undefined {
  const byCode = adjustments.find(
    (adj) =>
      adj.code.toUpperCase() === line.code.toUpperCase() &&
      adj.category === line.category,
  );
  if (byCode) return byCode;
  return adjustments.find(
    (adj) =>
      adj.code.toUpperCase() === line.code.toUpperCase() &&
      adj.category === line.category &&
      Math.abs(Number(adj.amount) - Number(line.amount)) < 0.01,
  );
}

/** Full-month contracted package amount for a fixed pay line code. */
function contractedAmountForLine(
  code: string,
  row: Pick<
    PayrollEmployeeRow,
    "basic_salary" | "accom_allowance" | "transp_allowance"
  >,
): number | null {
  switch (code) {
    case "BASIC":
      return row.basic_salary;
    case "ACCOM":
    case "ACCOM_WITHHELD":
      return row.accom_allowance;
    case "TRANSP":
    case "TRANSP_WITHHELD":
      return row.transp_allowance;
    default:
      return null;
  }
}

/** @see resolveWorkingStatus */
export function resolvePayrollWorkingStatus(
  row: Pick<
    PayrollEmployeeRow,
    "working_status" | "is_leaver" | "paid_days" | "unpaid_days"
  >,
): WorkingStatusLabel {
  return resolveWorkingStatus({
    workingStatus: row.working_status,
    isOffBoarding: row.is_leaver,
    paidDays: row.paid_days,
    unpaidDays: row.unpaid_days,
  });
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
  /** Paid days after internal adjustments (payslip); falls back to paid_days. */
  effective_paid_days: number;
  unpaid_days: number;
  daily_rate: number | null;
  /** Contracted monthly package components (full month). */
  basic_salary: number | null;
  accom_allowance: number | null;
  transp_allowance: number | null;
  fixed_earnings: number;
  variable_earnings: number;
  total_deductions: number;
  net_salary: number;
  joining_date: string | null;
  termination_date: string | null;
  /** Day-fraction snapshot from calculation (leave breakdown source). */
  day_fractions: PayrollDayFraction[];
};

export type PayrollLineRow = {
  id: string;
  run_employee_id: string;
  category: string;
  code: string;
  label: string;
  amount: number;
  quantity?: number | null;
  sort_order: number;
  source?: string | null;
};

/** Days used to calculate this pay line (paid days for fixed, leave days for deductions, etc.). */
function payLineDays(
  line: Pick<PayrollLineRow, "code" | "quantity">,
  row: Pick<
    PayrollEmployeeRow,
    "paid_days" | "effective_paid_days" | "unpaid_days"
  >,
): number | null {
  if (line.quantity != null && !Number.isNaN(Number(line.quantity))) {
    return Number(line.quantity);
  }
  switch (line.code) {
    case "BASIC":
    case "ACCOM":
    case "TRANSP":
      return row.effective_paid_days;
    case "UNPAID_LEAVE":
      return row.unpaid_days;
    default:
      return null;
  }
}

function formatPayLineDays(days: number | null): string {
  if (days == null) return "—";
  return days.toFixed(2);
}

function payrollCategoryLabel(category: string): string {
  return (
    PAYROLL_LINE_CATEGORY_LABELS[category as PayrollLineCategory] ?? category
  );
}

const SYSTEM_PAYROLL_LINE_CODES = new Set([
  "BASIC",
  "ACCOM",
  "TRANSP",
  "ACCOM_WITHHELD",
  "TRANSP_WITHHELD",
  "UNPAID_LEAVE",
  "TIPS",
  "SERVICE_CHARGE",
  "COMPENSATION",
  "BENEFIT_OTHER",
]);

function isEditablePayLine(
  line: Pick<PayrollLineRow, "code" | "category" | "source">,
  catalog: PayrollAdjustmentCodeConfig[] = DEFAULT_PAYROLL_ADJUSTMENT_CODES,
): boolean {
  if (line.source === "adjustment" || line.source === "manual") return true;
  if (SYSTEM_PAYROLL_LINE_CODES.has(line.code)) return false;
  return catalog.some(
    (c) => c.code === line.code && c.category === line.category,
  );
}

function draftAdjustmentFromLine(
  line: PayrollLineRow,
  staffId: string,
): PayrollAdjustmentRow {
  return {
    id: "",
    staff_id: staffId,
    category: line.category,
    code: line.code,
    label: line.label,
    amount: Number(line.amount),
    percent_of_daily_rate: null,
    days_applied: null,
    reason: "",
    created_at: "",
  };
}

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
  periodNetRevenue: PayrollPeriodNetRevenue | null;
  adjustmentCodes?: PayrollAdjustmentCodeConfig[];
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
  tab: _tab,
  run,
  employees,
  lines,
  exceptions,
  adjustments,
  settlements,
  payments,
  events,
  staffOptions: _staffOptions,
  canViewSalary,
  canEdit,
  periodNetRevenue,
  adjustmentCodes = DEFAULT_PAYROLL_ADJUSTMENT_CODES,
}: PayrollRunClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parsePayrollRunTab(searchParams.get("tab"));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [budget, setBudget] = useState(
    run.budget_amount != null ? String(run.budget_amount) : "",
  );
  const [departmentSummaryOpen, setDepartmentSummaryOpen] = useState(false);
  const [budgetSectionOpen, setBudgetSectionOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const venueNetRevenue =
    periodNetRevenue?.netRevenue ?? run.revenue_amount ?? null;
  const payrollRevenuePct = payrollOverRevenuePct(
    (run.totals as Record<string, number> | null)?.netPayroll,
    venueNetRevenue,
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
    if (b != null && Number.isNaN(b)) {
      setMessage("Budget must be a number");
      return;
    }
    runAction("Update budget", () =>
      updatePayrollBudgetRevenue(run.id, b, venueNetRevenue),
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

        <button
          type="button"
          aria-expanded={budgetSectionOpen}
          onClick={() => setBudgetSectionOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 border-t border-black/5 pt-4 text-left transition hover:bg-black/[0.02] -mx-1 px-1 rounded-md"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-[#3D421F]">
              Budget & revenue
            </span>
            <span className="text-sm text-black/55">
              Net Payroll {formatMoney(totals.netPayroll ?? null, canViewSalary)}
            </span>
            {venueNetRevenue != null ? (
              <span className="text-sm text-black/55">
                Revenue {formatMoney(venueNetRevenue, canViewSalary)}
              </span>
            ) : null}
            {payrollRevenuePct != null ? (
              <span className="text-sm font-medium text-[#3D421F]">
                {formatPct(payrollRevenuePct)} payroll / revenue
              </span>
            ) : null}
          </div>
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-black/45 transition-transform",
              budgetSectionOpen && "rotate-180",
            )}
          />
        </button>
        {budgetSectionOpen ? (
          <div className="flex flex-wrap items-end gap-4 pt-3">
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
              <Label className="text-xs text-black/50">
                Venue net revenue (AED)
              </Label>
              <p className="flex h-8 items-center tabular-nums text-sm font-medium text-[#3D421F]">
                {formatMoney(venueNetRevenue, canViewSalary)}
              </p>
              {periodNetRevenue ? (
                <p className="text-[11px] text-black/45">
                  From daily sales · {periodNetRevenue.daysWithSales} of{" "}
                  {periodNetRevenue.daysInPeriod} days in period
                </p>
              ) : (
                <p className="text-[11px] text-black/45">
                  No daily sales loaded for this period
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-black/50">
                Payroll / revenue
              </Label>
              <p className="flex h-8 items-center tabular-nums text-sm font-medium text-[#3D421F]">
                {formatPct(payrollRevenuePct)}
              </p>
              <p className="text-[11px] text-black/45">
                Net payroll ÷ venue net revenue
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!editable || pending}
              onClick={handleSaveBudget}
            >
              Save budget
            </Button>
          </div>
        ) : null}

        {message ? (
          <p className="text-sm text-[#3D421F]">{message}</p>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-black/10 bg-white p-5 shadow-sm">
        <button
          type="button"
          aria-expanded={departmentSummaryOpen}
          onClick={() => setDepartmentSummaryOpen((open) => !open)}
          className="flex w-full items-start justify-between gap-3 rounded-md text-left transition hover:bg-black/[0.02] -m-1 p-1"
        >
          <div>
            <h3 className="font-serif text-lg text-[#3D421F]">By department</h3>
            <p className="text-sm text-black/55">
              Included employees and net amount to pay per department.
            </p>
          </div>
          <ChevronDown
            className={cn(
              "mt-1 h-5 w-5 shrink-0 text-black/45 transition-transform",
              departmentSummaryOpen && "rotate-180",
            )}
          />
        </button>
        {departmentSummaryOpen ? (
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
        ) : null}
      </div>

      {tab === "run" ? (
        <RunEmployeesTab
          employees={employees}
          linesByEmployee={linesByEmployee}
          adjustments={adjustments}
          adjustmentCodes={adjustmentCodes}
          periodStart={run.period_start}
          periodEnd={run.period_end}
          expanded={expanded}
          setExpanded={setExpanded}
          canViewSalary={canViewSalary}
          editable={editable}
          pending={pending}
          onToggleIncluded={handleToggleIncluded}
          onAddAdjustment={(input) =>
            runAction("Add adjustment", () =>
              addPayrollAdjustment({ runId: run.id, ...input }),
            )
          }
          onUpdateAdjustment={(adjustmentId, input) =>
            runAction("Update adjustment", () =>
              updatePayrollAdjustment({
                runId: run.id,
                adjustmentId,
                ...input,
              }),
            )
          }
          onDeleteAdjustment={(adjustmentId) =>
            runAction("Delete adjustment", () =>
              deletePayrollAdjustment({
                runId: run.id,
                adjustmentId,
              }),
            )
          }
          onRecalculateRun={() =>
            runAction("Recalculate", () => recalculatePayrollRun(run.id))
          }
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
          employeeByStaff={employeeByStaff}
          adjustmentCodes={adjustmentCodes}
          canViewSalary={canViewSalary}
          editable={editable}
          pending={pending}
          onUpdateAdjustment={(adjustmentId, input) =>
            runAction("Update adjustment", () =>
              updatePayrollAdjustment({
                runId: run.id,
                adjustmentId,
                ...input,
              }),
            )
          }
          onDeleteAdjustment={(adjustmentId) =>
            runAction("Delete adjustment", () =>
              deletePayrollAdjustment({
                runId: run.id,
                adjustmentId,
              }),
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
          <button
            type="button"
            aria-expanded={activityOpen}
            onClick={() => setActivityOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 rounded-md text-left transition hover:bg-black/[0.02] -m-1 p-1"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-serif text-lg text-[#3D421F]">Activity</h3>
              <span className="text-sm text-black/55">
                {events.length} event{events.length === 1 ? "" : "s"}
              </span>
            </div>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 text-black/45 transition-transform",
                activityOpen && "rotate-180",
              )}
            />
          </button>
          {activityOpen ? (
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
          ) : null}
        </section>
      ) : null}
    </div>
  );

}

type AdjustmentInput = {
  staffId: string;
  category: PayrollLineCategory;
  code: string;
  label: string;
  amount?: number | null;
  percentOfDailyRate?: number | null;
  daysApplied?: number | null;
  reason: string;
};

function formValuesFromAdjustment(adj: PayrollAdjustmentRow): {
  category: PayrollLineCategory;
  code: string;
  label: string;
  amount: string;
  percent: string;
  days: string;
  reason: string;
} {
  const hasRateBased =
    adj.percent_of_daily_rate != null || adj.days_applied != null;
  return {
    category: adj.category as PayrollLineCategory,
    code: adj.code,
    label: adj.label,
    amount: hasRateBased ? "" : String(adj.amount),
    percent:
      adj.percent_of_daily_rate != null
        ? String(adj.percent_of_daily_rate)
        : "",
    days: adj.days_applied != null ? String(adj.days_applied) : "",
    reason: adj.reason,
  };
}

function formatAdjustmentMeta(adj: PayrollAdjustmentRow): string | null {
  const parts: string[] = [];
  if (adj.days_applied != null) {
    parts.push(`${adj.days_applied} day${adj.days_applied === 1 ? "" : "s"}`);
  }
  if (adj.percent_of_daily_rate != null) {
    parts.push(`${adj.percent_of_daily_rate}% of daily rate`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function EmployeeAdjustmentsTable({
  adjustments,
  canViewSalary,
  editable,
  pending,
  onEdit,
  onDelete,
  onCreate,
}: {
  adjustments: PayrollAdjustmentRow[];
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  onEdit: (adj: PayrollAdjustmentRow) => void;
  onDelete: (adj: PayrollAdjustmentRow) => void;
  onCreate?: () => void;
}) {
  if (adjustments.length === 0) return null;

  return (
    <div className="rounded-md border border-black/10 bg-white/80 px-3 py-2.5 text-zinc-700">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-800">
          Adjustments
          <span className="ml-1.5 font-normal text-zinc-500">
            · {adjustments.length}
          </span>
        </p>
        {editable && onCreate ? (
          <button
            type="button"
            disabled={pending}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-black/10 bg-white px-2 text-xs font-medium text-[#3D421F] transition hover:bg-black/[0.03] disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              onCreate();
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Create adjustment
          </button>
        ) : null}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-zinc-500">
            <th className="py-1 font-medium">Category</th>
            <th className="py-1 font-medium">Code</th>
            <th className="py-1 font-medium">Label</th>
            <th className="py-1 text-center font-medium">Days / rate</th>
            <th className="py-1 text-center font-medium">Amount</th>
            <th className="py-1 font-medium">Reason</th>
            {editable ? (
              <th className="py-1 text-right font-medium w-20" />
            ) : null}
          </tr>
        </thead>
        <tbody>
          {adjustments.map((adj) => {
            const orphan = isOrphanPayrollAdjustment(adj);
            return (
            <tr
              key={adj.id || `orphan-${adj.code}-${adj.days_applied}`}
              className={cn("border-t border-black/5", orphan && "bg-amber-50/50")}
            >
              <td className="py-1.5 text-zinc-600">
                {payrollCategoryLabel(adj.category)}
              </td>
              <td className="py-1.5 font-mono text-zinc-700">{adj.code}</td>
              <td className="py-1.5 text-zinc-700">
                {adj.label}
                {isInternalAdjustmentCode(adj.code) ? (
                  <span className="ml-1.5 inline-flex rounded bg-[var(--venue-secondary,#F0F3DD)] px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/50">
                    Not on payslip
                  </span>
                ) : adjustmentFoldsIntoFixedPay({
                    code: adj.code,
                    category: adj.category as PayrollLineCategory,
                    daysApplied: adj.days_applied,
                    percentOfDailyRate: adj.percent_of_daily_rate,
                  }) ? (
                  <span className="ml-1.5 inline-flex rounded bg-[var(--venue-secondary,#F0F3DD)] px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/50">
                    In fixed pay
                  </span>
                ) : null}
                {orphan ? (
                  <span className="ml-1.5 inline-flex rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                    Unsaved record
                  </span>
                ) : null}
              </td>
              <td className="py-1.5 text-center text-zinc-600">
                {formatAdjustmentMeta(adj) ?? "—"}
              </td>
              <td className="py-1.5 text-center tabular-nums text-zinc-800">
                {formatMoney(
                  adj.category === "deduction" ? -adj.amount : adj.amount,
                  canViewSalary,
                )}
              </td>
              <td className="py-1.5 text-zinc-600">{adj.reason}</td>
              {editable ? (
                <td className="py-1.5 text-right">
                  <AdjustmentActions
                    adjustment={adj}
                    pending={pending}
                    isOrphan={orphan}
                    onEdit={() => onEdit(adj)}
                    onDelete={() => onDelete(adj)}
                  />
                </td>
              ) : null}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function confirmDeleteAdjustment(adj: Pick<PayrollAdjustmentRow, "code" | "label">): boolean {
  return window.confirm(
    `Delete adjustment ${adj.code} — ${adj.label}? Payroll will be recalculated.`,
  );
}

function AdjustmentActions({
  adjustment,
  pending,
  isOrphan = false,
  onEdit,
  onDelete,
}: {
  adjustment: PayrollAdjustmentRow;
  pending: boolean;
  isOrphan?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="inline-flex items-center justify-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="inline-flex items-center rounded p-1 text-black/40 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
        aria-label={`Edit ${adjustment.code} adjustment`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          const message = isOrphan
            ? "Remove this internal adjustment effect and recalculate from attendance days?"
            : undefined;
          if (message ? window.confirm(message) : confirmDeleteAdjustment(adjustment)) {
            onDelete();
          }
        }}
        className="inline-flex items-center rounded p-1 text-black/40 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
        aria-label={`Delete ${adjustment.code} adjustment`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RunEmployeesTab({
  employees,
  linesByEmployee,
  adjustments,
  adjustmentCodes,
  periodStart,
  periodEnd,
  expanded,
  setExpanded,
  canViewSalary,
  editable,
  pending,
  onToggleIncluded,
  onAddAdjustment,
  onUpdateAdjustment,
  onDeleteAdjustment,
  onRecalculateRun,
}: {
  employees: PayrollEmployeeRow[];
  linesByEmployee: Map<string, PayrollLineRow[]>;
  adjustments: PayrollAdjustmentRow[];
  adjustmentCodes: PayrollAdjustmentCodeConfig[];
  periodStart: string;
  periodEnd: string;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  onToggleIncluded: (id: string, included: boolean) => void;
  onAddAdjustment: (input: AdjustmentInput) => void;
  onUpdateAdjustment: (adjustmentId: string, input: AdjustmentInput) => void;
  onDeleteAdjustment: (adjustmentId: string) => void;
  onRecalculateRun: () => void;
}) {
  const adjustmentsByStaff = useMemo(() => {
    const map = new Map<string, PayrollAdjustmentRow[]>();
    for (const adj of adjustments) {
      const list = map.get(adj.staff_id) ?? [];
      list.push(adj);
      map.set(adj.staff_id, list);
    }
    return map;
  }, [adjustments]);
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
  const [joinerLeaverFilter, setJoinerLeaverFilter] = useState<
    "all" | "joiner" | "leaver"
  >("all");

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
        return Number(row.effective_paid_days);
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
      if (joinerLeaverFilter === "joiner" && !row.is_new_joiner) return false;
      if (joinerLeaverFilter === "leaver" && !row.is_leaver) return false;
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
    joinerLeaverFilter,
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
      paidDays += Number(row.effective_paid_days) || 0;
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
    netFilter !== "all" ||
    joinerLeaverFilter !== "all";

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
        <div className="min-w-[8rem] w-36 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Joiner / leaver
          </p>
          <select
            className={cn(lightSelectClass, "h-9")}
            value={joinerLeaverFilter}
            onChange={(e) =>
              setJoinerLeaverFilter(
                e.target.value as "all" | "joiner" | "leaver",
              )
            }
            aria-label="Filter by joiner or leaver"
          >
            <option value="all">All</option>
            <option value="joiner">Joiner</option>
            <option value="leaver">Leaver</option>
          </select>
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
              setJoinerLeaverFilter("all");
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
                const empAdjustments =
                  adjustmentsByStaff.get(row.staff_id) ?? [];
                return (
                  <FragmentRows
                    key={row.id}
                    row={row}
                    open={open}
                    empLines={empLines}
                    empAdjustments={empAdjustments}
                    adjustmentCodes={adjustmentCodes}
                    periodStart={periodStart}
                    periodEnd={periodEnd}
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
                    onAddAdjustment={onAddAdjustment}
                    onUpdateAdjustment={onUpdateAdjustment}
                    onDeleteAdjustment={onDeleteAdjustment}
                    onRecalculateRun={onRecalculateRun}
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
  empAdjustments,
  adjustmentCodes,
  periodStart,
  periodEnd,
  canViewSalary,
  editable,
  pending,
  onToggleExpand,
  onToggleIncluded,
  onAddAdjustment,
  onUpdateAdjustment,
  onDeleteAdjustment,
  onRecalculateRun,
}: {
  row: PayrollEmployeeRow;
  open: boolean;
  empLines: PayrollLineRow[];
  empAdjustments: PayrollAdjustmentRow[];
  adjustmentCodes: PayrollAdjustmentCodeConfig[];
  periodStart: string;
  periodEnd: string;
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  onToggleExpand: () => void;
  onToggleIncluded: (id: string, included: boolean) => void;
  onAddAdjustment: (input: AdjustmentInput) => void;
  onUpdateAdjustment: (adjustmentId: string, input: AdjustmentInput) => void;
  onDeleteAdjustment: (adjustmentId: string) => void;
  onRecalculateRun: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAdjustment, setEditingAdjustment] =
    useState<PayrollAdjustmentRow | null>(null);
  const leaveSummary = summarizePayrollLeave(row.day_fractions);
  const paidKinds = leaveSummary.kinds.filter((k) => k.bucket === "paid");
  const halfPayKinds = leaveSummary.kinds.filter((k) => k.bucket === "half_pay");
  const unpaidKinds = leaveSummary.kinds.filter((k) => k.bucket === "unpaid");
  const totalLeaveDays =
    leaveSummary.paidDays + leaveSummary.halfPayDays + leaveSummary.unpaidDays;

  const sortedPayLines = [...empLines].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const contractedPayTotal = sortedPayLines.reduce((sum, line) => {
    const contracted = contractedAmountForLine(line.code, row);
    return contracted != null ? sum + contracted : sum;
  }, 0);
  const payrollPayTotal = sortedPayLines.reduce(
    (sum, line) => sum + signedPayrollLineAmount(line),
    0,
  );
  const paidDaysAdjusted =
    Math.abs(row.effective_paid_days - row.paid_days) >= 0.005;

  const displayAdjustments = useMemo(() => {
    const basicLine = sortedPayLines.find((l) => l.code === "BASIC");
    const orphan = inferOrphanedInternalAdjustment({
      staffId: row.staff_id,
      paidDays: Number(row.paid_days),
      effectivePaidDays: Number(row.effective_paid_days),
      dailyRate: row.daily_rate,
      fixedLineDays: basicLine?.quantity ?? null,
      existingAdjustments: empAdjustments,
    });
    if (!orphan) return empAdjustments;
    return [
      ...empAdjustments,
      {
        id: "",
        staff_id: orphan.staff_id,
        category: orphan.category,
        code: orphan.code,
        label: orphan.label,
        amount: orphan.amount,
        percent_of_daily_rate: orphan.percent_of_daily_rate,
        days_applied: orphan.days_applied,
        reason: orphan.reason,
        created_at: "",
      },
    ];
  }, [empAdjustments, sortedPayLines, row]);

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
          <span
            className={cn(
              Math.abs(row.effective_paid_days - row.paid_days) >= 0.005 &&
                "font-medium text-[#3D421F]",
            )}
            title={
              Math.abs(row.effective_paid_days - row.paid_days) >= 0.005
                ? `Attendance ${Number(row.paid_days).toFixed(2)} · Adjusted for payroll`
                : undefined
            }
          >
            {Number(row.effective_paid_days).toFixed(2)}
          </span>
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
        <tr className="bg-zinc-600">
          <td colSpan={11} className="border-t border-white/10 p-0">
            <div className="max-h-[min(70vh,720px)] overflow-y-auto bg-zinc-600 px-4 py-3 text-zinc-100">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <p>
                  <span className="text-zinc-400">Joining date</span>{" "}
                  <span className="tabular-nums font-medium">
                    {formatDate(row.joining_date)}
                  </span>
                </p>
                <p>
                  <span className="text-zinc-400">Termination date</span>{" "}
                  <span className="tabular-nums font-medium">
                    {formatDate(row.termination_date)}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium">
                  Leave this period
                  <span className="ml-1.5 font-normal text-zinc-400">
                    {totalLeaveDays === 0
                      ? "· none taken"
                      : `· ${totalLeaveDays} day${totalLeaveDays === 1 ? "" : "s"} total`}
                  </span>
                </p>
                {totalLeaveDays === 0 ? (
                  <p className="text-xs text-zinc-400">
                    No approved leave days in this payroll period.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <LeaveBucketPanel
                      title="Paid leave"
                      subtitle="Salary continues (full daily rate)"
                      totalDays={leaveSummary.paidDays}
                      kinds={paidKinds}
                      emptyLabel="No paid leave days"
                    />
                    <LeaveBucketPanel
                      title="Unpaid leave"
                      subtitle="No salary for these days (reduces paid days)"
                      totalDays={leaveSummary.unpaidDays}
                      kinds={unpaidKinds}
                      emptyLabel="No unpaid leave days"
                    />
                    {leaveSummary.halfPayDays > 0 ? (
                      <LeaveBucketPanel
                        title="Half-pay leave"
                        subtitle="50% of daily rate for these days"
                        totalDays={leaveSummary.halfPayDays}
                        kinds={halfPayKinds}
                        emptyLabel="No half-pay leave days"
                        className="sm:col-span-2"
                      />
                    ) : null}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-1.5">
                  <p className="text-xs font-medium">
                    Pay lines
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    Period {formatDate(periodStart)}
                    {" → "}
                    {formatDate(periodEnd)}
                    {paidDaysAdjusted ? (
                      <>
                        {" · Paid days on payslip: "}
                        <span className="tabular-nums font-medium text-zinc-100">
                          {row.effective_paid_days.toFixed(2)}
                        </span>
                        <span className="text-zinc-500">
                          {" "}
                          (attendance {row.paid_days.toFixed(2)})
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                {sortedPayLines.length === 0 ? (
                  <p className="text-xs text-zinc-400">
                    No lines for this employee.
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-zinc-400">
                        <th className="py-1 font-medium">Category</th>
                        <th className="py-1 font-medium">Code</th>
                        <th className="py-1 font-medium">Label</th>
                        <th className="py-1 text-right font-medium">
                          Contracted
                        </th>
                        <th className="py-1 text-right font-medium">Days</th>
                        <th className="py-1 text-right font-medium">
                          Payroll Amount
                        </th>
                        {editable ? (
                          <th className="py-1 text-right font-medium w-20" />
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPayLines.map((line) => {
                        const linkedAdjustment = adjustmentForPayLine(
                          line,
                          empAdjustments,
                        );
                        const canEditLine =
                          editable && isEditablePayLine(line, adjustmentCodes);
                        const editTarget =
                          linkedAdjustment ??
                          (canEditLine
                            ? draftAdjustmentFromLine(line, row.staff_id)
                            : null);
                        return (
                        <tr key={line.id} className="border-t border-white/10">
                          <td className="py-1.5 text-zinc-300">
                            {payrollCategoryLabel(line.category)}
                          </td>
                          <td className="py-1.5 font-mono">{line.code}</td>
                          <td className="py-1.5">{line.label}</td>
                          <td className="py-1.5 text-right tabular-nums text-zinc-300">
                            {formatMoney(
                              contractedAmountForLine(line.code, row),
                              canViewSalary,
                            )}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-zinc-300">
                            {formatPayLineDays(payLineDays(line, row))}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatMoney(
                              signedPayrollLineAmount(line),
                              canViewSalary,
                            )}
                          </td>
                          {editable ? (
                            <td className="py-1.5 text-right">
                              {linkedAdjustment ? (
                                <AdjustmentActions
                                  adjustment={linkedAdjustment}
                                  pending={pending}
                                  onEdit={() => {
                                    setEditingAdjustment(linkedAdjustment);
                                    setDialogOpen(true);
                                  }}
                                  onDelete={() =>
                                    onDeleteAdjustment(linkedAdjustment.id)
                                  }
                                />
                              ) : editTarget ? (
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingAdjustment(editTarget);
                                    setDialogOpen(true);
                                  }}
                                  className="inline-flex items-center rounded p-1 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 disabled:opacity-50"
                                  aria-label={`Edit ${line.code} adjustment`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/15 font-medium">
                        <td className="py-1.5" colSpan={3}>
                          Total
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatMoney(contractedPayTotal, canViewSalary)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-300">
                          {formatPayLineDays(row.effective_paid_days)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatMoney(payrollPayTotal, canViewSalary)}
                        </td>
                        {editable ? <td /> : null}
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {displayAdjustments.length > 0 ? (
                <EmployeeAdjustmentsTable
                  adjustments={displayAdjustments}
                  canViewSalary={canViewSalary}
                  editable={editable}
                  pending={pending}
                  onCreate={() => {
                    setEditingAdjustment(null);
                    setDialogOpen(true);
                  }}
                  onEdit={(adj) => {
                    setEditingAdjustment(adj);
                    setDialogOpen(true);
                  }}
                  onDelete={(adj) => {
                    if (isOrphanPayrollAdjustment(adj)) {
                      onRecalculateRun();
                      return;
                    }
                    onDeleteAdjustment(adj.id);
                  }}
                />
              ) : editable ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-white/20 bg-white/10 px-3 py-2.5">
                  <p className="text-xs text-zinc-400">
                    No adjustments yet for this employee.
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-black/10 bg-white px-2 text-xs font-medium text-[#3D421F] transition hover:bg-black/[0.03] disabled:opacity-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingAdjustment(null);
                      setDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create adjustment
                  </button>
                </div>
              ) : null}

              {row.exclude_reason ? (
                <p className="text-xs text-amber-300/90">
                  Exclude reason: {row.exclude_reason}
                </p>
              ) : null}
            </div>
            </div>
          </td>
        </tr>
      ) : null}
      <AdjustmentDialog
        open={dialogOpen}
        adjustment={editingAdjustment}
        staffId={row.staff_id}
        staffLabel={`${row.emp_no} — ${row.full_name}`}
        dailyRate={row.daily_rate}
        adjustmentCodes={adjustmentCodes}
        pending={pending}
        onClose={() => {
          setDialogOpen(false);
          setEditingAdjustment(null);
        }}
        onSubmit={(input) => {
          if (editingAdjustment?.id) {
            onUpdateAdjustment(editingAdjustment.id, input);
          } else {
            onAddAdjustment(input);
          }
          setDialogOpen(false);
          setEditingAdjustment(null);
        }}
      />
    </>
  );
}

function LeaveBucketPanel({
  title,
  subtitle,
  totalDays,
  kinds,
  emptyLabel,
  className,
}: {
  title: string;
  subtitle: string;
  totalDays: number;
  kinds: ReturnType<typeof summarizePayrollLeave>["kinds"];
  emptyLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-black/10 bg-white/70 px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-[#3D421F]">{title}</p>
        <p className="tabular-nums text-xs font-medium text-[#3D421F]">
          {totalDays} day{totalDays === 1 ? "" : "s"}
        </p>
      </div>
      <p className="mt-0.5 text-[11px] text-black/45">{subtitle}</p>
      {kinds.length === 0 ? (
        <p className="mt-2 text-[11px] text-black/40">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {kinds.map((kind) => (
            <li key={`${kind.bucket}:${kind.code}`} className="text-xs">
              <div className="flex items-baseline justify-between gap-2 text-[#3D421F]">
                <span>
                  <span className="font-mono text-[11px] text-black/50">
                    {kind.code}
                  </span>{" "}
                  {kind.name}
                </span>
                <span className="shrink-0 tabular-nums text-black/70">
                  {kind.days}d
                </span>
              </div>
              <p className="text-[11px] leading-snug text-black/45">
                {kind.explanation}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
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
        <h3 className="font-serif text-lg text-[#3D421F]">Alerts</h3>
        <p className="text-sm text-black/55">
          Blocking alerts should be resolved or waived before advancing the run.
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
                  No alerts for this run.
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

function AdjustmentDialog({
  open,
  adjustment,
  staffId,
  staffLabel,
  dailyRate,
  adjustmentCodes,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  adjustment?: PayrollAdjustmentRow | null;
  staffId: string;
  staffLabel: string;
  dailyRate: number | null;
  adjustmentCodes: PayrollAdjustmentCodeConfig[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: AdjustmentInput) => void;
}) {
  const isEdit = adjustment != null && adjustment.id.trim() !== "";
  const [category, setCategory] = useState<PayrollLineCategory>("variable");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (adjustment) {
      const values = formValuesFromAdjustment(adjustment);
      setCategory(values.category);
      setCode(values.code);
      setLabel(values.label);
      setAmount(values.amount);
      setPercent(values.percent);
      setDays(values.days);
      setReason(values.reason);
    } else {
      setCategory("variable");
      setCode("");
      setLabel("");
      setAmount("");
      setPercent("");
      setDays("");
      setReason("");
    }
    setFormError(null);
  }, [open, adjustment]);

  const parsedAmount = amount.trim() === "" ? null : Number(amount);
  const parsedPercent = percent.trim() === "" ? null : Number(percent);
  const parsedDays = days.trim() === "" ? null : Number(days);

  const resolvedPreview = useMemo(() => {
    if (parsedAmount != null && !Number.isNaN(parsedAmount)) {
      return resolveManualAdjustmentAmount(
        { amount: parsedAmount, percentOfDailyRate: parsedPercent, daysApplied: parsedDays },
        dailyRate,
      );
    }
    if (
      (parsedPercent == null || Number.isNaN(parsedPercent)) &&
      (parsedDays == null || Number.isNaN(parsedDays))
    ) {
      return null;
    }
    return resolveManualAdjustmentAmount(
      { percentOfDailyRate: parsedPercent, daysApplied: parsedDays },
      dailyRate,
    );
  }, [parsedAmount, parsedPercent, parsedDays, dailyRate]);

  const showCalculatedAmount =
    resolvedPreview?.ok === true &&
    (parsedAmount == null || Number.isNaN(parsedAmount));

  const codeSelectOptions = useMemo(
    () =>
      adjustmentCodesForCategory(category, adjustmentCodes).map((c) => ({
        value: c.code,
        label: `${c.code} — ${c.label}`,
      })),
    [category, adjustmentCodes],
  );

  const selectedCodeConfig = useMemo(
    () => adjustmentCodes.find((c) => c.code === code) ?? null,
    [adjustmentCodes, code],
  );

  function resetForm() {
    setCategory("variable");
    setCode("");
    setLabel("");
    setAmount("");
    setPercent("");
    setDays("");
    setReason("");
    setFormError(null);
  }

  function handleCategoryChange(next: PayrollLineCategory) {
    setCategory(next);
    const valid = adjustmentCodesForCategory(next, adjustmentCodes).some(
      (c) => c.code === code,
    );
    if (!valid) {
      setCode("");
      setLabel("");
    }
  }

  function handleCodeChange(next: string) {
    setCode(next);
    if (!isEdit) {
      const defaultLabel = defaultLabelForAdjustmentCode(next, adjustmentCodes);
      if (defaultLabel) setLabel(defaultLabel);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!pending && event.target === event.currentTarget) {
          resetForm();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjustment-dialog-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-black/10 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="adjustment-dialog-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {isEdit ? "Edit adjustment" : "Create adjustment"}
            </h2>
            <p className="mt-1 text-sm text-black/55">{staffLabel}</p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="rounded-md p-1 text-black/40 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!code.trim()) {
              setFormError("Select a code.");
              return;
            }
            if (!label.trim()) {
              setFormError("Label is required.");
              return;
            }
            if (!reason.trim()) {
              setFormError("Reason is required.");
              return;
            }
            const amountNum = amount.trim() === "" ? null : Number(amount);
            const percentNum = percent.trim() === "" ? null : Number(percent);
            const daysNum = days.trim() === "" ? null : Number(days);
            if (
              amountNum != null &&
              (Number.isNaN(amountNum) || amountNum < 0)
            ) {
              setFormError("Amount must be a valid number.");
              return;
            }
            if (
              percentNum != null &&
              (Number.isNaN(percentNum) || percentNum < 0)
            ) {
              setFormError("% of daily rate must be a valid number.");
              return;
            }
            if (daysNum != null && (Number.isNaN(daysNum) || daysNum < 0)) {
              setFormError("Days applied must be a valid number.");
              return;
            }
            const resolved = resolveManualAdjustmentAmount(
              {
                amount: amountNum,
                percentOfDailyRate: percentNum,
                daysApplied: daysNum,
              },
              dailyRate,
            );
            if (!resolved.ok) {
              setFormError(resolved.error);
              return;
            }
            onSubmit({
              staffId,
              category,
              code: code.trim(),
              label: label.trim(),
              amount: resolved.value.amount,
              percentOfDailyRate: resolved.value.percentOfDailyRate,
              daysApplied: resolved.value.daysApplied,
              reason: reason.trim(),
            });
            resetForm();
          }}
        >
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select
              className={lightSelectClass}
              value={category}
              onChange={(e) =>
                handleCategoryChange(e.target.value as PayrollLineCategory)
              }
            >
              <option value="fixed">Fixed</option>
              <option value="variable">Variable</option>
              <option value="addon">Add-Ons</option>
              <option value="deduction">Deduction</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Code</Label>
            <SearchableSelect
              value={code}
              onChange={handleCodeChange}
              options={codeSelectOptions}
              placeholder="Select code…"
              searchPlaceholder="Search code…"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Label</Label>
            <Input
              className="h-8"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />
            {selectedCodeConfig?.behaviorExplanation ? (
              <p className="text-xs text-black/45">
                {selectedCodeConfig.behaviorExplanation}
              </p>
            ) : null}
          </div>
          {(selectedCodeConfig?.allowAmountInput ?? true) ? (
            <div className="space-y-1.5">
              <Label>Amount (AED)</Label>
              <Input
                className="h-8"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 250"
              />
            </div>
          ) : null}
          {(selectedCodeConfig?.allowPercentInput ?? true) ? (
            <div className="space-y-1.5">
              <Label>% of daily rate</Label>
              <Input
                className="h-8"
                type="number"
                step="0.01"
                min="0"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="Optional"
              />
            </div>
          ) : null}
          {(selectedCodeConfig?.allowDaysInput ?? true) ? (
            <div className="space-y-1.5">
              <Label>Days applied</Label>
              <Input
                className="h-8"
                type="number"
                step="0.01"
                min="0"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
          ) : null}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Reason</Label>
            <Input
              className="h-8"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this adjustment?"
              required
            />
          </div>

          {formError ? (
            <p className="sm:col-span-2 text-sm text-red-700" role="alert">
              {formError}
            </p>
          ) : showCalculatedAmount ? (
            <p className="sm:col-span-2 text-xs text-[#3D421F]">
              Calculated amount:{" "}
              <span className="font-medium tabular-nums">
                {formatMoney(resolvedPreview.value.amount, true)}
              </span>
              {dailyRate != null ? (
                <span className="text-black/45">
                  {" "}
                  (daily rate {formatMoney(dailyRate, true)}
                  {resolvedPreview.value.percentOfDailyRate != null
                    ? ` × ${resolvedPreview.value.percentOfDailyRate}%`
                    : null}
                  {resolvedPreview.value.daysApplied != null
                    ? ` × ${resolvedPreview.value.daysApplied} day${
                        resolvedPreview.value.daysApplied === 1 ? "" : "s"
                      }`
                    : null}
                  )
                </span>
              ) : null}
            </p>
          ) : (
            <p className="sm:col-span-2 text-xs text-black/45">
              Enter one of: amount (AED), % of daily rate, or days applied. Days
              alone use 100% of the daily rate; percent alone uses 1 day.
            </p>
          )}

          {isInternalAdjustmentCode(code) ? (
            <p className="sm:col-span-2 rounded-md border border-[var(--venue-primary,#818a40)]/20 bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-2 text-xs text-[#3D421F]">
              Internal adjustments fold into basic, accommodation, and transport
              on the payslip — they are not shown as a separate line. Use days
              to prorate fixed pay; use amount to adjust fixed components
              directly.
            </p>
          ) : isNewJoinerCorrectionCode(code) ? (
            <p className="sm:col-span-2 rounded-md border border-[var(--venue-primary,#818a40)]/20 bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-2 text-xs text-[#3D421F]">
              With days or % of daily rate, this updates paid days and folds into
              basic, accommodation, and transport on the payslip. Use amount only
              when you need a separate Add-On line.
            </p>
          ) : isSalaryCorrectionCode(code) ||
              code.trim().toUpperCase() === "ALLOWANCE_ADJ" ? (
            <p className="sm:col-span-2 rounded-md border border-[var(--venue-primary,#818a40)]/20 bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-2 text-xs text-[#3D421F]">
              With days or % of daily rate, this updates basic, accommodation,
              and transport on the payslip — not added as a separate line. Use
              amount only when you need an extra fixed pay line.
            </p>
          ) : null}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="h-8 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
            >
              Cancel
            </button>
            <Button type="submit" size="sm" disabled={pending || !code}>
              {pending
                ? isEdit
                  ? "Saving…"
                  : "Adding…"
                : isEdit
                  ? "Save changes"
                  : "Add adjustment"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function AdjustmentsTab({
  adjustments,
  employeeByStaff,
  adjustmentCodes,
  canViewSalary,
  editable,
  pending,
  onUpdateAdjustment,
  onDeleteAdjustment,
}: {
  adjustments: PayrollAdjustmentRow[];
  employeeByStaff: Map<string, PayrollEmployeeRow>;
  adjustmentCodes: PayrollAdjustmentCodeConfig[];
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  onUpdateAdjustment: (adjustmentId: string, input: AdjustmentInput) => void;
  onDeleteAdjustment: (adjustmentId: string) => void;
}) {
  const [editingAdjustment, setEditingAdjustment] =
    useState<PayrollAdjustmentRow | null>(null);

  const editingEmployee = editingAdjustment
    ? employeeByStaff.get(editingAdjustment.staff_id)
    : null;

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-serif text-lg text-[#3D421F]">Adjustments</h3>
        <p className="text-sm text-black/55">
          All manual adjustments for this run. Create them from an employee row
          on the Run tab.
        </p>
      </div>

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
              {editable ? (
                <th className="px-3 py-2.5 font-medium text-right w-20" />
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {adjustments.length === 0 ? (
              <tr>
                <td
                  colSpan={editable ? 7 : 6}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No adjustments yet. Expand an employee on the Run tab and use
                  Create Adjustment.
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
                    <td className="px-3 py-2">
                      {payrollCategoryLabel(adj.category)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{adj.code}</td>
                    <td className="px-3 py-2">{adj.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(
                        adj.category === "deduction" ? -adj.amount : adj.amount,
                        canViewSalary,
                      )}
                    </td>
                    <td className="px-3 py-2 text-black/60">{adj.reason}</td>
                    {editable ? (
                      <td className="px-3 py-2 text-right">
                        <AdjustmentActions
                          adjustment={adj}
                          pending={pending}
                          onEdit={() => setEditingAdjustment(adj)}
                          onDelete={() => onDeleteAdjustment(adj.id)}
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {editingAdjustment && editingEmployee ? (
        <AdjustmentDialog
          open
          adjustment={editingAdjustment}
          staffId={editingAdjustment.staff_id}
          staffLabel={`${editingEmployee.emp_no} — ${editingEmployee.full_name}`}
          dailyRate={editingEmployee.daily_rate}
          adjustmentCodes={adjustmentCodes}
          pending={pending}
          onClose={() => setEditingAdjustment(null)}
          onSubmit={(input) => {
            onUpdateAdjustment(editingAdjustment.id, input);
            setEditingAdjustment(null);
          }}
        />
      ) : null}
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
