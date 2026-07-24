/** Payroll domain types, statuses, and default venue settings. */

export const PAYROLL_STATUSES = [
  "draft",
  "attendance_validated",
  "hr_review",
  "finance_review",
  "final_approval",
  "payment_processing",
  "paid",
  "locked",
] as const;

export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: "Draft",
  attendance_validated: "Attendance validated",
  hr_review: "HR review",
  finance_review: "Finance review",
  final_approval: "Final approval",
  payment_processing: "Payment processing",
  paid: "Paid",
  locked: "Locked",
};

/** Forward-only happy path; rejects jump back with comment. */
export const PAYROLL_STATUS_TRANSITIONS: Record<
  PayrollStatus,
  PayrollStatus[]
> = {
  draft: ["attendance_validated"],
  attendance_validated: ["hr_review", "draft"],
  hr_review: ["finance_review", "attendance_validated"],
  finance_review: ["final_approval", "hr_review"],
  final_approval: ["payment_processing", "finance_review"],
  payment_processing: ["paid", "final_approval"],
  paid: ["locked"],
  locked: [],
};

export type PayrollLineCategory = "fixed" | "variable" | "deduction";

export type PayrollLineSource =
  | "system"
  | "adjustment"
  | "benefits"
  | "retro"
  | "settlement"
  | "manual";

export type PayrollExceptionSeverity = "info" | "warning" | "blocking";

export type PayrollPaymentMethod =
  | "wps"
  | "bank_transfer"
  | "cash"
  | "cheque"
  | "other";

export type PayrollPaymentStatus =
  | "pending"
  | "file_generated"
  | "submitted"
  | "accepted"
  | "rejected"
  | "resubmitted"
  | "paid";

export type HrPayrollSettings = {
  /** Day of month when the attendance/pay period starts (1–28). E.g. 25. */
  periodStartDay: number;
  /**
   * Day of month when the attendance/pay period ends (1–28).
   * When less than start day, the window crosses months (e.g. 25 → 24).
   */
  periodEndDay: number;
  /**
   * Payment date rule for a payroll month:
   * - fixed_day: use paymentDayOfMonth in the payroll month
   * - period_end: payment_date = period end
   * - last_calendar_day: last day of the payroll month
   */
  paymentDateRule: "fixed_day" | "period_end" | "last_calendar_day";
  paymentDayOfMonth: number;
  /** Exclude staff whose employment status name matches (case-insensitive). */
  excludeEmploymentStatuses: string[];
  /** Soft-exclude staff currently on unpaid leave for the whole period. */
  excludeFullyUnpaidLeave: boolean;
  wpsEmployerId: string;
  wpsBankChannel: string;
  glAccounts: {
    basicSalary: string;
    allowances: string;
    variables: string;
    deductions: string;
    netPayable: string;
    employerCost: string;
  };
  defaultCostCentre: string;
};

export const DEFAULT_HR_PAYROLL_SETTINGS: HrPayrollSettings = {
  periodStartDay: 25,
  periodEndDay: 24,
  paymentDateRule: "fixed_day",
  paymentDayOfMonth: 28,
  excludeEmploymentStatuses: ["inactive", "suspended", "terminated"],
  excludeFullyUnpaidLeave: false,
  wpsEmployerId: "",
  wpsBankChannel: "",
  glAccounts: {
    basicSalary: "5100",
    allowances: "5110",
    variables: "5120",
    deductions: "2100",
    netPayable: "2150",
    employerCost: "5190",
  },
  defaultCostCentre: "",
};

export type PayrollPeriod = {
  /** First day of the named payroll month (YYYY-MM-01). */
  payrollMonth: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
};

export type PayrollDayFraction = {
  workDate: string;
  labelCode: string;
  approved: boolean;
  payFraction: number;
  unpaidFraction: number;
  isLeave: boolean;
};

export type CalculatedPayrollLine = {
  category: PayrollLineCategory;
  code: string;
  label: string;
  amount: number;
  quantity?: number | null;
  rate?: number | null;
  meta?: Record<string, unknown>;
  source: PayrollLineSource;
  sortOrder: number;
};

export type CalculatedEmployeePayroll = {
  staffId: string;
  empNo: string;
  fullName: string;
  departmentId: string | null;
  departmentName: string | null;
  positionId: string | null;
  positionName: string | null;
  included: boolean;
  excludeReason: string | null;
  isNewJoiner: boolean;
  isLeaver: boolean;
  employmentStatus: string | null;
  wpsEmployeeId: string | null;
  iban: string | null;
  bankName: string | null;
  swiftCode: string | null;
  wagePackage: number | null;
  basicSalary: number | null;
  accomAllowance: number | null;
  transpAllowance: number | null;
  salaryToPay: number | null;
  companyAccommodation: boolean;
  dailyRate: number | null;
  calendarDays: number;
  paidDays: number;
  unpaidDays: number;
  halfPayDays: number;
  fixedEarnings: number;
  variableEarnings: number;
  totalDeductions: number;
  grossEarnings: number;
  netSalary: number;
  lines: CalculatedPayrollLine[];
  dayFractions: PayrollDayFraction[];
};

export type PayrollExceptionDraft = {
  staffId: string | null;
  empNo: string | null;
  severity: PayrollExceptionSeverity;
  exceptionType: string;
  message: string;
  workDate?: string | null;
  meta?: Record<string, unknown>;
};

export type PayrollRunTotals = {
  employeeCount: number;
  includedCount: number;
  excludedCount: number;
  newJoinerCount: number;
  leaverCount: number;
  grossPayroll: number;
  netPayroll: number;
  basicSalaryTotal: number;
  allowancesTotal: number;
  overtimeTotal: number;
  tipsAndServiceCharge: number;
  bonuses: number;
  reimbursements: number;
  deductionsTotal: number;
  employerPayrollCost: number;
};

export function emptyPayrollTotals(): PayrollRunTotals {
  return {
    employeeCount: 0,
    includedCount: 0,
    excludedCount: 0,
    newJoinerCount: 0,
    leaverCount: 0,
    grossPayroll: 0,
    netPayroll: 0,
    basicSalaryTotal: 0,
    allowancesTotal: 0,
    overtimeTotal: 0,
    tipsAndServiceCharge: 0,
    bonuses: 0,
    reimbursements: 0,
    deductionsTotal: 0,
    employerPayrollCost: 0,
  };
}

export function isPayrollLocked(status: string): boolean {
  return status === "paid" || status === "locked";
}

export function canEditPayrollRun(status: string): boolean {
  return !isPayrollLocked(status) && status !== "payment_processing";
}
