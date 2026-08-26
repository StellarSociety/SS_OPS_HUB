"use client";

import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import { PayslipViewButton } from "@/components/hr/payslip-view-button";
import { PayslipRegenerateButton } from "@/components/hr/payslip-regenerate-button";
import { PayslipEmailButton } from "@/components/hr/payslip-email-button";
import { PayrollPaidDaysCalendarDialog } from "@/components/hr/payroll-paid-days-calendar-dialog";
import { PayrollMonthPicker } from "@/components/hr/payroll-month-picker";
import { PayrollWorkflowStepper } from "@/components/hr/payroll-workflow-stepper";
import { ImportDeductionsDialog } from "@/components/hr/import-deductions-dialog";
import { SalesImportProgressBar } from "@/components/sales/sales-import-progress-bar";
import {
  DEFAULT_HR_PAYROLL_APPROVALS_SETTINGS,
  DEFAULT_HR_PAYROLL_FINAL_APPROVAL_EMAIL_SETTINGS,
  type HrPayrollApprovalsSettings,
  type HrPayrollFinalApprovalEmailSettings,
} from "@/lib/hr/types";
import type {
  PendingPayrollApproval,
  PayrollApproverCandidate,
} from "@/lib/actions/hr-payroll-approvals";
import {
  addPayrollAdjustment,
  addBulkPayrollAdjustment,
  updatePayrollAdjustment,
  updateBulkPayrollAdjustment,
  deletePayrollAdjustment,
  deleteBulkPayrollAdjustment,
  generatePayslips,
  generateWpsFile,
  listBenefitsForPayrollImport,
  importBenefitsToPayrollRun,
  refreshImportedBenefitsOnPayrollRun,
  clearImportedBenefitsFromPayrollRun,
  importDeductionsToPayrollRun,
  clearImportedDeductionsFromPayrollRun,
  refreshVisaRunDeductionsForImport,
  recalculatePayrollRun,
  setEmployeeIncluded,
  updatePayrollBudgetRevenue,
  upsertSettlement,
  waivePayrollException,
  type PayrollBenefitImportRow,
  type PayrollBenefitImportType,
} from "@/lib/actions/hr-payroll";
import {
  PAYROLL_STATUS_LABELS,
  adjustmentCodesForCategory,
  canEditPayrollRun,
  defaultLabelForAdjustmentCode,
  isInternalAdjustmentCode,
  adjustmentFoldsIntoFixedPay,
  inferOrphanedInternalAdjustment,
  isOrphanPayrollAdjustment,
  formatPayrollMonthLabel,
  DEFAULT_PAYROLL_ADJUSTMENT_CODES,
  resolveManualAdjustmentAmount,
  isDailyRateDiscountAdjustment,
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
  WORKING_STATUS,
  resolveWorkingStatus,
  type WorkingStatusLabel,
} from "@/lib/hr/working-status";
import { downloadBase64File, downloadTextFile } from "@/lib/sales/vouchers-export";
import { cn } from "@/lib/utils";
import { floorPayoutToAed5 } from "@/lib/hr/benefits/rounding";
import { registerPayrollRunSave } from "@/components/hr/payroll-run-save-registry";

const lightSelectClass =
  "flex h-8 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Number(value).toFixed(1)}%`;
}

/** Share of `total` as a percentage; returns null when total is 0. */
function shareOfTotal(part: number, total: number): number | null {
  if (!total || Number.isNaN(total) || Number.isNaN(part)) return null;
  return (part / total) * 100;
}

/** Displayed net is money going to the employee this run (excludes unpaid / zero-net). */
function employeeIsGettingPaid(net: number): boolean {
  return net > 0.005;
}

/** Amount + share % flush-right in department summary cells. */
function DeptMetric({
  value,
  pct,
  emphasize = false,
}: {
  value: ReactNode;
  pct: string;
  emphasize?: boolean;
}) {
  return (
    <span className="flex w-full items-baseline justify-end gap-2 tabular-nums">
      <span className="min-w-0 text-right">{value}</span>
      <span
        className={cn(
          "w-12 shrink-0 text-right text-xs text-black/40",
          emphasize && "font-normal",
        )}
      >
        {pct}
      </span>
    </span>
  );
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
function isAed5PayrollBenefitCode(code: string): boolean {
  const c = code.toUpperCase();
  return c === "TIPS" || c === "SERVICE_CHARGE";
}

function payrollLineDisplayAmount(
  line: Pick<PayrollLineRow, "code" | "amount">,
): number {
  const amount = Number(line.amount) || 0;
  return isAed5PayrollBenefitCode(line.code)
    ? floorPayoutToAed5(amount)
    : amount;
}

/** Exact minus rounded remainder still sitting on stored TIPS / SERVICE_CHARGE lines. */
function benefitPayoutRoundDown(
  lines: Array<Pick<PayrollLineRow, "code" | "amount">>,
): number {
  let delta = 0;
  for (const line of lines) {
    if (!isAed5PayrollBenefitCode(line.code)) continue;
    const amount = Number(line.amount) || 0;
    delta += amount - floorPayoutToAed5(amount);
  }
  return Math.round((delta + Number.EPSILON) * 100) / 100;
}

/** Imported / benefit-module earnings that sit inside variable pay. */
const BENEFIT_VARIABLE_CODES = new Set([
  "TIPS",
  "SERVICE_CHARGE",
  "PAYBACK",
  "FLIGHT_TICKET",
  "BENEFIT_OTHER",
]);

function isBenefitVariableLine(
  line: Pick<PayrollLineRow, "category" | "code" | "source">,
): boolean {
  if (line.category !== "variable" && line.category !== "addon") return false;
  if (line.source === "benefits") return true;
  return BENEFIT_VARIABLE_CODES.has(line.code.trim().toUpperCase());
}

/**
 * Split displayed variable into benefits vs remaining variable (OT, bonus, etc.).
 * `other` is the residual so the two parts still sum to stored variable.
 */
function splitDisplayedVariable(
  storedVariable: number,
  lines: Array<
    Pick<PayrollLineRow, "category" | "code" | "source" | "amount">
  >,
): { benefits: number; other: number } {
  let benefits = 0;
  for (const line of lines) {
    if (!isBenefitVariableLine(line)) continue;
    benefits += payrollLineDisplayAmount(line);
  }
  benefits = Math.round((benefits + Number.EPSILON) * 100) / 100;
  const other = Math.round((storedVariable - benefits + Number.EPSILON) * 100) / 100;
  return { benefits, other };
}

function signedPayrollLineAmount(
  line: Pick<PayrollLineRow, "category" | "amount" | "code">,
): number {
  const amount = payrollLineDisplayAmount(line);
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

/** Contractual salary to pay (matches staff form / export Fixed_Salary). */
function contractedFixedTotal(
  row: Pick<
    PayrollEmployeeRow,
    "salary_to_pay" | "basic_salary" | "accom_allowance" | "transp_allowance"
  >,
): number {
  if (row.salary_to_pay != null && !Number.isNaN(Number(row.salary_to_pay))) {
    return Number(row.salary_to_pay);
  }
  return (
    (Number(row.basic_salary) || 0) +
    (Number(row.accom_allowance) || 0) +
    (Number(row.transp_allowance) || 0)
  );
}

/** Approved paid + half-pay leave days — matches export Paid_Leave_Days. */
function paidLeaveDaysForRow(
  row: Pick<PayrollEmployeeRow, "day_fractions">,
): number {
  const leave = summarizePayrollLeave(row.day_fractions);
  return leave.paidDays + leave.halfPayDays;
}

/**
 * AED taken off a discounted fixed pay line:
 * payrollAmount is already at (100 − %) rate, so deduction =
 * payrollAmount × percent / (100 − percent).
 */
function rateDiscountValueForLineAmount(
  payrollAmount: number,
  rateDiscountPercent: number,
): number {
  if (rateDiscountPercent <= 0 || rateDiscountPercent >= 100) return 0;
  if (payrollAmount <= 0) return 0;
  return (
    Math.round(
      (payrollAmount * (rateDiscountPercent / (100 - rateDiscountPercent)) +
        Number.EPSILON) *
        100,
    ) / 100
  );
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
  /** What hits payroll as contractual fixed pay (salary to pay). */
  salary_to_pay: number | null;
  fixed_earnings: number;
  variable_earnings: number;
  total_deductions: number;
  net_salary: number;
  joining_date: string | null;
  termination_date: string | null;
  /** Day-fraction snapshot from calculation (leave breakdown source). */
  day_fractions: PayrollDayFraction[];
  /** Latest generated payslip for this run employee, if any. */
  payslip_id: string | null;
  /** Version number of that latest payslip. */
  payslip_version: number | null;
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

/** Sum of percent-only deduction discounts applied to this employee's daily rate. */
function employeeRateDiscountPercent(
  adjustments: PayrollAdjustmentRow[],
): number {
  return Math.min(
    100,
    adjustments
      .filter((a) =>
        isDailyRateDiscountAdjustment({
          category: a.category,
          percentOfDailyRate: a.percent_of_daily_rate,
          daysApplied: a.days_applied,
          amount: a.amount,
        }),
      )
      .reduce((sum, a) => sum + (a.percent_of_daily_rate ?? 0), 0),
  );
}

/**
 * AED impact of rate-discount deductions (dailyRate × % × effective paid days).
 * Used when stored total_deductions is still stale (pre-recalculate).
 */
function employeeRateDiscountAmount(
  row: Pick<PayrollEmployeeRow, "daily_rate" | "effective_paid_days">,
  adjustments: PayrollAdjustmentRow[],
): number {
  const percent = employeeRateDiscountPercent(adjustments);
  if (percent <= 0 || row.daily_rate == null || row.daily_rate <= 0) return 0;
  return (
    Math.round(
      (row.daily_rate * (percent / 100) * row.effective_paid_days +
        Number.EPSILON) *
        100,
    ) / 100
  );
}

/** Deductions column: stored total, plus rate-discount AED if not yet included. */
function employeeDisplayedDeductions(
  row: Pick<
    PayrollEmployeeRow,
    "total_deductions" | "daily_rate" | "effective_paid_days"
  >,
  adjustments: PayrollAdjustmentRow[],
): number {
  const stored = Number(row.total_deductions) || 0;
  const rateAmount = employeeRateDiscountAmount(row, adjustments);
  if (rateAmount <= 0) return stored;
  // After recalculate, stored already includes rateAmount.
  if (stored + 0.02 >= rateAmount) return stored;
  return Math.round((stored + rateAmount + Number.EPSILON) * 100) / 100;
}

/**
 * Deduction % / value shown before Payroll Amount on a pay line.
 * Rate-discount deductions surface on BASIC / ACCOM / TRANSP; separate
 * deduction lines show their linked adjustment percent or amount.
 */
function payLineDeductionDisplay(
  line: PayrollLineRow,
  empAdjustments: PayrollAdjustmentRow[],
  rateDiscountPercent: number,
  canViewSalary: boolean,
): string {
  if (
    (line.code === "BASIC" ||
      line.code === "ACCOM" ||
      line.code === "TRANSP") &&
    rateDiscountPercent > 0
  ) {
    const pctLabel = `−${Number(rateDiscountPercent).toFixed(
      Number.isInteger(rateDiscountPercent) ? 0 : 2,
    )}%`;
    const value = rateDiscountValueForLineAmount(
      Math.abs(Number(line.amount) || 0),
      rateDiscountPercent,
    );
    if (value > 0 && canViewSalary) {
      return `${pctLabel} · ${formatMoney(value, true)}`;
    }
    return pctLabel;
  }

  const linked = adjustmentForPayLine(line, empAdjustments);
  if (linked?.percent_of_daily_rate != null) {
    // Percent-only rate discounts are shown on BASIC/ACCOM/TRANSP, not here.
    if (
      linked.days_applied != null ||
      (linked.amount != null && linked.amount > 0)
    ) {
      const pct = Number(linked.percent_of_daily_rate);
      const pctLabel = `${pct.toFixed(Number.isInteger(pct) ? 0 : 2)}%`;
      const amountLabel =
        linked.amount > 0
          ? formatMoney(linked.amount, canViewSalary)
          : formatMoney(Number(line.amount), canViewSalary);
      if (linked.days_applied != null) {
        return `${pctLabel} × ${Number(linked.days_applied).toFixed(2)}d · ${amountLabel}`;
      }
      return `${pctLabel} · ${amountLabel}`;
    }
  }

  if (line.category === "deduction" && Number(line.amount) > 0) {
    return formatMoney(Number(line.amount), canViewSalary);
  }

  return "—";
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
  department_name?: string | null;
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
  bulk_group_id?: string | null;
};

export type BulkPayrollAdjustmentGroup = {
  bulkGroupId: string;
  category: PayrollLineCategory;
  code: string;
  label: string;
  amount: number;
  percent_of_daily_rate: number | null;
  days_applied: number | null;
  reason: string;
  created_at: string;
  staffIds: string[];
  amounts: number[];
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
  actor_id?: string | null;
  actor_name?: string | null;
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
  currentUserId?: string | null;
  approvalsSettings?: HrPayrollApprovalsSettings;
  finalApprovalEmailSettings?: HrPayrollFinalApprovalEmailSettings;
  approvalCandidates?: PayrollApproverCandidate[];
  pendingApprovals?: PendingPayrollApproval[];
  userNames?: Record<string, string>;
};

type PayrollActionOutcome =
  | { ok: true }
  | { ok: false; error?: string }
  | void;

type PayrollCsvOutcome =
  | {
      ok: true;
      csv?: string;
      base64?: string;
      filename: string;
      mimeType?: string;
      warnings?: string[];
    }
  | { ok: false; error: string };

type PayrollActionFn = () => Promise<PayrollActionOutcome>;
type PayrollCsvFn = () => Promise<PayrollCsvOutcome>;

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
  currentUserId = null,
  approvalsSettings = DEFAULT_HR_PAYROLL_APPROVALS_SETTINGS,
  finalApprovalEmailSettings = DEFAULT_HR_PAYROLL_FINAL_APPROVAL_EMAIL_SETTINGS,
  approvalCandidates = [],
  pendingApprovals = [],
  userNames = {},
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
  const [importBenefitsOpen, setImportBenefitsOpen] = useState(false);
  const [importDeductionsOpen, setImportDeductionsOpen] = useState(false);
  const [inclusionOverrides, setInclusionOverrides] = useState<
    Map<string, { included: boolean; exclude_reason: string | null }>
  >(() => new Map());

  useEffect(() => {
    setInclusionOverrides((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const [id, override] of prev) {
        const row = employees.find((e) => e.id === id);
        if (!row || row.included === override.included) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [employees]);

  const displayEmployees = useMemo(() => {
    if (inclusionOverrides.size === 0) return employees;
    return employees.map((e) => {
      const override = inclusionOverrides.get(e.id);
      if (!override) return e;
      return {
        ...e,
        included: override.included,
        exclude_reason: override.included ? null : override.exclude_reason,
      };
    });
  }, [employees, inclusionOverrides]);

  const venueNetRevenue =
    periodNetRevenue?.netRevenue ?? run.revenue_amount ?? null;
  const payrollRevenuePct = payrollOverRevenuePct(
    (run.totals as Record<string, number> | null)?.netPayroll,
    venueNetRevenue,
  );

  const totals = (run.totals ?? {}) as Record<string, number>;
  // Prefer live employee flags so include/exclude updates counts immediately
  // even if persisted run.totals were stale before sync.
  const includedCount = displayEmployees.filter((e) => e.included).length;
  const excludedCount = displayEmployees.length - includedCount;
  const joinerCount = displayEmployees.filter((e) => e.is_new_joiner).length;
  const leaverCount = displayEmployees.filter((e) => e.is_leaver).length;

  const editable = canEdit && canEditPayrollRun(run.status);

  const linesByEmployee: Map<string, PayrollLineRow[]> = new Map();
  for (const line of lines) {
    const list = linesByEmployee.get(line.run_employee_id) ?? [];
    list.push(line);
    linesByEmployee.set(line.run_employee_id, list);
  }

  const employeeById: Map<string, PayrollEmployeeRow> = new Map(
    displayEmployees.map((e) => [e.id, e]),
  );
  const employeeByStaff: Map<string, PayrollEmployeeRow> = new Map(
    displayEmployees.map((e) => [e.staff_id, e]),
  );

  function refresh() {
    router.refresh();
  }

  function runAction(
    label: string,
    action: PayrollActionFn,
    opts?: { onSuccess?: () => void },
  ) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result && "ok" in result && result.ok === false) {
          setMessage(result.error ?? `${label} failed`);
          return;
        }
        setMessage(`${label} complete`);
        opts?.onSuccess?.();
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
        if (result.base64) {
          downloadBase64File(
            result.base64,
            result.filename,
            result.mimeType ??
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          );
        } else if (result.csv != null) {
          downloadTextFile(
            result.csv,
            result.filename,
            result.mimeType ?? "text/csv;charset=utf-8",
          );
        }
        const warningCount = result.warnings?.length ?? 0;
        setMessage(
          warningCount > 0
            ? `${label} downloaded (${warningCount} warning${warningCount === 1 ? "" : "s"}: ${result.warnings!.slice(0, 2).join("; ")}${warningCount > 2 ? "…" : ""})`
            : `${label} downloaded`,
        );
        refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : `${label} failed`);
      }
    });
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

  const budgetRef = useRef(budget);
  const revenueRef = useRef(venueNetRevenue);
  budgetRef.current = budget;
  revenueRef.current = venueNetRevenue;

  useEffect(() => {
    if (!editable) return;
    return registerPayrollRunSave(async () => {
      const b =
        budgetRef.current.trim() === "" ? null : Number(budgetRef.current);
      if (b != null && Number.isNaN(b)) {
        throw new Error("Budget must be a number");
      }
      const budgetResult = await updatePayrollBudgetRevenue(
        run.id,
        b,
        revenueRef.current,
      );
      if (!budgetResult.ok) {
        throw new Error(budgetResult.error ?? "Could not save budget");
      }
      const recalc = await recalculatePayrollRun(run.id);
      if (!recalc.ok) {
        throw new Error(recalc.error ?? "Could not save payroll run");
      }
    });
  }, [editable, run.id]);

  function handleToggleIncluded(id: string, included: boolean) {
    let reason: string | undefined;
    if (!included) {
      const prompted = window.prompt(
        "Reason for excluding from this payroll (optional):",
      );
      // Cancel keeps the employee included.
      if (prompted === null) return;
      reason = prompted.trim() || undefined;
    }
    setInclusionOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, {
        included,
        exclude_reason: included ? null : reason || "Manually excluded",
      });
      return next;
    });
    runAction(included ? "Include employee" : "Exclude employee", () =>
      setEmployeeIncluded(id, included, reason),
    );
  }

  const paymentHint = run.payment_date
    ? ` · Payment ${formatDate(run.payment_date)}`
    : "";
  const countsHint = `${includedCount} included · ${excludedCount} excluded · ${joinerCount} joiners · ${leaverCount} leavers`;

  const departmentSummary = useMemo(() => {
    const byDept = new Map<
      string,
      {
        department: string;
        people: number;
        fixed: number;
        benefits: number;
        otherVariable: number;
        deductions: number;
        net: number;
      }
    >();
    for (const row of displayEmployees) {
      if (!row.included) continue;
      const name = row.department_name?.trim() || "No department";
      const key = name.toLowerCase();
      const empLines = linesByEmployee.get(row.id) ?? [];
      const roundDown = benefitPayoutRoundDown(empLines);
      const fixed = Number(row.fixed_earnings) || 0;
      const storedVariable = (Number(row.variable_earnings) || 0) - roundDown;
      const { benefits, other: otherVariable } = splitDisplayedVariable(
        storedVariable,
        empLines,
      );
      const deductions = Number(row.total_deductions) || 0;
      const net = (Number(row.net_salary) || 0) - roundDown;
      const people = employeeIsGettingPaid(net) ? 1 : 0;
      const existing = byDept.get(key);
      if (existing) {
        existing.people += people;
        existing.fixed += fixed;
        existing.benefits += benefits;
        existing.otherVariable += otherVariable;
        existing.deductions += deductions;
        existing.net += net;
      } else {
        byDept.set(key, {
          department: name,
          people,
          fixed,
          benefits,
          otherVariable,
          deductions,
          net,
        });
      }
    }
    return [...byDept.values()]
      .filter(
        (row) =>
          row.people > 0 ||
          Math.abs(row.fixed) > 0.005 ||
          Math.abs(row.benefits) > 0.005 ||
          Math.abs(row.otherVariable) > 0.005 ||
          Math.abs(row.deductions) > 0.005 ||
          Math.abs(row.net) > 0.005,
      )
      .sort((a, b) =>
        a.department.localeCompare(b.department, undefined, {
          sensitivity: "base",
        }),
      );
  }, [displayEmployees, linesByEmployee]);

  const departmentTotals = useMemo(() => {
    let people = 0;
    let fixed = 0;
    let benefits = 0;
    let otherVariable = 0;
    let deductions = 0;
    let net = 0;
    for (const row of departmentSummary) {
      people += row.people;
      fixed += row.fixed;
      benefits += row.benefits;
      otherVariable += row.otherVariable;
      deductions += row.deductions;
      net += row.net;
    }
    return { people, fixed, benefits, otherVariable, deductions, net };
  }, [departmentSummary]);

  const attendanceHref = `/hr/attendance/validation?from=${encodeURIComponent(run.period_start.slice(0, 10))}&to=${encodeURIComponent(run.period_end.slice(0, 10))}&payrollRunId=${encodeURIComponent(run.id)}`;

  const attendanceComplete = !exceptions.some(
    (e) =>
      !e.waived &&
      e.severity === "blocking" &&
      (e.exception_type === "attendance_not_approved" ||
        e.exception_type === "attendance_incomplete"),
  );
  const benefitsImported = lines.some((l) => l.source === "benefits");
  const deductionsImported =
    events.some((e) => /deductions imported/i.test(e.comment ?? "")) ||
    adjustments.some(
      (a) =>
        a.code === "UNIFORM" ||
        /uniform replacement/i.test(a.reason ?? "") ||
        /uniform \/ equipment/i.test(a.label ?? ""),
    );
  const hasRecalculated =
    employees.length > 0 ||
    events.some((e) =>
      (e.comment ?? "").toLowerCase().includes("recalculated"),
    );

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
        </div>

        <PayrollWorkflowStepper
          runId={run.id}
          runStatus={run.status}
          attendanceHref={attendanceHref}
          canEdit={canEdit}
          currentUserId={currentUserId}
          approvalsSettings={approvalsSettings}
          finalApprovalEmailSettings={finalApprovalEmailSettings}
          approvalCandidates={approvalCandidates}
          pendingApprovals={pendingApprovals}
          userNames={userNames}
          attendanceComplete={attendanceComplete}
          benefitsImported={benefitsImported}
          deductionsImported={deductionsImported}
          hasRecalculated={hasRecalculated}
          events={events}
          onOpenImportBenefits={() => setImportBenefitsOpen(true)}
          onOpenImportDeductions={() => setImportDeductionsOpen(true)}
          onMessage={setMessage}
          onRefresh={refresh}
        />

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
              <span className="font-semibold text-[#3D421F]">
                {formatPayrollMonthLabel(run.payroll_month)}
              </span>{" "}
              — employees receiving pay, with fixed, variable (benefits vs
              other), deductions, and net per department.
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
                <th rowSpan={2} className="px-3 py-2.5 font-medium align-bottom">
                  Department
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 text-right font-medium align-bottom"
                >
                  People
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 text-right font-medium align-bottom"
                >
                  Fixed
                </th>
                <th
                  colSpan={2}
                  className="border-b border-black/10 px-3 pt-2 pb-1 text-center font-medium"
                >
                  Variable
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 text-right font-medium align-bottom"
                >
                  Deductions
                </th>
                <th
                  rowSpan={2}
                  className="px-3 py-2.5 text-right font-medium align-bottom"
                >
                  Net
                </th>
              </tr>
              <tr>
                <th className="px-3 pb-2.5 pt-0 text-right font-medium">
                  Benefits
                </th>
                <th className="px-3 pb-2.5 pt-0 text-right font-medium">
                  Other
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {departmentSummary.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-sm text-black/45"
                  >
                    No included employees yet.
                  </td>
                </tr>
              ) : (
                departmentSummary.map((row) => (
                  <tr key={row.department}>
                    <td className="px-3 py-2.5 text-left text-[#3D421F]">
                      {row.department}
                    </td>
                    <td className="px-3 py-2.5 text-right text-black/70">
                      <DeptMetric
                        value={row.people}
                        pct={formatPct(
                          shareOfTotal(row.people, departmentTotals.people),
                        )}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-black/70">
                      <DeptMetric
                        value={formatMoney(row.fixed, canViewSalary)}
                        pct={formatPct(
                          shareOfTotal(row.fixed, departmentTotals.fixed),
                        )}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-black/70">
                      <DeptMetric
                        value={formatMoney(row.benefits, canViewSalary)}
                        pct={formatPct(
                          shareOfTotal(
                            row.benefits,
                            departmentTotals.benefits,
                          ),
                        )}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-black/70">
                      <DeptMetric
                        value={formatMoney(row.otherVariable, canViewSalary)}
                        pct={formatPct(
                          shareOfTotal(
                            row.otherVariable,
                            departmentTotals.otherVariable,
                          ),
                        )}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-black/70">
                      <DeptMetric
                        value={formatMoney(row.deductions, canViewSalary)}
                        pct={formatPct(
                          shareOfTotal(
                            row.deductions,
                            departmentTotals.deductions,
                          ),
                        )}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-[#3D421F]">
                      <DeptMetric
                        value={formatMoney(row.net, canViewSalary)}
                        pct={formatPct(
                          shareOfTotal(row.net, departmentTotals.net),
                        )}
                        emphasize
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {departmentSummary.length > 0 ? (
              <tfoot className="border-t-2 border-black/10 bg-black/[0.03]">
                <tr className="font-medium text-[#3D421F]">
                  <td className="px-3 py-2.5 text-left">Total</td>
                  <td className="px-3 py-2.5 text-right">
                    <DeptMetric
                      value={departmentTotals.people}
                      pct="100.0%"
                      emphasize
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DeptMetric
                      value={formatMoney(departmentTotals.fixed, canViewSalary)}
                      pct="100.0%"
                      emphasize
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DeptMetric
                      value={formatMoney(
                        departmentTotals.benefits,
                        canViewSalary,
                      )}
                      pct="100.0%"
                      emphasize
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DeptMetric
                      value={formatMoney(
                        departmentTotals.otherVariable,
                        canViewSalary,
                      )}
                      pct="100.0%"
                      emphasize
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DeptMetric
                      value={formatMoney(
                        departmentTotals.deductions,
                        canViewSalary,
                      )}
                      pct="100.0%"
                      emphasize
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <DeptMetric
                      value={formatMoney(departmentTotals.net, canViewSalary)}
                      pct="100.0%"
                      emphasize
                    />
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
          employees={displayEmployees}
          linesByEmployee={linesByEmployee}
          adjustments={adjustments}
          adjustmentCodes={adjustmentCodes}
          periodStart={run.period_start}
          periodEnd={run.period_end}
          payrollMonthLabel={formatPayrollMonthLabel(run.payroll_month)}
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
          onAddBulkAdjustment={(input) =>
            runAction("Add bulk adjustment", () =>
              addBulkPayrollAdjustment({ runId: run.id, ...input }),
            )
          }
          onUpdateBulkAdjustment={(bulkGroupId, input) =>
            runAction("Update bulk adjustment", () =>
              updateBulkPayrollAdjustment({
                runId: run.id,
                bulkGroupId,
                ...input,
              }),
            )
          }
          onDeleteBulkAdjustment={(bulkGroupId) =>
            runAction("Delete bulk adjustment", () =>
              deleteBulkPayrollAdjustment({
                runId: run.id,
                bulkGroupId,
              }),
            )
          }
          onRecalculateRun={() =>
            runAction("Recalculate", () => recalculatePayrollRun(run.id))
          }
        />
      ) : null}

      <ImportBenefitsDialog
        open={importBenefitsOpen}
        runId={run.id}
        defaultMonth={run.payroll_month}
        canViewSalary={canViewSalary}
        pending={pending}
        onClose={() => setImportBenefitsOpen(false)}
        onImport={(input) => {
          runAction("Import benefits", () =>
            importBenefitsToPayrollRun({ runId: run.id, ...input }),
          );
          setImportBenefitsOpen(false);
        }}
        onRefreshApplied={(input) => {
          runAction("Refresh imported benefits", () =>
            refreshImportedBenefitsOnPayrollRun({
              runId: run.id,
              ...input,
            }),
          );
        }}
        onClearImported={(input) => {
          runAction("Delete imported benefits", () =>
            clearImportedBenefitsFromPayrollRun({
              runId: run.id,
              ...input,
            }),
          );
          setImportBenefitsOpen(false);
        }}
      />

      <ImportDeductionsDialog
        open={importDeductionsOpen}
        runId={run.id}
        canViewSalary={canViewSalary}
        pending={pending}
        onClose={() => {
          if (!pending) setImportDeductionsOpen(false);
        }}
        onImport={(input) => {
          runAction(
            "Import deductions",
            () => importDeductionsToPayrollRun({ runId: run.id, ...input }),
            { onSuccess: () => setImportDeductionsOpen(false) },
          );
        }}
        onClearImported={(input) => {
          runAction(
            "Remove imported deductions",
            () =>
              clearImportedDeductionsFromPayrollRun({
                runId: run.id,
                ...input,
              }),
            { onSuccess: () => setImportDeductionsOpen(false) },
          );
        }}
      />

      {tab === "exceptions" ? (
        <ExceptionsTab
          exceptions={exceptions}
          employees={displayEmployees}
          periodStart={run.period_start}
          periodEnd={run.period_end}
          runId={run.id}
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
            downloadCsv("Payroll export", () => generateWpsFile(run.id))
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

type BulkAdjustmentInput = {
  staffIds: string[];
  category: PayrollLineCategory;
  code: string;
  label: string;
  amount?: number | null;
  percentOfDailyRate?: number | null;
  daysApplied?: number | null;
  reason: string;
};

function groupBulkAdjustments(
  adjustments: PayrollAdjustmentRow[],
): BulkPayrollAdjustmentGroup[] {
  const groups = new Map<string, BulkPayrollAdjustmentRowGroup>();
  for (const adj of adjustments) {
    const groupId = adj.bulk_group_id?.trim();
    if (!groupId) continue;
    const existing = groups.get(groupId);
    if (existing) {
      existing.staffIds.push(adj.staff_id);
      existing.amounts.push(Number(adj.amount) || 0);
      if (adj.created_at > existing.created_at) {
        existing.created_at = adj.created_at;
      }
      continue;
    }
    groups.set(groupId, {
      bulkGroupId: groupId,
      category: adj.category as PayrollLineCategory,
      code: adj.code,
      label: adj.label,
      amount: Number(adj.amount) || 0,
      percent_of_daily_rate: adj.percent_of_daily_rate,
      days_applied: adj.days_applied,
      reason: adj.reason,
      created_at: adj.created_at,
      staffIds: [adj.staff_id],
      amounts: [Number(adj.amount) || 0],
    });
  }
  return [...groups.values()].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
}

type BulkPayrollAdjustmentRowGroup = BulkPayrollAdjustmentGroup;

function formatBulkAmountSummary(
  group: BulkPayrollAdjustmentGroup,
  canViewSalary: boolean,
): string {
  if (
    group.category === "deduction" &&
    group.percent_of_daily_rate != null &&
    group.days_applied == null &&
    group.amounts.every((a) => a === 0)
  ) {
    return `daily rate −${group.percent_of_daily_rate}% for all paid days`;
  }
  if (
    group.percent_of_daily_rate != null ||
    group.days_applied != null
  ) {
    const parts: string[] = [];
    if (group.percent_of_daily_rate != null) {
      parts.push(`${group.percent_of_daily_rate}% daily`);
    }
    if (group.days_applied != null) {
      parts.push(
        `${group.days_applied} day${group.days_applied === 1 ? "" : "s"}`,
      );
    }
    const amounts = group.amounts;
    if (amounts.length > 0 && canViewSalary && amounts.some((a) => a > 0)) {
      const min = Math.min(...amounts);
      const max = Math.max(...amounts);
      if (Math.abs(min - max) < 0.005) {
        parts.push(`= ${formatMoney(min, true)}`);
      } else {
        parts.push(
          `= ${formatMoney(min, true)}–${formatMoney(max, true)}`,
        );
      }
    }
    return parts.join(" · ");
  }
  return formatMoney(group.amount, canViewSalary);
}

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
  if (
    adj.category === "deduction" &&
    adj.percent_of_daily_rate != null &&
    adj.days_applied == null &&
    !(adj.amount > 0)
  ) {
    parts.push(
      `daily rate −${adj.percent_of_daily_rate}% for all paid days`,
    );
    return parts.join(" · ");
  }
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
  payrollMonthLabel,
  expanded,
  setExpanded,
  canViewSalary,
  editable,
  pending,
  onToggleIncluded,
  onAddAdjustment,
  onUpdateAdjustment,
  onDeleteAdjustment,
  onAddBulkAdjustment,
  onUpdateBulkAdjustment,
  onDeleteBulkAdjustment,
  onRecalculateRun,
}: {
  employees: PayrollEmployeeRow[];
  linesByEmployee: Map<string, PayrollLineRow[]>;
  adjustments: PayrollAdjustmentRow[];
  adjustmentCodes: PayrollAdjustmentCodeConfig[];
  periodStart: string;
  periodEnd: string;
  payrollMonthLabel: string;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  onToggleIncluded: (id: string, included: boolean) => void;
  onAddAdjustment: (input: AdjustmentInput) => void;
  onUpdateAdjustment: (adjustmentId: string, input: AdjustmentInput) => void;
  onDeleteAdjustment: (adjustmentId: string) => void;
  onAddBulkAdjustment: (input: BulkAdjustmentInput) => void;
  onUpdateBulkAdjustment: (
    bulkGroupId: string,
    input: BulkAdjustmentInput,
  ) => void;
  onDeleteBulkAdjustment: (bulkGroupId: string) => void;
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

  const bulkGroups = useMemo(
    () => groupBulkAdjustments(adjustments),
    [adjustments],
  );

  const employeeByStaffId = useMemo(() => {
    const map = new Map<string, PayrollEmployeeRow>();
    for (const row of employees) map.set(row.staff_id, row);
    return map;
  }, [employees]);

  type SortKey =
    | "emp_no"
    | "full_name"
    | "department_name"
    | "working_status"
    | "paid_days"
    | "paid_leave_days"
    | "unpaid_days"
    | "fixed_earnings"
    | "variable_earnings"
    | "total_deductions"
    | "net_salary"
    | "included";
  type SortDir = "asc" | "desc";

  const [sortKey, setSortKey] = useState<SortKey>("net_salary");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
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
  /** When false, Unpaid Leave staff are hidden and excluded from footer totals. */
  const [showUnpaidLeaveEmployees, setShowUnpaidLeaveEmployees] =
    useState(true);
  /** When false, staff with Included unchecked are hidden from the table. */
  const [showExcludedEmployees, setShowExcludedEmployees] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [editingBulkGroup, setEditingBulkGroup] =
    useState<BulkPayrollAdjustmentGroup | null>(null);
  const [deletingBulkGroup, setDeletingBulkGroup] =
    useState<BulkPayrollAdjustmentGroup | null>(null);
  const [bulkDeleteInFlight, setBulkDeleteInFlight] = useState(false);
  const bulkDeleteSawPendingRef = useRef(false);

  useEffect(() => {
    if (bulkDeleteInFlight && pending) {
      bulkDeleteSawPendingRef.current = true;
      return;
    }
    if (bulkDeleteInFlight && bulkDeleteSawPendingRef.current && !pending) {
      bulkDeleteSawPendingRef.current = false;
      setDeletingBulkGroup(null);
      setBulkDeleteInFlight(false);
    }
  }, [bulkDeleteInFlight, pending]);

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
      case "paid_leave_days":
        return paidLeaveDaysForRow(row);
      case "unpaid_days":
        return Number(row.unpaid_days);
      case "fixed_earnings":
        return contractedFixedTotal(row);
      case "variable_earnings":
        return (
          (Number(row.variable_earnings) || 0) -
          benefitPayoutRoundDown(linesByEmployee.get(row.id) ?? [])
        );
      case "total_deductions":
        return employeeDisplayedDeductions(
          row,
          adjustmentsByStaff.get(row.staff_id) ?? [],
        );
      case "net_salary":
        return (
          (Number(row.net_salary) || 0) -
          benefitPayoutRoundDown(linesByEmployee.get(row.id) ?? [])
        );
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
      const status = resolvePayrollWorkingStatus(row);
      if (
        !showUnpaidLeaveEmployees &&
        status === WORKING_STATUS.unpaidLeave
      ) {
        return false;
      }
      if (!showExcludedEmployees && !row.included) {
        return false;
      }
      const net =
        (Number(row.net_salary) || 0) -
        benefitPayoutRoundDown(linesByEmployee.get(row.id) ?? []);
      const isZeroNet = Math.abs(net) < 0.005;
      if (netFilter === "zero" && !isZeroNet) return false;
      if (netFilter === "nonzero" && isZeroNet) return false;
      if (deptSet) {
        const dept = row.department_name?.trim() || "No department";
        if (!deptSet.has(dept)) return false;
      }
      if (statusSet) {
        if (!statusSet.has(status)) return false;
      }
      if (includedSet) {
        const label = row.included ? "Included" : "Excluded";
        if (!includedSet.has(label)) return false;
      }
      if (joinerLeaverFilter === "joiner" && !row.is_new_joiner) return false;
      if (joinerLeaverFilter === "leaver" && !row.is_leaver) return false;
      if (!q) return true;
      const statusLower = status.toLowerCase();
      return (
        row.full_name.toLowerCase().includes(q) ||
        row.emp_no.toLowerCase().includes(q) ||
        (row.department_name ?? "").toLowerCase().includes(q) ||
        statusLower.includes(q)
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
    showUnpaidLeaveEmployees,
    showExcludedEmployees,
    linesByEmployee,
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
  }, [filtered, sortKey, sortDir, adjustmentsByStaff, linesByEmployee]);

  const columnTotals = useMemo(() => {
    let paidDays = 0;
    let paidLeaveDays = 0;
    let unpaidDays = 0;
    let fixedEarnings = 0;
    let variableEarnings = 0;
    let totalDeductions = 0;
    let netSalary = 0;
    let includedCount = 0;
    for (const row of filtered) {
      if (!row.included) continue;
      const empAdjustments = adjustmentsByStaff.get(row.staff_id) ?? [];
      includedCount += 1;
      paidDays += Number(row.effective_paid_days) || 0;
      paidLeaveDays += paidLeaveDaysForRow(row);
      unpaidDays += Number(row.unpaid_days) || 0;
      fixedEarnings += contractedFixedTotal(row);
      const roundDown = benefitPayoutRoundDown(
        linesByEmployee.get(row.id) ?? [],
      );
      variableEarnings += (Number(row.variable_earnings) || 0) - roundDown;
      totalDeductions += employeeDisplayedDeductions(row, empAdjustments);
      netSalary += (Number(row.net_salary) || 0) - roundDown;
    }
    return {
      employeeCount: filtered.length,
      includedCount,
      paidDays,
      paidLeaveDays,
      unpaidDays,
      fixedEarnings,
      variableEarnings,
      totalDeductions,
      netSalary,
    };
  }, [filtered, adjustmentsByStaff, linesByEmployee]);

  const unpaidLeaveEmployeeCount = useMemo(
    () =>
      employees.filter(
        (row) =>
          resolvePayrollWorkingStatus(row) === WORKING_STATUS.unpaidLeave,
      ).length,
    [employees],
  );

  const excludedEmployeeCount = useMemo(
    () => employees.filter((row) => !row.included).length,
    [employees],
  );

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg text-[#3D421F]">Employees</h3>
          <p className="text-sm text-black/55">
            Expand a row to see earnings and deduction lines. Click a column
            header to sort.
          </p>
        </div>
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            {selectMode ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || selectedStaffIds.size === 0}
                  onClick={() => {
                    setEditingBulkGroup(null);
                    setBulkDialogOpen(true);
                  }}
                >
                  Apply adjustment
                  {selectedStaffIds.size > 0
                    ? ` (${selectedStaffIds.size})`
                    : ""}
                </Button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedStaffIds(new Set());
                  }}
                  className="h-8 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setSelectMode(true);
                    setSelectedStaffIds(new Set());
                  }}
                  className="border border-black/10 bg-white text-[#3D421F] hover:bg-black/[0.03]"
                >
                  Bulk adjustment
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {bulkGroups.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-black/10 bg-white p-3">
          <div>
            <h4 className="text-sm font-medium text-[#3D421F]">
              Bulk adjustments
            </h4>
            <p className="text-xs text-black/45">
              Shared adjustments applied to multiple employees. Edit to change
              settings or membership.
            </p>
          </div>
          <ul className="divide-y divide-white/10 overflow-hidden rounded-md border border-zinc-700">
            {bulkGroups.map((group) => (
              <li
                key={group.bulkGroupId}
                className="flex flex-wrap items-center gap-3 bg-zinc-600 px-3 py-2.5 text-sm text-zinc-100"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-50">
                    <span className="font-mono text-xs text-zinc-400">
                      {group.code}
                    </span>{" "}
                    {group.label}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-300">
                    {payrollCategoryLabel(group.category)} ·{" "}
                    {formatBulkAmountSummary(group, canViewSalary)} ·{" "}
                    {group.staffIds.length} employee
                    {group.staffIds.length === 1 ? "" : "s"}
                    {group.reason ? ` · ${group.reason}` : ""}
                  </p>
                </div>
                {editable ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setEditingBulkGroup(group);
                        setBulkDialogOpen(true);
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-3 text-sm font-medium text-zinc-50 transition hover:bg-white/20 disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setDeletingBulkGroup(group)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-300/30 bg-red-500/20 px-3 text-sm font-medium text-red-100 transition hover:bg-red-500/35 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-white/70 p-3">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Search
          </p>
          <div className="relative">
            <Input
              className={cn("h-9", query.trim() && "pr-9")}
              placeholder="Name or emp no…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim() ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-black/5 text-black/45 transition-colors hover:bg-black/15 hover:text-[#3D421F]"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="min-w-[8rem] w-36 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Joiner / leaver
          </p>
          <div className="relative">
            <select
              className={cn(
                lightSelectClass,
                "h-9",
                joinerLeaverFilter !== "all" && "pr-14",
              )}
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
            {joinerLeaverFilter !== "all" ? (
              <button
                type="button"
                onClick={() => setJoinerLeaverFilter("all")}
                aria-label="Clear joiner / leaver filter"
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
          <div className="relative">
            <select
              className={cn(
                lightSelectClass,
                "h-9",
                netFilter !== "all" && "pr-14",
              )}
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
            {netFilter !== "all" ? (
              <button
                type="button"
                onClick={() => setNetFilter("all")}
                aria-label="Clear net filter"
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
          {" · "}
          {columnTotals.includedCount} included
          {selectMode ? ` · ${selectedStaffIds.size} selected` : ""}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              {selectMode ? (
                <th className="px-3 py-2.5 font-medium">
                  <input
                    type="checkbox"
                    checked={
                      sorted.length > 0 &&
                      sorted.every((row) =>
                        selectedStaffIds.has(row.staff_id),
                      )
                    }
                    ref={(el) => {
                      if (!el) return;
                      const some = sorted.some((row) =>
                        selectedStaffIds.has(row.staff_id),
                      );
                      const all =
                        sorted.length > 0 &&
                        sorted.every((row) =>
                          selectedStaffIds.has(row.staff_id),
                        );
                      el.indeterminate = some && !all;
                    }}
                    onChange={(e) => {
                      setSelectedStaffIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) {
                          for (const row of sorted) next.add(row.staff_id);
                        } else {
                          for (const row of sorted) next.delete(row.staff_id);
                        }
                        return next;
                      });
                    }}
                    className="h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
                    aria-label="Select all visible employees"
                  />
                </th>
              ) : null}
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
                <SortLabel
                  label="Status"
                  column="working_status"
                  align="center"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel label="Paid days" column="paid_days" align="end" />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel
                  label="Paid leave days"
                  column="paid_leave_days"
                  align="end"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel
                  label="Unpaid Days"
                  column="unpaid_days"
                  align="end"
                />
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
              <th className="bg-[var(--venue-secondary,#F0F3DD)]/70 px-3 py-2.5 font-medium text-[#3D421F]">
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
                  colSpan={selectMode ? 13 : 12}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No employees on this run yet. Recalculate to populate.
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={selectMode ? 13 : 12}
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
                    payrollMonthLabel={payrollMonthLabel}
                    canViewSalary={canViewSalary}
                    editable={editable}
                    pending={pending}
                    selectMode={selectMode}
                    selected={selectedStaffIds.has(row.staff_id)}
                    onToggleSelected={(checked) => {
                      setSelectedStaffIds((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(row.staff_id);
                        else next.delete(row.staff_id);
                        return next;
                      });
                    }}
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
                {selectMode ? <td className="px-3 py-2.5" /> : null}
                <td className="px-3 py-2.5" colSpan={2}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                      Emp no / Name
                    </span>
                    <span>
                      Included total ({columnTotals.includedCount}
                      {columnTotals.includedCount !==
                      columnTotals.employeeCount
                        ? ` of ${columnTotals.employeeCount}`
                        : ""}
                      )
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5" colSpan={2} />
                <td className="px-3 py-2.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                      Paid days
                    </span>
                    <span className="tabular-nums">
                      {columnTotals.paidDays.toFixed(2)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                      Paid leave days
                    </span>
                    <span className="tabular-nums">
                      {columnTotals.paidLeaveDays.toFixed(2)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                      Unpaid Days
                    </span>
                    <span className="tabular-nums">
                      {columnTotals.unpaidDays.toFixed(2)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                      Fixed
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(columnTotals.fixedEarnings, canViewSalary)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                      Variable
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(
                        columnTotals.variableEarnings,
                        canViewSalary,
                      )}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                      Deductions
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(
                        columnTotals.totalDeductions,
                        canViewSalary,
                      )}
                    </span>
                  </div>
                </td>
                <td className="bg-[var(--venue-secondary,#F0F3DD)]/70 px-3 py-2.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                      Net
                    </span>
                    <span className="tabular-nums font-semibold">
                      {formatMoney(columnTotals.netSalary, canViewSalary)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                      Included
                    </span>
                    <span className="tabular-nums">
                      {columnTotals.includedCount}
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {unpaidLeaveEmployeeCount > 0 || excludedEmployeeCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-white px-3 py-2.5">
          <div className="min-w-0 space-y-1">
            {unpaidLeaveEmployeeCount > 0 ? (
              <div>
                <p className="text-sm font-medium text-[#3D421F]">
                  Unpaid leave employees
                </p>
                <p className="text-xs text-black/50">
                  {unpaidLeaveEmployeeCount} staff with Unpaid Leave status
                  {showUnpaidLeaveEmployees
                    ? " shown in the table and totals"
                    : " hidden from the table and totals"}
                </p>
              </div>
            ) : null}
            {excludedEmployeeCount > 0 ? (
              <div>
                <p className="text-sm font-medium text-[#3D421F]">
                  Excluded employees
                </p>
                <p className="text-xs text-black/50">
                  {excludedEmployeeCount} staff with Included unchecked
                  {showExcludedEmployees
                    ? " shown in the table"
                    : " hidden from the table"}
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {unpaidLeaveEmployeeCount > 0 ? (
              <button
                type="button"
                role="switch"
                aria-checked={showUnpaidLeaveEmployees}
                aria-label={
                  showUnpaidLeaveEmployees
                    ? "Hide unpaid leave employees"
                    : "Show unpaid leave employees"
                }
                onClick={() =>
                  setShowUnpaidLeaveEmployees((current) => !current)
                }
                className={cn(
                  "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition",
                  showUnpaidLeaveEmployees
                    ? "border-[var(--venue-primary,#818a40)]/40 bg-[var(--venue-secondary,#F0F3DD)] text-[#3D421F]"
                    : "border-black/10 bg-white text-black/55 hover:bg-black/[0.02]",
                )}
              >
                {showUnpaidLeaveEmployees
                  ? "Hide unpaid leave"
                  : "Show unpaid leave"}
              </button>
            ) : null}
            {excludedEmployeeCount > 0 ? (
              <button
                type="button"
                role="switch"
                aria-checked={showExcludedEmployees}
                aria-label={
                  showExcludedEmployees
                    ? "Hide excluded employees"
                    : "Show excluded employees"
                }
                onClick={() =>
                  setShowExcludedEmployees((current) => !current)
                }
                className={cn(
                  "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition",
                  showExcludedEmployees
                    ? "border-[var(--venue-primary,#818a40)]/40 bg-[var(--venue-secondary,#F0F3DD)] text-[#3D421F]"
                    : "border-black/10 bg-white text-black/55 hover:bg-black/[0.02]",
                )}
              >
                {showExcludedEmployees ? "Hide excluded" : "Show excluded"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <BulkAdjustmentDialog
        open={bulkDialogOpen}
        group={editingBulkGroup}
        employees={employees}
        initialStaffIds={
          editingBulkGroup
            ? editingBulkGroup.staffIds
            : [...selectedStaffIds]
        }
        employeeByStaffId={employeeByStaffId}
        adjustmentCodes={adjustmentCodes}
        pending={pending}
        onClose={() => {
          setBulkDialogOpen(false);
          setEditingBulkGroup(null);
        }}
        onSubmit={(input) => {
          if (editingBulkGroup) {
            onUpdateBulkAdjustment(editingBulkGroup.bulkGroupId, input);
          } else {
            onAddBulkAdjustment(input);
            setSelectMode(false);
            setSelectedStaffIds(new Set());
          }
          setBulkDialogOpen(false);
          setEditingBulkGroup(null);
        }}
      />

      <DeleteBulkAdjustmentDialog
        open={deletingBulkGroup != null}
        group={deletingBulkGroup}
        pending={pending && bulkDeleteInFlight}
        onClose={() => {
          if (!bulkDeleteInFlight) setDeletingBulkGroup(null);
        }}
        onConfirm={() => {
          if (!deletingBulkGroup) return;
          setBulkDeleteInFlight(true);
          onDeleteBulkAdjustment(deletingBulkGroup.bulkGroupId);
        }}
      />
    </section>
  );
}

function employeePayWindowEnd(
  periodEnd: string,
  row: Pick<PayrollEmployeeRow, "is_leaver" | "termination_date" | "day_fractions">,
): string {
  let end = periodEnd.slice(0, 10);
  if (row.is_leaver) {
    const termination = row.termination_date?.slice(0, 10);
    if (termination && termination > end) end = termination;
  }
  for (const day of row.day_fractions ?? []) {
    const key = String(day.workDate ?? "").slice(0, 10);
    if (key > end) end = key;
  }
  return end;
}

function FragmentRows({
  row,
  open,
  empLines,
  empAdjustments,
  adjustmentCodes,
  periodStart,
  periodEnd,
  payrollMonthLabel,
  canViewSalary,
  editable,
  pending,
  selectMode = false,
  selected = false,
  onToggleSelected,
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
  payrollMonthLabel: string;
  canViewSalary: boolean;
  editable: boolean;
  pending: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (checked: boolean) => void;
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
  const [payslipId, setPayslipId] = useState<string | null>(
    row.payslip_id ?? null,
  );
  const [payslipVersion, setPayslipVersion] = useState<number | null>(
    row.payslip_version ?? null,
  );
  const [paidDaysCalendarOpen, setPaidDaysCalendarOpen] = useState(false);

  useEffect(() => {
    setPayslipId(row.payslip_id ?? null);
    setPayslipVersion(row.payslip_version ?? null);
  }, [row.payslip_id, row.payslip_version]);

  const leaveSummary = summarizePayrollLeave(row.day_fractions);
  const paidKinds = leaveSummary.kinds.filter((k) => k.bucket === "paid");
  const halfPayKinds = leaveSummary.kinds.filter((k) => k.bucket === "half_pay");
  const unpaidKinds = leaveSummary.kinds.filter((k) => k.bucket === "unpaid");
  const totalLeaveDays =
    leaveSummary.paidDays + leaveSummary.halfPayDays + leaveSummary.unpaidDays;
  const payWindowEnd = employeePayWindowEnd(periodEnd, row);

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
  const benefitRoundDown = benefitPayoutRoundDown(empLines);
  const displayVariableEarnings =
    (Number(row.variable_earnings) || 0) - benefitRoundDown;
  const displayNetSalary = (Number(row.net_salary) || 0) - benefitRoundDown;
  const paidDaysAdjusted =
    Math.abs(row.effective_paid_days - row.paid_days) >= 0.005;
  const rateDiscountPercent = employeeRateDiscountPercent(empAdjustments);

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

  const zeroNet = Math.abs(displayNetSalary) < 0.005;

  return (
    <>
      <tr
        className={cn(
          "cursor-pointer",
          zeroNet
            ? "bg-purple-100/80 hover:bg-purple-100"
            : "hover:bg-[var(--venue-secondary,#F0F3DD)]/25",
          !row.included && "opacity-60",
          selectMode &&
            selected &&
            (zeroNet
              ? "bg-purple-200/70"
              : "bg-[var(--venue-secondary,#F0F3DD)]/40"),
        )}
        onClick={onToggleExpand}
      >
        {selectMode ? (
          <td
            className="px-3 py-2 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected}
              disabled={pending}
              onChange={(e) => onToggleSelected?.(e.target.checked)}
              className="h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
              aria-label={`Select ${row.full_name}`}
            />
          </td>
        ) : null}
        <td className="px-3 py-2 font-mono text-xs text-[#3D421F]">
          <StaffDirectoryLink
            staffId={row.staff_id}
            empNo={row.emp_no}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
        <td className="px-3 py-2 text-[#3D421F]">
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {row.full_name}
            {row.is_new_joiner ? (
              <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                Joiner
              </span>
            ) : null}
            {row.is_leaver ? (
              <span className="inline-flex rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800">
                Leaver
              </span>
            ) : null}
          </span>
        </td>
        <td className="px-3 py-2 text-black/60">
          {row.department_name ?? "—"}
        </td>
        <td className="px-3 py-2 text-center">
          <WorkingStatusBadge status={resolvePayrollWorkingStatus(row)} />
        </td>
        <td
          className="px-3 py-2 text-right tabular-nums"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setPaidDaysCalendarOpen(true)}
            className={cn(
              "rounded underline-offset-2 transition hover:underline",
              "text-[var(--venue-primary,#818a40)] hover:bg-[var(--venue-primary,#818a40)]/10",
              Math.abs(row.effective_paid_days - row.paid_days) >= 0.005 &&
                "font-medium",
            )}
            title={
              Math.abs(row.effective_paid_days - row.paid_days) >= 0.005
                ? `Attendance ${Number(row.paid_days).toFixed(2)} · Adjusted for payroll — view calendar`
                : "View worked / leave days for this payroll period"
            }
          >
            {Number(row.effective_paid_days).toFixed(2)}
          </button>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {(leaveSummary.paidDays + leaveSummary.halfPayDays).toFixed(2)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {Number(row.unpaid_days).toFixed(2)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(contractedFixedTotal(row), canViewSalary)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(displayVariableEarnings, canViewSalary)}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">
          {formatMoney(
            employeeDisplayedDeductions(row, empAdjustments),
            canViewSalary,
          )}
        </td>
        <td className="bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-2 text-right tabular-nums font-semibold text-[#3D421F]">
          {formatMoney(displayNetSalary, canViewSalary)}
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
          <td colSpan={selectMode ? 13 : 12} className="border-t border-white/10 p-0">
            <div className="max-h-[min(70vh,720px)] overflow-y-auto bg-zinc-600 px-4 py-3 text-zinc-100">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
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
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  <Link
                    href={`/hr/attendance/validation?staffId=${encodeURIComponent(row.staff_id)}&from=${encodeURIComponent(periodStart.slice(0, 10))}&to=${encodeURIComponent(payWindowEnd)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open attendance validation for ${row.full_name} (${periodStart.slice(0, 10)} → ${payWindowEnd})`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    Open validation
                  </Link>
                  {editable || payslipId ? (
                    <>
                      {editable ? (
                        <PayslipRegenerateButton
                          runEmployeeId={row.id}
                          tone="dark"
                          disabled={pending || !row.included}
                          onRegenerated={(next) => {
                            setPayslipId(next.payslipId);
                            setPayslipVersion(next.version);
                          }}
                        />
                      ) : null}
                      {payslipVersion != null ? (
                        <span
                          className="px-1 text-xs tabular-nums text-zinc-300"
                          title={`Payslip version ${payslipVersion}`}
                        >
                          v{payslipVersion}
                        </span>
                      ) : editable ? (
                        <span className="px-1 text-xs text-zinc-400">
                          No payslip
                        </span>
                      ) : null}
                      {payslipId ? (
                        <>
                          <PayslipViewButton
                            payslipId={payslipId}
                            label="Preview payslip"
                            tone="dark"
                          />
                          {editable ? (
                            <PayslipEmailButton
                              payslipId={payslipId}
                              empNo={row.emp_no}
                              fullName={row.full_name}
                              version={payslipVersion}
                              payrollMonthLabel={payrollMonthLabel}
                              tone="dark"
                              disabled={pending || !row.included}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
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
                    {formatDate(payWindowEnd)}
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
                          Deduction
                        </th>
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
                          <td className="py-1.5 text-right tabular-nums text-zinc-300">
                            {payLineDeductionDisplay(
                              line,
                              empAdjustments,
                              rateDiscountPercent,
                              canViewSalary,
                            )}
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
                        <td className="py-1.5 text-right tabular-nums text-zinc-300">
                          {rateDiscountPercent > 0
                            ? (() => {
                                const pctLabel = `−${Number(
                                  rateDiscountPercent,
                                ).toFixed(
                                  Number.isInteger(rateDiscountPercent)
                                    ? 0
                                    : 2,
                                )}%`;
                                const totalDeductionValue =
                                  employeeRateDiscountAmount(
                                    row,
                                    empAdjustments,
                                  );
                                return totalDeductionValue > 0 && canViewSalary
                                  ? `${pctLabel} · ${formatMoney(totalDeductionValue, true)}`
                                  : pctLabel;
                              })()
                            : "—"}
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
      <PayrollPaidDaysCalendarDialog
        open={paidDaysCalendarOpen}
        onClose={() => setPaidDaysCalendarOpen(false)}
        empNo={row.emp_no}
        fullName={row.full_name}
        periodStart={periodStart}
        periodEnd={payWindowEnd}
        dayFractions={row.day_fractions}
        paidDays={row.effective_paid_days}
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
  employees,
  periodStart,
  periodEnd,
  runId,
  editable,
  pending,
  onWaive,
}: {
  exceptions: PayrollExceptionRow[];
  employees: PayrollEmployeeRow[];
  periodStart: string;
  periodEnd: string;
  runId: string;
  editable: boolean;
  pending: boolean;
  onWaive: (id: string) => void;
}) {
  const employeeByEmp = useMemo(() => {
    const map = new Map<
      string,
      { staffId: string; departmentName: string | null; fullName: string }
    >();
    for (const emp of employees) {
      const key = emp.emp_no.trim().toLowerCase();
      if (!key) continue;
      map.set(key, {
        staffId: emp.staff_id,
        departmentName: emp.department_name,
        fullName: emp.full_name,
      });
    }
    return map;
  }, [employees]);

  const from = periodStart.slice(0, 10);
  const to = periodEnd.slice(0, 10);

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
              <th className="px-3 py-2.5 font-medium">Department</th>
              <th className="px-3 py-2.5 font-medium">Message</th>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Validation</th>
              <th className="px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {exceptions.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No alerts for this run.
                </td>
              </tr>
            ) : (
              exceptions.map((ex) => {
                const person = ex.emp_no
                  ? employeeByEmp.get(ex.emp_no.trim().toLowerCase())
                  : undefined;
                const dept = ex.department_name ?? person?.departmentName;
                const validationHref = person
                  ? `/hr/attendance/validation?staffId=${encodeURIComponent(person.staffId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&payrollRunId=${encodeURIComponent(runId)}`
                  : null;
                return (
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
                    <td className="px-3 py-2 text-black/60">
                      {dept?.trim() || "—"}
                    </td>
                    <td className="px-3 py-2 text-black/70">{ex.message}</td>
                    <td className="px-3 py-2 text-black/50">
                      {formatDate(ex.work_date)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {validationHref ? (
                        <Link
                          href={validationHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open attendance validation for ${person?.fullName ?? ex.emp_no} (${from} → ${to})`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/15 bg-white px-2.5 text-xs font-medium text-[#3D421F] transition hover:bg-black/[0.03]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          Validation
                        </Link>
                      ) : null}
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
                );
              })
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

function benefitTypeLabel(type: string): string {
  switch (type) {
    case "tips":
      return "Tips (Gratuity)";
    case "service_charge":
      return "Service charge";
    case "compensation":
      return "Compensations";
    case "flight_ticket":
      return "Flight ticket";
    case "payback":
      return "Payback";
    default:
      return "Other benefit";
  }
}

function ImportBenefitsDialog({
  open,
  runId,
  defaultMonth,
  canViewSalary,
  pending,
  onClose,
  onImport,
  onRefreshApplied,
  onClearImported,
}: {
  open: boolean;
  runId: string;
  defaultMonth: string;
  canViewSalary: boolean;
  pending: boolean;
  onClose: () => void;
  onImport: (input: {
    benefitMonth: string;
    benefitType: PayrollBenefitImportType | "all";
    allocationIds: string[];
  }) => void;
  onRefreshApplied: (input: {
    benefitMonth: string;
    benefitType: PayrollBenefitImportType | "all";
  }) => void;
  onClearImported: (input: {
    benefitMonth: string;
    benefitType: PayrollBenefitImportType | "all";
  }) => void;
}) {
  const defaultMonthValue = defaultMonth.slice(0, 7);
  const [benefitMonth, setBenefitMonth] = useState(defaultMonthValue);
  const [benefitType, setBenefitType] = useState<
    PayrollBenefitImportType | "all"
  >("all");
  const [rows, setRows] = useState<PayrollBenefitImportRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staffQuery, setStaffQuery] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const visaRefreshStarted = useRef(false);

  useEffect(() => {
    if (!open) return;
    setBenefitMonth(defaultMonthValue);
    setBenefitType("all");
    setStaffQuery("");
    setLoadError(null);
    visaRefreshStarted.current = false;
  }, [open, defaultMonthValue]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void listBenefitsForPayrollImport({
      runId,
      benefitMonth,
      benefitType,
    }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setRows([]);
        setSelectedIds(new Set());
        setLoadError(result.error);
        return;
      }
      setRows(result.rows);
      setSelectedIds(
        new Set(
          result.rows
            .filter((r) => r.amount > 0 || r.alreadyApplied)
            .map((r) => r.allocationId),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, runId, benefitMonth, benefitType, reloadNonce]);

  // After a parent action finishes (pending → idle), reload the list so
  // "applied" badges and amounts stay in sync when the dialog stays open.
  const wasPending = useRef(false);
  useEffect(() => {
    if (!open) {
      wasPending.current = false;
      return;
    }
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (wasPending.current) {
      wasPending.current = false;
      setReloadNonce((n) => n + 1);
    }
  }, [pending, open]);

  useEffect(() => {
    if (!open || loading || visaRefreshStarted.current) return;
    if (benefitType !== "all" && benefitType !== "payback") return;
    visaRefreshStarted.current = true;
    let cancelled = false;
    void refreshVisaRunDeductionsForImport().then((result) => {
      if (cancelled || !result.ok) return;
      setReloadNonce((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [open, loading, benefitType]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  const filteredRows = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.empNo.toLowerCase().includes(q) ||
        r.fullName.toLowerCase().includes(q) ||
        (r.departmentName?.toLowerCase().includes(q) ?? false) ||
        benefitTypeLabel(r.benefitType).toLowerCase().includes(q) ||
        (r.detail?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, staffQuery]);

  const appliedCount = useMemo(
    () => rows.filter((r) => r.alreadyApplied).length,
    [rows],
  );

  const selectedTotal = useMemo(() => {
    let sum = 0;
    for (const row of rows) {
      if (selectedIds.has(row.allocationId)) sum += row.amount;
    }
    return sum;
  }, [rows, selectedIds]);

  if (!open) return null;

  function selectAll() {
    setSelectedIds(new Set(filteredRows.map((r) => r.allocationId)));
  }

  function selectNone() {
    setSelectedIds(new Set());
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleRefreshApplied() {
    onRefreshApplied({ benefitMonth, benefitType });
  }

  function handleClearImported() {
    const label =
      benefitType === "all"
        ? "all imported benefits for this month"
        : `imported ${benefitTypeLabel(benefitType).toLowerCase()} for this month`;
    if (
      !window.confirm(
        `Remove ${label} from this payroll? Net pay will be recalculated.`,
      )
    ) {
      return;
    }
    onClearImported({ benefitMonth, benefitType });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!pending && !loading && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-benefits-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-3xl flex-col rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="border-b border-black/10 px-6 py-4">
          <h2
            id="import-benefits-title"
            className="font-serif text-xl text-[#3D421F]"
          >
            Import Benefits
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Pull finalized Tips / Service Charge amounts and visa paybacks
            (employee already paid) into this payroll as variable benefit
            lines. Net pay updates on recalculate; amounts appear on
            payslips.
          </p>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <PayrollMonthPicker
              id="import-benefit-month"
              label="Benefit month"
              value={benefitMonth}
              onChange={setBenefitMonth}
              disabled={pending || loading}
            />
            <div className="flex flex-col gap-1">
              <label
                htmlFor="import-benefit-type"
                className="text-[11px] font-medium uppercase tracking-wide text-black/45"
              >
                Benefit
              </label>
              <select
                id="import-benefit-type"
                value={benefitType}
                disabled={pending || loading}
                onChange={(e) =>
                  setBenefitType(
                    e.target.value as PayrollBenefitImportType | "all",
                  )
                }
                className={cn(lightSelectClass, "h-10")}
              >
                <option value="all">All benefits</option>
                <option value="tips">Tips (Gratuity)</option>
                <option value="service_charge">Service charge</option>
                <option value="flight_ticket">Flight ticket</option>
                <option value="compensation">Compensations</option>
                <option value="payback">Payback</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Input
              value={staffQuery}
              disabled={pending || loading}
              onChange={(e) => setStaffQuery(e.target.value)}
              placeholder="Search employees…"
              className="h-9 max-w-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending || loading || filteredRows.length === 0}
                onClick={selectAll}
                className="h-8 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
              >
                Select all
              </button>
              <button
                type="button"
                disabled={pending || loading || selectedIds.size === 0}
                onClick={selectNone}
                className="h-8 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
              >
                Select none
              </button>
            </div>
          </div>

          {appliedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--venue-primary,#818a40)]/25 bg-[var(--venue-secondary,#e8ebc8)]/35 px-3 py-2">
              <p className="mr-auto text-xs text-[#3D421F]/80">
                {appliedCount} already applied to this payroll
              </p>
              <button
                type="button"
                disabled={pending || loading}
                onClick={handleRefreshApplied}
                className="h-8 rounded-md border border-black/10 bg-white px-3 text-xs font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
              >
                {pending ? "Refreshing…" : "Refresh applied"}
              </button>
              <button
                type="button"
                disabled={pending || loading}
                onClick={handleClearImported}
                className="h-8 rounded-md border border-red-200 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete imported"}
              </button>
            </div>
          ) : null}

          {loadError ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {loadError}
            </p>
          ) : null}

          {loading ? (
            <SalesImportProgressBar label="Loading benefit allocations…" />
          ) : (
            <div className="max-h-[min(40vh,360px)] overflow-auto rounded-lg border border-black/10">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
                  <tr>
                    <th className="px-3 py-2 font-medium"> </th>
                    <th className="px-3 py-2 font-medium">Emp no</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Benefit</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-8 text-center text-sm text-black/45"
                      >
                        No benefit allocations for this month
                        {benefitType === "all" || benefitType === "payback"
                          ? ", and no visa paybacks queued. Tick Employee already paid on a visa penalty, or finalize a Benefits run."
                          : ". Finalize a Benefits run first."}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={row.allocationId} className="hover:bg-black/[0.02]">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.allocationId)}
                            disabled={pending}
                            onChange={() => toggleOne(row.allocationId)}
                            className="h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
                            aria-label={`Import ${row.fullName}`}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.empNo}
                        </td>
                        <td className="px-3 py-2 text-[#3D421F]">
                          {row.fullName}
                          {row.alreadyApplied ? (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-black/40">
                              applied
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-black/60">
                          {benefitTypeLabel(row.benefitType)}
                          {row.detail ? (
                            <span className="mt-0.5 block text-xs text-black/45">
                              {row.detail}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatMoney(row.amount, canViewSalary)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-black/50">
            {selectedIds.size} selected · total{" "}
            {formatMoney(selectedTotal, canViewSalary)}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-6 py-4">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="h-9 rounded-md border border-black/10 bg-white px-3.5 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || loading || selectedIds.size === 0}
            onClick={() =>
              onImport({
                benefitMonth,
                benefitType,
                allocationIds: [...selectedIds],
              })
            }
            className="h-9 rounded-md bg-[var(--venue-primary,#818a40)] px-3.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DeleteBulkAdjustmentDialog({
  open,
  group,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  group: BulkPayrollAdjustmentGroup | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || !group) return null;

  const employeeCount = group.staffIds.length;
  const employeeLabel = employeeCount === 1 ? "employee" : "employees";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-bulk-adj-title"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <h2
          id="delete-bulk-adj-title"
          className="font-serif text-xl text-[#3D421F]"
        >
          Delete bulk adjustment
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-black/65">
          Remove{" "}
          <span className="font-medium text-[#3D421F]">
            {group.code} — {group.label}
          </span>{" "}
          from {employeeCount} {employeeLabel}? Payroll will be recalculated.
        </p>
        {group.reason ? (
          <p className="mt-1 text-xs text-black/45">{group.reason}</p>
        ) : null}

        {pending ? (
          <SalesImportProgressBar label="Deleting adjustment…" />
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="h-9 rounded-md border border-black/10 bg-white px-3.5 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="h-9 rounded-md bg-red-700 px-3.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BulkAdjustmentDialog({
  open,
  group,
  employees,
  initialStaffIds,
  employeeByStaffId,
  adjustmentCodes,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  group?: BulkPayrollAdjustmentGroup | null;
  employees: PayrollEmployeeRow[];
  initialStaffIds: string[];
  employeeByStaffId: Map<string, PayrollEmployeeRow>;
  adjustmentCodes: PayrollAdjustmentCodeConfig[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: BulkAdjustmentInput) => void;
}) {
  const isEdit = group != null;
  const [category, setCategory] = useState<PayrollLineCategory>("variable");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [staffQuery, setStaffQuery] = useState("");
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const initialStaffKey = useMemo(
    () => [...initialStaffIds].sort().join(","),
    [initialStaffIds],
  );

  useEffect(() => {
    if (!open) return;
    if (group) {
      const hasRateBased =
        group.percent_of_daily_rate != null || group.days_applied != null;
      setCategory(group.category);
      setCode(group.code);
      setLabel(group.label);
      setAmount(hasRateBased ? "" : String(group.amount));
      setPercent(
        group.percent_of_daily_rate != null
          ? String(group.percent_of_daily_rate)
          : "",
      );
      setDays(
        group.days_applied != null ? String(group.days_applied) : "",
      );
      setReason(group.reason);
      setSelectedStaffIds(new Set(group.staffIds));
    } else {
      setCategory("variable");
      setCode("");
      setLabel("");
      setAmount("");
      setPercent("");
      setDays("");
      setReason("");
      setSelectedStaffIds(
        new Set(initialStaffKey ? initialStaffKey.split(",") : []),
      );
    }
    setStaffQuery("");
    setFormError(null);
  }, [open, group, initialStaffKey]);

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

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => {
      const cmp = a.full_name.localeCompare(b.full_name, undefined, {
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp;
      return a.emp_no.localeCompare(b.emp_no);
    });
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = staffQuery.trim().toLowerCase();
    if (!q) return sortedEmployees;
    return sortedEmployees.filter(
      (row) =>
        row.full_name.toLowerCase().includes(q) ||
        row.emp_no.toLowerCase().includes(q) ||
        (row.department_name ?? "").toLowerCase().includes(q),
    );
  }, [sortedEmployees, staffQuery]);

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
        if (!pending && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-adjustment-dialog-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="bulk-adjustment-dialog-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {isEdit ? "Edit bulk adjustment" : "Bulk adjustment"}
            </h2>
            <p className="mt-1 text-sm text-black/55">
              {selectedStaffIds.size} employee
              {selectedStaffIds.size === 1 ? "" : "s"} selected
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-md p-1 text-black/40 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
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
            if (selectedStaffIds.size === 0) {
              setFormError("Select at least one employee.");
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

            // Validate using a sample daily rate when percent/days are used.
            const sampleStaffId = [...selectedStaffIds][0];
            const sampleRate =
              employeeByStaffId.get(sampleStaffId)?.daily_rate ?? null;
            const resolved = resolveManualAdjustmentAmount(
              {
                amount: amountNum,
                percentOfDailyRate: percentNum,
                daysApplied: daysNum,
                rateDiscountWhenPercentOnly: category === "deduction",
              },
              sampleRate,
            );
            if (!resolved.ok) {
              setFormError(resolved.error);
              return;
            }

            onSubmit({
              staffIds: [...selectedStaffIds],
              category,
              code: code.trim(),
              label: label.trim(),
              amount: amountNum,
              percentOfDailyRate: percentNum,
              daysApplied: daysNum,
              reason: reason.trim(),
            });
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
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
                    placeholder="Same amount for each"
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
                    placeholder="Per employee daily rate"
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
              {selectedCodeConfig?.behaviorExplanation ? (
                <p className="sm:col-span-2 rounded-md border border-[var(--venue-primary,#818a40)]/20 bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-2 text-xs text-[#3D421F]">
                  {selectedCodeConfig.behaviorExplanation}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-[#3D421F]">
                    Employees
                  </p>
                  <p className="text-xs text-black/45">
                    Tick to include or remove people from this bulk adjustment.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      setSelectedStaffIds(
                        new Set(filteredEmployees.map((e) => e.staff_id)),
                      )
                    }
                    className="text-xs font-medium text-[var(--venue-primary,#818a40)] hover:underline disabled:opacity-50"
                  >
                    Select visible
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setSelectedStaffIds(new Set())}
                    className="text-xs font-medium text-black/45 hover:text-[#3D421F] disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <Input
                className="h-8"
                placeholder="Search employees…"
                value={staffQuery}
                onChange={(e) => setStaffQuery(e.target.value)}
              />
              <div className="max-h-56 overflow-y-auto rounded-md border border-black/10">
                <ul className="divide-y divide-black/5">
                  {filteredEmployees.length === 0 ? (
                    <li className="px-3 py-6 text-center text-sm text-black/45">
                      No employees match.
                    </li>
                  ) : (
                    filteredEmployees.map((row) => {
                      const checked = selectedStaffIds.has(row.staff_id);
                      return (
                        <li key={row.staff_id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-black/[0.02]">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={pending}
                              onChange={(e) => {
                                setSelectedStaffIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) {
                                    next.add(row.staff_id);
                                  } else {
                                    next.delete(row.staff_id);
                                  }
                                  return next;
                                });
                              }}
                              className="h-4 w-4 rounded border-black/20 accent-[var(--venue-primary,#818a40)]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium text-[#3D421F]">
                                {row.full_name}
                              </span>
                              <span className="ml-2 font-mono text-xs text-black/45">
                                {row.emp_no}
                              </span>
                              {row.department_name ? (
                                <span className="ml-2 text-xs text-black/40">
                                  {row.department_name}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>

            {formError ? (
              <p className="text-sm text-red-700" role="alert">
                {formError}
              </p>
            ) : (
              <p className="text-xs text-black/45">
                Fixed amounts apply equally to each selected employee. Percent /
                days use each employee’s daily rate. For deductions, percent with
                no days discounts the daily rate for all paid days; percent with
                days posts an amount of rate × % × days.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="h-8 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
            >
              Cancel
            </button>
            <Button
              type="submit"
              size="sm"
              disabled={pending || !code || selectedStaffIds.size === 0}
            >
              {pending
                ? isEdit
                  ? "Saving…"
                  : "Applying…"
                : isEdit
                  ? "Save bulk adjustment"
                  : "Apply to selected"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
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
        {
          amount: parsedAmount,
          percentOfDailyRate: parsedPercent,
          daysApplied: parsedDays,
          rateDiscountWhenPercentOnly: category === "deduction",
        },
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
      {
        percentOfDailyRate: parsedPercent,
        daysApplied: parsedDays,
        rateDiscountWhenPercentOnly: category === "deduction",
      },
      dailyRate,
    );
  }, [parsedAmount, parsedPercent, parsedDays, dailyRate, category]);

  const showRateDiscountPreview =
    resolvedPreview?.ok === true &&
    resolvedPreview.value.rateDiscountPercent != null;

  const showCalculatedAmount =
    resolvedPreview?.ok === true &&
    !showRateDiscountPreview &&
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
                rateDiscountWhenPercentOnly: category === "deduction",
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
              amount:
                resolved.value.rateDiscountPercent != null
                  ? null
                  : resolved.value.amount,
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
          ) : showRateDiscountPreview && resolvedPreview?.ok ? (
            <p className="sm:col-span-2 text-xs text-[#3D421F]">
              Daily rate −{resolvedPreview.value.rateDiscountPercent}% for all
              paid days
              {dailyRate != null ? (
                <span className="text-black/45">
                  {" "}
                  (package rate {formatMoney(dailyRate, true)} →{" "}
                  {formatMoney(
                    dailyRate *
                      (1 -
                        (resolvedPreview.value.rateDiscountPercent ?? 0) / 100),
                    true,
                  )}
                  )
                </span>
              ) : null}
            </p>
          ) : showCalculatedAmount && resolvedPreview?.ok ? (
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
              alone use 100% of the daily rate. For deductions, percent alone
              discounts the daily rate for all paid days; earnings percent alone
              uses 1 day.
            </p>
          )}

          {selectedCodeConfig?.behaviorExplanation ? (
            <p className="sm:col-span-2 rounded-md border border-[var(--venue-primary,#818a40)]/20 bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-2 text-xs text-[#3D421F]">
              {selectedCodeConfig.behaviorExplanation}
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
              <th className="px-3 py-2.5 font-medium text-right">
                <span className="block">Amount +</span>
                <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-black/40">
                  To be added to payroll
                </span>
              </th>
              <th className="px-3 py-2.5 font-medium text-right">
                <span className="block">Amount −</span>
                <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-black/40">
                  To be deducted from payroll
                </span>
              </th>
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
                  colSpan={editable ? 8 : 7}
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
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-800">
                      {adj.category === "deduction"
                        ? "—"
                        : formatMoney(adj.amount, canViewSalary)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-800">
                      {adj.category === "deduction"
                        ? formatMoney(adj.amount, canViewSalary)
                        : "—"}
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
            Payment rows for bank transfer processing.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={pending || !canEdit}
          onClick={onGenerateWps}
        >
          Export Payroll
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
