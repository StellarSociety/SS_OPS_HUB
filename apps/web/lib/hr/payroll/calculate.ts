import { payrollBenefitPayoutAmount } from "@/lib/hr/benefits/rounding";
import {
  computeSalaryBreakdown,
  isInAccommodation,
  type SalaryPercentages,
} from "@/lib/hr/derived";
import { isDayClearedForPayroll } from "@/lib/hr/attendance-approval";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  type HrLeavePolicySettings,
} from "@/lib/hr/types";
import {
  computeDailyRate,
  isDailyRateDiscountAdjustment,
  resolveManualAdjustmentAmount,
  round2,
  round6,
} from "./daily-rate";
import { isInternalAdjustmentCode, adjustmentFoldsIntoFixedPay, type PayrollAdjustmentCodeConfig } from "./adjustment-codes";
import { payFractionForLabel } from "./pay-fraction";
import {
  calendarDaysInclusive,
  eachIsoDate,
  formatPayrollMonthLabel,
  isPayrollLeaver,
  isTerminatedBeforePayrollMonth,
  maxIsoDate,
  payrollEmployeeWindowEnd,
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

/**
 * Prior include/exclude choice to keep across recalculate/save.
 * When present for a staff member already on the run, this wins over
 * automatic employment-status / unpaid-leave rules.
 */
export type PayrollInclusionOverride = {
  included: boolean;
  excludeReason: string | null;
};

/**
 * True when the prior row was excluded by HR (checkbox / prompt), not by
 * automatic employment-status or unpaid-leave rules.
 */
export function isManualPayrollExclusion(
  included: boolean,
  excludeReason: string | null | undefined,
): boolean {
  if (included) return false;
  const reason = (excludeReason ?? "").trim();
  if (!reason || reason === "Manually excluded") return true;
  if (reason.startsWith("Employment status:")) return false;
  if (reason === "Fully unpaid leave in period") return false;
  return true;
}

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
  working_status: string | null;
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
  shift_template_id?: string | null;
};

export type AttendanceDayInput = {
  staff_id: string | null;
  emp_no: string;
  work_date: string;
  approval_status: string;
  id?: string | null;
  clock_in?: string | null;
  clock_out?: string | null;
};

export type ShiftTemplateTimes = {
  startTime: string;
  endTime: string;
};

export type BenefitAllocationInput = {
  staff_id: string;
  benefit_type: string;
  amount: number;
  /** Named benefit month (YYYY-MM-01) when known. */
  benefit_month?: string | null;
  period_start?: string | null;
};

export type ManualAdjustmentInput = {
  staffId: string;
  category: "fixed" | "variable" | "deduction" | "addon";
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

function workDateKey(value: string | null | undefined): string {
  return String(value ?? "").trim().slice(0, 10);
}

function benefitMonthKey(b: BenefitAllocationInput): string | null {
  const raw = (b.benefit_month ?? b.period_start ?? "").trim();
  if (!raw) return null;
  const ym = raw.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  return `${ym}-01`;
}

function benefitLineLabel(
  benefitType: string,
  monthKey: string | null,
): string {
  let monthName: string | null = null;
  if (monthKey) {
    try {
      const label = formatPayrollMonthLabel(monthKey);
      monthName = label.replace(/\s+\d{4}$/, "").trim() || null;
    } catch {
      monthName = null;
    }
  }

  if (benefitType === "tips") {
    return monthName ? `Tips (${monthName} Gratuity)` : "Tips (Gratuity)";
  }
  if (benefitType === "service_charge") {
    return monthName ? `Service charge (${monthName})` : "Service charge";
  }
  if (benefitType === "compensation") {
    return monthName ? `Compensations (${monthName})` : "Compensations";
  }
  if (benefitType === "flight_ticket") {
    return monthName ? `Flight ticket (${monthName})` : "Flight ticket";
  }
  return monthName ? `Other benefit (${monthName})` : "Other benefit";
}

/** Spread a signed delta across BASIC / ACCOM / TRANSP fixed lines. */
function applyProportionalFixedDelta(
  lines: CalculatedPayrollLine[],
  delta: number,
  salaryToPay: number,
  basic: number,
  accom: number,
  transp: number,
  inAccom: boolean,
): void {
  if (delta === 0) return;

  const basicLine = lines.find((l) => l.code === "BASIC");
  if (!basicLine) return;

  if (inAccom || !salaryToPay) {
    basicLine.amount = round2(Math.max(0, basicLine.amount + delta));
    return;
  }

  const basicDelta = round2(delta * ((basic ?? 0) / salaryToPay));
  const accomDelta = round2(delta * ((accom ?? 0) / salaryToPay));
  let transpDelta = round2(delta * ((transp ?? 0) / salaryToPay));
  const drift = round2(delta - basicDelta - accomDelta - transpDelta);
  transpDelta = round2(transpDelta + drift);

  basicLine.amount = round2(Math.max(0, basicLine.amount + basicDelta));
  const accomLine = lines.find((l) => l.code === "ACCOM");
  const transpLine = lines.find((l) => l.code === "TRANSP");
  if (accomLine) {
    accomLine.amount = round2(Math.max(0, accomLine.amount + accomDelta));
  }
  if (transpLine) {
    transpLine.amount = round2(Math.max(0, transpLine.amount + transpDelta));
  }
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

function resolveShiftTemplateMap(
  templates:
    | Map<string, ShiftTemplateTimes>
    | Record<string, ShiftTemplateTimes>
    | undefined,
): Map<string, ShiftTemplateTimes> {
  if (!templates) return new Map();
  if (templates instanceof Map) return templates;
  return new Map(Object.entries(templates));
}

/**
 * Build per-employee payroll from roster labels + Validation clearance + salaryToPay.
 *
 * A day is payable when Validation does not require approval for it
 * (`isDayClearedForPayroll` / `attendanceDayRequiresApproval`).
 */
export function calculateVenuePayroll(input: {
  period: PayrollPeriod;
  settings: HrPayrollSettings;
  leavePolicy: HrLeavePolicySettings;
  salaryPct: SalaryPercentages;
  staff: PayrollStaffInput[];
  scheduleDays: ScheduleDayInput[];
  attendanceDays: AttendanceDayInput[];
  shiftTemplates?: Map<string, ShiftTemplateTimes> | Record<string, ShiftTemplateTimes>;
  timezone?: string;
  varianceMinutes?: number;
  benefits?: BenefitAllocationInput[];
  adjustments?: ManualAdjustmentInput[];
  adjustmentCodes?: PayrollAdjustmentCodeConfig[];
  /** Preserve manual include/exclude from a prior run row across rebuilds. */
  inclusionOverrides?: Map<string, PayrollInclusionOverride>;
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
    attendanceDays,
    benefits = [],
    adjustments = [],
    adjustmentCodes,
    inclusionOverrides,
  } = input;

  const timezone =
    input.timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone;
  const varianceMinutes =
    input.varianceMinutes ??
    DEFAULT_HR_ATTENDANCE_IMPORT_RULES.scheduleVarianceMinutes;
  const shiftTemplates = resolveShiftTemplateMap(input.shiftTemplates);
  const periodCalendarDays = calendarDaysInclusive(
    period.periodStart,
    period.periodEnd,
  );

  const scheduleByEmpDate = new Map<
    string,
    { label: string; shiftTemplateId: string | null }
  >();
  for (const day of scheduleDays) {
    const dateKey = workDateKey(day.work_date);
    if (!dateKey) continue;
    scheduleByEmpDate.set(`${empKey(day.emp_no)}:${dateKey}`, {
      label: day.label_code,
      shiftTemplateId: day.shift_template_id ?? null,
    });
  }

  const attendanceByEmpDate = new Map<string, AttendanceDayInput>();
  for (const day of attendanceDays) {
    const dateKey = workDateKey(day.work_date);
    if (!dateKey) continue;
    attendanceByEmpDate.set(`${empKey(day.emp_no)}:${dateKey}`, {
      ...day,
      work_date: dateKey,
    });
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

    // Not employed overlapping the period. Month-end leavers (terminated after
    // periodEnd but still in that calendar month) were settled in that month
    // and must not appear on the next 25→24 run.
    if (joining && joining > period.periodEnd) continue;
    if (isTerminatedBeforePayrollMonth(termination, period)) continue;

    const windowStart = joining
      ? maxIsoDate(period.periodStart, joining)
      : period.periodStart;
    const windowEnd = payrollEmployeeWindowEnd(termination, period);

    if (windowStart > windowEnd) continue;

    const inAccom = isInAccommodation(s.company_accommodation);
    const breakdown = computeSalaryBreakdown(s.wage_package, inAccom, salaryPct);
    const basic = s.basic_salary_60 ?? breakdown.basic;
    const accom = s.accom_all_25 ?? breakdown.accom;
    const transp = s.transp_all_15 ?? breakdown.transp;
    const salaryToPay = breakdown.salaryToPay;
    const dailyRate = computeDailyRate(salaryToPay, periodCalendarDays);

    const isNewJoiner = Boolean(joining && joining >= period.periodStart && joining <= period.periodEnd);
    const isLeaver = isPayrollLeaver(termination, period);

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
      const schedule = scheduleByEmpDate.get(key) ?? null;
      const label = schedule?.label ?? null;
      const attendance = attendanceByEmpDate.get(key) ?? null;
      const template = schedule?.shiftTemplateId
        ? shiftTemplates.get(schedule.shiftTemplateId)
        : undefined;

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
          paidStatus: "unknown",
        });
        missingApproval += 1;
        continue;
      }

      const cleared = isDayClearedForPayroll({
        rosterLabel: label,
        approvalStatus: attendance?.approval_status ?? null,
        workDate,
        attendanceId: attendance?.id ?? null,
        scheduleStart: template?.startTime ?? null,
        scheduleEnd: template?.endTime ?? null,
        clockIn: attendance?.clock_in ?? null,
        clockOut: attendance?.clock_out ?? null,
        timezone,
        varianceMinutes,
      });

      if (!cleared) {
        missingApproval += 1;
        exceptions.push({
          staffId: s.id,
          empNo: s.emp_no,
          severity: "blocking",
          exceptionType: "attendance_not_approved",
          message: `${s.full_name}: attendance not cleared for pay on ${workDate} (${label}).`,
          workDate,
          meta: { label },
        });
      }

      const frac = payFractionForLabel(label, leavePolicy);
      dayFractions.push({
        workDate,
        labelCode: label,
        approved: cleared,
        payFraction: cleared ? frac.payFraction : 0,
        unpaidFraction: cleared ? frac.unpaidFraction : 1,
        isLeave: frac.isLeave,
        paidStatus: cleared ? frac.paidStatus : "unknown",
      });

      if (cleared) {
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

    const inclusionOverride = inclusionOverrides?.get(s.id);
    // Force-include early so organic pay still calculates when HR re-ticks someone
    // the system would otherwise skip.
    if (inclusionOverride?.included && !included) {
      included = true;
      excludeReason = null;
    }

    const staffAdjustments = adjustmentsByStaff.get(s.id) ?? [];
    // Percent-only deductions discount the daily rate for all paid days.
    const rateDiscountPercent = Math.min(
      100,
      staffAdjustments
        .filter(isDailyRateDiscountAdjustment)
        .reduce((sum, a) => sum + (a.percentOfDailyRate ?? 0), 0),
    );
    const effectiveDailyRate =
      dailyRate != null
        ? round6(dailyRate * Math.max(0, 1 - rateDiscountPercent / 100))
        : null;

    const foldedAdjs = staffAdjustments.filter(
      (a) =>
        !isDailyRateDiscountAdjustment(a) &&
        adjustmentFoldsIntoFixedPay(
          {
            code: a.code,
            category: a.category,
            daysApplied: a.daysApplied,
            percentOfDailyRate: a.percentOfDailyRate,
          },
          adjustmentCodes,
        ),
    );
    const regularAdjs = staffAdjustments.filter(
      (a) =>
        !isDailyRateDiscountAdjustment(a) &&
        !adjustmentFoldsIntoFixedPay(
          {
            code: a.code,
            category: a.category,
            daysApplied: a.daysApplied,
            percentOfDailyRate: a.percentOfDailyRate,
          },
          adjustmentCodes,
        ),
    );

    // Folded adjustments with days recalculate fixed pay (basic / accom / transp).
    let fixedPayDaysDelta = 0;
    if (included && dailyRate != null && dailyRate > 0) {
      for (const adj of foldedAdjs) {
        if (adj.daysApplied == null && adj.percentOfDailyRate == null) continue;
        const resolved = resolveManualAdjustmentAmount(
          {
            amount: adj.amount,
            percentOfDailyRate: adj.percentOfDailyRate,
            daysApplied: adj.daysApplied,
            rateDiscountWhenPercentOnly: adj.category === "deduction",
          },
          dailyRate,
        );
        if (!resolved.ok) continue;
        const sign = adj.category === "deduction" ? -1 : 1;
        if (resolved.value.daysApplied != null) {
          const dayEquivalent = resolved.value.amount / dailyRate;
          fixedPayDaysDelta += sign * dayEquivalent;
        }
      }
    }
    const effectivePaidDays = round2(Math.max(0, paidDays + fixedPayDaysDelta));

    const lines: CalculatedPayrollLine[] = [];
    let sort = 0;

    const fixedPay =
      effectiveDailyRate != null && included
        ? round2(effectiveDailyRate * effectivePaidDays)
        : 0;

    if (included && effectiveDailyRate != null) {
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

      const rateDiscountMeta =
        rateDiscountPercent > 0 ? { rateDiscountPercent } : undefined;

      lines.push({
        category: "fixed",
        code: "BASIC",
        label: "Basic salary",
        amount: payableBasic,
        quantity: effectivePaidDays,
        rate: effectiveDailyRate,
        source: "system",
        sortOrder: sort++,
        meta: { companyAccommodation: inAccom, ...rateDiscountMeta },
      });
      if (!inAccom) {
        lines.push({
          category: "fixed",
          code: "ACCOM",
          label: "Accommodation allowance",
          amount: payableAccom,
          quantity: effectivePaidDays,
          rate: effectiveDailyRate,
          source: "system",
          sortOrder: sort++,
          meta: rateDiscountMeta,
        });
        lines.push({
          category: "fixed",
          code: "TRANSP",
          label: "Transportation allowance",
          amount: payableTransp,
          quantity: effectivePaidDays,
          rate: effectiveDailyRate,
          source: "system",
          sortOrder: sort++,
          meta: rateDiscountMeta,
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

      // Amount-only internal adjustments (no days / percent) — fold into fixed lines.
      for (const adj of foldedAdjs) {
        if (!isInternalAdjustmentCode(adj.code)) continue;
        if (adj.daysApplied != null || adj.percentOfDailyRate != null) continue;
        const resolved = resolveManualAdjustmentAmount(
          {
            amount: adj.amount,
            percentOfDailyRate: adj.percentOfDailyRate,
            daysApplied: adj.daysApplied,
          },
          dailyRate,
        );
        if (!resolved.ok) continue;
        const signedDelta =
          adj.category === "deduction"
            ? -resolved.value.amount
            : resolved.value.amount;
        applyProportionalFixedDelta(
          lines,
          signedDelta,
          salaryToPay ?? 0,
          basic ?? 0,
          accom ?? 0,
          transp ?? 0,
          inAccom,
        );
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
      const amount = payrollBenefitPayoutAmount(b.benefit_type, b.amount);
      if (!included || amount === 0) continue;
      const code =
        b.benefit_type === "tips"
          ? "TIPS"
          : b.benefit_type === "service_charge"
            ? "SERVICE_CHARGE"
            : b.benefit_type === "compensation"
              ? "COMPENSATION"
              : b.benefit_type === "flight_ticket"
                ? "FLIGHT_TICKET"
                : "BENEFIT_OTHER";
      const monthKey = benefitMonthKey(b);
      lines.push({
        category: "variable",
        code,
        label: benefitLineLabel(b.benefit_type, monthKey),
        amount,
        source: "benefits",
        meta: monthKey ? { benefitMonth: monthKey } : undefined,
        sortOrder: sort++,
      });
    }

    // Manual / retro adjustments (folded / rate-discount applied above)
    for (const adj of regularAdjs) {
      if (!included) continue;
      const resolved = resolveManualAdjustmentAmount(
        {
          amount: adj.amount,
          percentOfDailyRate: adj.percentOfDailyRate,
          daysApplied: adj.daysApplied,
          rateDiscountWhenPercentOnly: adj.category === "deduction",
        },
        dailyRate,
      );
      const amount = resolved.ok ? resolved.value.amount : adj.amount;
      const daysApplied = resolved.ok
        ? resolved.value.daysApplied
        : adj.daysApplied ?? null;
      const percentOfDailyRate = resolved.ok
        ? resolved.value.percentOfDailyRate
        : adj.percentOfDailyRate ?? null;
      const codeUpper = adj.code.toUpperCase();
      const lineAmount =
        codeUpper === "TIPS" || codeUpper === "SERVICE_CHARGE"
          ? payrollBenefitPayoutAmount(
              codeUpper === "SERVICE_CHARGE" ? "service_charge" : "tips",
              amount,
            )
          : round2(Math.abs(amount));
      lines.push({
        category: adj.category,
        code: adj.code,
        label: adj.label,
        amount: lineAmount,
        quantity: daysApplied,
        rate: dailyRate,
        source: adj.source ?? "adjustment",
        sortOrder: sort++,
        meta:
          percentOfDailyRate != null
            ? { percentOfDailyRate }
            : undefined,
      });
    }

    const fixedEarnings = round2(
      lines.filter((l) => l.category === "fixed").reduce((s, l) => s + l.amount, 0),
    );
    const variableEarnings = round2(
      lines
        .filter((l) => l.category === "variable" || l.category === "addon")
        .reduce((sum, l) => sum + l.amount, 0),
    );
    // Rate-discount deductions reduce fixed pay in place; still report their
    // AED impact under total deductions (without changing net math below).
    const rateDiscountAmount =
      dailyRate != null && dailyRate > 0 && rateDiscountPercent > 0
        ? round2(
            dailyRate * (rateDiscountPercent / 100) * effectivePaidDays,
          )
        : 0;
    const grossEarnings = round2(fixedEarnings + variableEarnings);
    // Unpaid leave is already reflected by paying only paidDays; if we also
    // added an UNPAID_LEAVE deduction line it would double-count. Prefer
    // reducing payable days only — strip UNPAID_LEAVE from net math.
    // Rate-discount is already baked into fixedEarnings, so do not subtract again.
    const deductionForNet = round2(
      lines
        .filter((l) => l.category === "deduction" && l.code !== "UNPAID_LEAVE")
        .reduce((sum, l) => sum + l.amount, 0),
    );
    const netSalary = round2(grossEarnings - deductionForNet);

    // Keep unpaid leave line for display only (informational) — amount shown, not netted twice
    const displayDeductions = round2(
      lines
        .filter((l) => l.category === "deduction")
        .reduce((sum, l) => sum + (l.code === "UNPAID_LEAVE" ? 0 : l.amount), 0) +
        rateDiscountAmount,
    );

    // Manual exclude: keep organic calculated pay, only drop from payroll totals/payments.
    if (inclusionOverride && !inclusionOverride.included) {
      included = false;
      excludeReason =
        inclusionOverride.excludeReason?.trim() || "Manually excluded";
    }

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
      effectivePaidDays,
      unpaidDays: round2(unpaidDays),
      halfPayDays: round2(halfPayDays),
      fixedEarnings,
      variableEarnings,
      totalDeductions: displayDeductions,
      grossEarnings,
      netSalary,
      lines: lines.filter((l) => l.code !== "UNPAID_LEAVE"),
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
        message: `${s.full_name}: ${missingApproval} day(s) not cleared for pay (need approval or roster) in period.`,
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
