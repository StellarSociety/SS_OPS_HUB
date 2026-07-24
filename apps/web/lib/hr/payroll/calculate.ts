import {
  computeSalaryBreakdown,
  isInAccommodation,
  type SalaryPercentages,
} from "@/lib/hr/derived";
import type { HrLeavePolicySettings } from "@/lib/hr/types";
import { computeDailyRate, round2 } from "./daily-rate";
import { payFractionForLabel } from "./pay-fraction";
import {
  calendarDaysInclusive,
  eachIsoDate,
  maxIsoDate,
  minIsoDate,
} from "./period";
import type {
  CalculatedEmployeePayroll,
  CalculatedPayrollLine,
  HrPayrollSettings,
  PayrollDayFraction,
  PayrollExceptionDraft,
  PayrollPeriod,
  PayrollRunTotals,
} from "./types";
import { emptyPayrollTotals } from "./types";

export type PayrollStaffInput = {
  id: string;
  emp_no: string;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_name: string | null;
  joining_date: string | null;
  termination_date: string | null;
  employment_status: string | null;
  wps_employee_id: string | null;
  iban: string | null;
  bank_name: string | null;
  swift_code: string | null;
  wage_package: number | null;
  company_accommodation: string | null;
  basic_salary_60: number | null;
  accom_all_25: number | null;
  transp_all_15: number | null;
  fly_home_ticket_per_year: number | null;
};

export type ScheduleDayInput = {
  staff_id: string | null;
  emp_no: string;
  work_date: string;
  label_code: string;
};

export type AttendanceDayInput = {
  staff_id: string | null;
  emp_no: string;
  work_date: string;
  approval_status: string;
};

export type BenefitAllocationInput = {
  staff_id: string;
  benefit_type: string;
  amount: number;
};

export type ManualAdjustmentInput = {
  staffId: string;
  category: "fixed" | "variable" | "deduction";
  code: string;
  label: string;
  amount: number;
  percentOfDailyRate?: number | null;
  daysApplied?: number | null;
  source?: CalculatedPayrollLine["source"];
};

function empKey(empNo: string | null | undefined): string {
  return (empNo ?? "").trim().toLowerCase();
}

function statusExcluded(
  statusName: string | null | undefined,
  settings: HrPayrollSettings,
): boolean {
  if (!statusName) return false;
  const needle = statusName.trim().toLowerCase();
  return settings.excludeEmploymentStatuses.some(
    (s) => s.trim().toLowerCase() === needle,
  );
}

/**
 * Build per-employee payroll from approved attendance + roster labels + salaryToPay.
 */
export function calculateVenuePayroll(input: {
  period: PayrollPeriod;
  settings: HrPayrollSettings;
  leavePolicy: HrLeavePolicySettings;
  salaryPct: SalaryPercentages;
  staff: PayrollStaffInput[];
  scheduleDays: ScheduleDayInput[];
  approvedAttendance: AttendanceDayInput[];
  pendingAttendance?: AttendanceDayInput[];
  benefits?: BenefitAllocationInput[];
  adjustments?: ManualAdjustmentInput[];
}): {
  employees: CalculatedEmployeePayroll[];
  exceptions: PayrollExceptionDraft[];
  totals: PayrollRunTotals;
} {
  const {
    period,
    settings,
    leavePolicy,
    salaryPct,
    staff,
    scheduleDays,
    approvedAttendance,
    pendingAttendance = [],
    benefits = [],
    adjustments = [],
  } = input;

  const scheduleByEmpDate = new Map<string, string>();
  for (const day of scheduleDays) {
    scheduleByEmpDate.set(
      `${empKey(day.emp_no)}:${day.work_date}`,
      day.label_code,
    );
  }

  const approvedSet = new Set<string>();
  for (const day of approvedAttendance) {
    approvedSet.add(`${empKey(day.emp_no)}:${day.work_date}`);
  }

  const pendingByEmp = new Map<string, AttendanceDayInput[]>();
  for (const day of pendingAttendance) {
    if (day.approval_status === "approved") continue;
    const k = empKey(day.emp_no);
    const list = pendingByEmp.get(k) ?? [];
    list.push(day);
    pendingByEmp.set(k, list);
  }

  const benefitsByStaff = new Map<string, BenefitAllocationInput[]>();
  for (const b of benefits) {
    const list = benefitsByStaff.get(b.staff_id) ?? [];
    list.push(b);
    benefitsByStaff.set(b.staff_id, list);
  }

  const adjustmentsByStaff = new Map<string, ManualAdjustmentInput[]>();
  for (const a of adjustments) {
    const list = adjustmentsByStaff.get(a.staffId) ?? [];
    list.push(a);
    adjustmentsByStaff.set(a.staffId, list);
  }

  const employees: CalculatedEmployeePayroll[] = [];
  const exceptions: PayrollExceptionDraft[] = [];

  for (const s of staff) {
    const joining = s.joining_date?.trim() || null;
    const termination = s.termination_date?.trim() || null;

    // Not employed overlapping the period
    if (joining && joining > period.periodEnd) continue;
    if (termination && termination < period.periodStart) continue;

    const windowStart = joining
      ? maxIsoDate(period.periodStart, joining)
      : period.periodStart;
    const windowEnd = termination
      ? minIsoDate(period.periodEnd, termination)
      : period.periodEnd;

    if (windowStart > windowEnd) continue;

    const inAccom = isInAccommodation(s.company_accommodation);
    const breakdown = computeSalaryBreakdown(s.wage_package, inAccom, salaryPct);
    const basic = s.basic_salary_60 ?? breakdown.basic;
    const accom = s.accom_all_25 ?? breakdown.accom;
    const transp = s.transp_all_15 ?? breakdown.transp;
    const salaryToPay = breakdown.salaryToPay;
    const dailyRate = computeDailyRate(salaryToPay);

    const isNewJoiner = Boolean(joining && joining >= period.periodStart && joining <= period.periodEnd);
    const isLeaver = Boolean(
      termination && termination >= period.periodStart && termination <= period.periodEnd,
    );

    let included = true;
    let excludeReason: string | null = null;

    if (statusExcluded(s.employment_status, settings)) {
      included = false;
      excludeReason = `Employment status: ${s.employment_status}`;
    }

    if (!salaryToPay || salaryToPay <= 0) {
      exceptions.push({
        staffId: s.id,
        empNo: s.emp_no,
        severity: "blocking",
        exceptionType: "missing_salary",
        message: `${s.full_name}: Salary to pay is missing or zero.`,
      });
    }

    if (included && !s.wps_employee_id?.trim()) {
      exceptions.push({
        staffId: s.id,
        empNo: s.emp_no,
        severity: "warning",
        exceptionType: "missing_wps_id",
        message: `${s.full_name}: WPS employee ID is missing.`,
      });
    }

    if (included && !s.iban?.trim()) {
      exceptions.push({
        staffId: s.id,
        empNo: s.emp_no,
        severity: "warning",
        exceptionType: "missing_iban",
        message: `${s.full_name}: IBAN is missing.`,
      });
    }

    const dayFractions: PayrollDayFraction[] = [];
    let paidDays = 0;
    let unpaidDays = 0;
    let halfPayDays = 0;
    let missingApproval = 0;

    for (const workDate of eachIsoDate(windowStart, windowEnd)) {
      const key = `${empKey(s.emp_no)}:${workDate}`;
      const label = scheduleByEmpDate.get(key) ?? null;
      const approved = approvedSet.has(key);

      if (!label) {
        exceptions.push({
          staffId: s.id,
          empNo: s.emp_no,
          severity: "blocking",
          exceptionType: "missing_roster",
          message: `${s.full_name}: no roster label on ${workDate}.`,
          workDate,
        });
        dayFractions.push({
          workDate,
          labelCode: "—",
          approved: false,
          payFraction: 0,
          unpaidFraction: 1,
          isLeave: false,
        });
        missingApproval += 1;
        continue;
      }

      if (!approved) {
        missingApproval += 1;
        exceptions.push({
          staffId: s.id,
          empNo: s.emp_no,
          severity: "blocking",
          exceptionType: "attendance_not_approved",
          message: `${s.full_name}: attendance not approved for ${workDate} (${label}).`,
          workDate,
          meta: { label },
        });
      }

      const frac = payFractionForLabel(label, leavePolicy);
      dayFractions.push({
        workDate,
        labelCode: label,
        approved,
        payFraction: approved ? frac.payFraction : 0,
        unpaidFraction: approved ? frac.unpaidFraction : 1,
        isLeave: frac.isLeave,
      });

      if (approved) {
        paidDays += frac.payFraction;
        unpaidDays += frac.unpaidFraction;
        if (frac.paidStatus === "half_pay") halfPayDays += 1;
      }
    }

    if (
      settings.excludeFullyUnpaidLeave &&
      paidDays === 0 &&
      unpaidDays > 0 &&
      included
    ) {
      included = false;
      excludeReason = "Fully unpaid leave in period";
    }

    const lines: CalculatedPayrollLine[] = [];
    let sort = 0;

    const fixedPay =
      dailyRate != null && included ? round2(dailyRate * paidDays) : 0;

    if (included && dailyRate != null) {
      // Split fixed pay across basic / accom / transport proportional to salaryToPay components
      const payableBasic =
        inAccom || !salaryToPay
          ? fixedPay
          : round2(fixedPay * ((basic ?? 0) / salaryToPay));
      const payableAccom =
        inAccom || !salaryToPay
          ? 0
          : round2(fixedPay * ((accom ?? 0) / salaryToPay));
      let payableTransp =
        inAccom || !salaryToPay
          ? 0
          : round2(fixedPay * ((transp ?? 0) / salaryToPay));
      // Fix rounding drift on last component
      const drift = round2(fixedPay - payableBasic - payableAccom - payableTransp);
      payableTransp = round2(payableTransp + drift);

      lines.push({
        category: "fixed",
        code: "BASIC",
        label: "Basic salary",
        amount: payableBasic,
        quantity: paidDays,
        rate: dailyRate,
        source: "system",
        sortOrder: sort++,
        meta: { companyAccommodation: inAccom },
      });
      if (!inAccom) {
        lines.push({
          category: "fixed",
          code: "ACCOM",
          label: "Accommodation allowance",
          amount: payableAccom,
          quantity: paidDays,
          rate: dailyRate,
          source: "system",
          sortOrder: sort++,
        });
        lines.push({
          category: "fixed",
          code: "TRANSP",
          label: "Transportation allowance",
          amount: payableTransp,
          quantity: paidDays,
          rate: dailyRate,
          source: "system",
          sortOrder: sort++,
        });
      } else {
        lines.push({
          category: "fixed",
          code: "ACCOM_WITHHELD",
          label: "Accommodation allowance (company housing — not payable)",
          amount: 0,
          source: "system",
          sortOrder: sort++,
          meta: { packageAccom: accom },
        });
        lines.push({
          category: "fixed",
          code: "TRANSP_WITHHELD",
          label: "Transportation allowance (company housing — not payable)",
          amount: 0,
          source: "system",
          sortOrder: sort++,
          meta: { packageTransp: transp },
        });
      }
    }

    if (included && unpaidDays > 0 && dailyRate != null) {
      lines.push({
        category: "deduction",
        code: "UNPAID_LEAVE",
        label: "Unpaid leave / absence",
        amount: round2(dailyRate * unpaidDays),
        quantity: unpaidDays,
        rate: dailyRate,
        source: "system",
        sortOrder: sort++,
      });
    }

    // Benefits (tips / service charge hooks)
    for (const b of benefitsByStaff.get(s.id) ?? []) {
      if (!included || b.amount === 0) continue;
      const code =
        b.benefit_type === "tips"
          ? "TIPS"
          : b.benefit_type === "service_charge"
            ? "SERVICE_CHARGE"
            : b.benefit_type === "compensation"
              ? "COMPENSATION"
              : "BENEFIT_OTHER";
      lines.push({
        category: "variable",
        code,
        label:
          b.benefit_type === "tips"
            ? "Tips (Gratuity)"
            : b.benefit_type === "service_charge"
              ? "Service charge"
              : b.benefit_type === "compensation"
                ? "Compensations"
                : "Other benefit",
        amount: round2(b.amount),
        source: "benefits",
        sortOrder: sort++,
      });
    }

    // Manual / retro adjustments
    for (const adj of adjustmentsByStaff.get(s.id) ?? []) {
      if (!included) continue;
      let amount = adj.amount;
      if (
        adj.percentOfDailyRate != null &&
        dailyRate != null &&
        adj.daysApplied != null
      ) {
        amount = round2(
          dailyRate * (adj.percentOfDailyRate / 100) * adj.daysApplied,
        );
      }
      lines.push({
        category: adj.category,
        code: adj.code,
        label: adj.label,
        amount: round2(Math.abs(amount)),
        quantity: adj.daysApplied ?? null,
        rate: dailyRate,
        source: adj.source ?? "adjustment",
        sortOrder: sort++,
        meta:
          adj.percentOfDailyRate != null
            ? { percentOfDailyRate: adj.percentOfDailyRate }
            : undefined,
      });
    }

    const fixedEarnings = round2(
      lines.filter((l) => l.category === "fixed").reduce((s, l) => s + l.amount, 0),
    );
    const variableEarnings = round2(
      lines
        .filter((l) => l.category === "variable")
        .reduce((sum, l) => sum + l.amount, 0),
    );
    const totalDeductions = round2(
      lines
        .filter((l) => l.category === "deduction")
        .reduce((sum, l) => sum + l.amount, 0),
    );
    const grossEarnings = round2(fixedEarnings + variableEarnings);
    // Unpaid leave is already reflected by paying only paidDays; if we also
    // added an UNPAID_LEAVE deduction line it would double-count. Prefer
    // reducing payable days only — strip UNPAID_LEAVE from net math.
    const deductionForNet = round2(
      lines
        .filter((l) => l.category === "deduction" && l.code !== "UNPAID_LEAVE")
        .reduce((sum, l) => sum + l.amount, 0),
    );
    const netSalary = included ? round2(grossEarnings - deductionForNet) : 0;

    // Keep unpaid leave line for display only (informational) — amount shown, not netted twice
    const displayDeductions = round2(
      lines
        .filter((l) => l.category === "deduction")
        .reduce((sum, l) => sum + (l.code === "UNPAID_LEAVE" ? 0 : l.amount), 0),
    );

    employees.push({
      staffId: s.id,
      empNo: s.emp_no,
      fullName: s.full_name,
      departmentId: s.department_id,
      departmentName: s.department_name,
      positionId: s.position_id,
      positionName: s.position_name,
      included,
      excludeReason,
      isNewJoiner,
      isLeaver,
      employmentStatus: s.employment_status,
      wpsEmployeeId: s.wps_employee_id,
      iban: s.iban,
      bankName: s.bank_name,
      swiftCode: s.swift_code,
      wagePackage: s.wage_package,
      basicSalary: basic,
      accomAllowance: accom,
      transpAllowance: transp,
      salaryToPay,
      companyAccommodation: inAccom,
      dailyRate,
      calendarDays: calendarDaysInclusive(windowStart, windowEnd),
      paidDays: round2(paidDays),
      unpaidDays: round2(unpaidDays),
      halfPayDays: round2(halfPayDays),
      fixedEarnings: included ? fixedEarnings : 0,
      variableEarnings: included ? variableEarnings : 0,
      totalDeductions: included ? displayDeductions : 0,
      grossEarnings: included ? grossEarnings : 0,
      netSalary,
      lines: included
        ? lines.filter((l) => l.code !== "UNPAID_LEAVE")
        : [],
      dayFractions,
    });

    // Re-add informational unpaid summary as a non-netting note via exception when missing approvals
    if (missingApproval > 0) {
      // already pushed per-day; add rollup info
      exceptions.push({
        staffId: s.id,
        empNo: s.emp_no,
        severity: "blocking",
        exceptionType: "attendance_incomplete",
        message: `${s.full_name}: ${missingApproval} day(s) missing approval or roster in period.`,
        meta: { missingApproval },
      });
    }
  }

  const totals = summarizeEmployees(employees);
  return { employees, exceptions, totals };
}

export function summarizeEmployees(
  employees: CalculatedEmployeePayroll[],
): PayrollRunTotals {
  const totals = emptyPayrollTotals();
  totals.employeeCount = employees.length;
  for (const e of employees) {
    if (e.included) totals.includedCount += 1;
    else totals.excludedCount += 1;
    if (e.isNewJoiner) totals.newJoinerCount += 1;
    if (e.isLeaver) totals.leaverCount += 1;
    if (!e.included) continue;

    totals.grossPayroll = round2(totals.grossPayroll + e.grossEarnings);
    totals.netPayroll = round2(totals.netPayroll + e.netSalary);
    totals.deductionsTotal = round2(totals.deductionsTotal + e.totalDeductions);

    for (const line of e.lines) {
      if (line.code === "BASIC") {
        totals.basicSalaryTotal = round2(totals.basicSalaryTotal + line.amount);
      } else if (line.code === "ACCOM" || line.code === "TRANSP") {
        totals.allowancesTotal = round2(totals.allowancesTotal + line.amount);
      } else if (line.code === "TIPS" || line.code === "SERVICE_CHARGE") {
        totals.tipsAndServiceCharge = round2(
          totals.tipsAndServiceCharge + line.amount,
        );
      } else if (line.code === "BONUS" || line.code === "COMPENSATION") {
        totals.bonuses = round2(totals.bonuses + line.amount);
      } else if (
        line.code === "REIMBURSEMENT" ||
        line.code === "PAYBACK" ||
        line.code === "EXPENSE_RETURN"
      ) {
        totals.reimbursements = round2(totals.reimbursements + line.amount);
      } else if (line.code === "OT" || line.code === "OVERTIME") {
        totals.overtimeTotal = round2(totals.overtimeTotal + line.amount);
      }
    }
  }
  totals.employerPayrollCost = totals.grossPayroll;
  return totals;
}
