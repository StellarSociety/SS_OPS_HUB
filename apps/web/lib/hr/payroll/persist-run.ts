import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeLeavePolicy } from "@/lib/hr/leave";
import {
  getHrVenueSetting,
  getStaffById,
  listAttendanceDaysForStaff,
  listScheduleDaysByDateRange,
  listShiftTemplates,
  listStaffForVenue,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
  type HrLeavePolicySettings,
  type HrSalaryDefaults,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import {
  calculateVenuePayroll,
  summarizeEmployees,
  type PayrollStaffInput,
} from "./calculate";
import { mergePayrollSettings, resolvePayrollPeriod } from "./period";
import { sumVenueNetRevenueForPeriod } from "./period-revenue";
import type {
  CalculatedEmployeePayroll,
  HrPayrollSettings,
  PayrollPaymentMethod,
  PayrollRunTotals,
} from "./types";
import { emptyPayrollTotals } from "./types";
import {
  mergePayrollAdjustmentCodes,
  type HrPayrollAdjustmentCodesSettings,
  type PayrollAdjustmentCodeConfig,
} from "./adjustment-codes";
import { promotePendingPayrollDeductions } from "./pending-deductions";

export async function loadPayrollSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrPayrollSettings> {
  const raw = await getHrVenueSetting<Partial<HrPayrollSettings>>(
    supabase,
    venueId,
    HR_SETTINGS_KEYS.payroll,
    {},
  );
  return mergePayrollSettings(raw);
}

export async function loadPayrollAdjustmentCodes(
  supabase: SupabaseClient,
  venueId: string,
): Promise<PayrollAdjustmentCodeConfig[]> {
  const raw = await getHrVenueSetting<
    Partial<HrPayrollAdjustmentCodesSettings>
  >(supabase, venueId, HR_SETTINGS_KEYS.payrollAdjustmentCodes, {});
  return mergePayrollAdjustmentCodes(raw);
}

/** WPS when IBAN is present; otherwise the venue's no-bank method (cash / cheque / other). */
export function resolveEmployeePaymentMethod(
  iban: string | null | undefined,
  settings: HrPayrollSettings,
): PayrollPaymentMethod {
  const cleaned = iban?.replace(/\s+/g, "").trim() ?? "";
  if (cleaned) return "wps";
  return settings.noBankPaymentMethod;
}

function toStaffInput(
  rows: Awaited<ReturnType<typeof listStaffForVenue>>,
): PayrollStaffInput[] {
  return rows.map((s) => ({
    id: s.id,
    emp_no: s.emp_no,
    full_name: s.full_name,
    department_id: s.department_id,
    department_name: s.department?.name ?? null,
    position_id: s.position_id,
    position_name: s.position?.name ?? null,
    joining_date: s.joining_date,
    termination_date: s.termination_date,
    employment_status: s.employment_status?.name ?? null,
    working_status: s.working_status?.name ?? null,
    wps_employee_id:
      (s as { wps_employee_id?: string | null }).wps_employee_id ?? null,
    iban: s.iban,
    bank_name: s.bank_name,
    swift_code: s.swift_code,
    wage_package: s.wage_package,
    company_accommodation: s.company_accommodation,
    basic_salary_60: s.basic_salary_60,
    accom_all_25: s.accom_all_25,
    transp_all_15: s.transp_all_15,
    fly_home_ticket_per_year: s.fly_home_ticket_per_year,
  }));
}

export async function persistCalculatedPayrollRun(opts: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  runId: string;
  period: ReturnType<typeof resolvePayrollPeriod>;
  userId: string;
  keepAdjustments?: boolean;
}) {
  const { service, venueId, runId, period, userId } = opts;

  const supabase = service as unknown as SupabaseClient;
  const settings = await loadPayrollSettings(supabase, venueId);
  const adjustmentCodes = await loadPayrollAdjustmentCodes(supabase, venueId);
  const leaveRaw = await getHrVenueSetting<Partial<HrLeavePolicySettings>>(
    supabase,
    venueId,
    HR_SETTINGS_KEYS.leavePolicy,
    {},
  );
  const leavePolicy = mergeLeavePolicy(leaveRaw);
  const salaryDefaults = await getHrVenueSetting<HrSalaryDefaults>(
    supabase,
    venueId,
    HR_SETTINGS_KEYS.salaryDefaults,
    DEFAULT_HR_SALARY_DEFAULTS,
  );
  const importRules = await getHrVenueSetting<HrAttendanceImportRules>(
    supabase,
    venueId,
    HR_SETTINGS_KEYS.attendanceImportRules,
    DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  );

  const staffRows = await listStaffForVenue(supabase, venueId);
  const staffInputs = toStaffInput(staffRows);
  const staffIds = staffInputs.map((s) => s.id);
  const empNos = staffInputs.map((s) => s.emp_no);

  // Attach any queued deductions (e.g. uniform replacements) before calc.
  await promotePendingPayrollDeductions({
    service,
    venueId,
    runId,
    actorId: userId,
  });

  const [scheduleDays, attendanceDays, shiftTemplates, adjustmentsRes, benefitsRes] =
    await Promise.all([
      listScheduleDaysByDateRange(supabase, venueId, {
        fromDate: period.periodStart,
        toDate: period.periodEnd,
      }),
      listAttendanceDaysForStaff(supabase, venueId, {
        staffIds,
        empNos,
        fromDate: period.periodStart,
        toDate: period.periodEnd,
      }),
      listShiftTemplates(supabase, venueId, { includeInactive: true }),
      service
        .from("hr_payroll_adjustments")
        .select("*")
        .eq("run_id", runId),
      service
        .from("hr_benefit_allocations")
        .select(
          "staff_id, benefit_type, amount, status, period_start, run:hr_benefit_runs(benefit_month)",
        )
        .eq("venue_id", venueId)
        .lte("period_start", period.periodEnd)
        .gte("period_end", period.periodStart)
        .in("status", ["applied_to_payroll"]),
    ]);

  const shiftTemplateMap = Object.fromEntries(
    (shiftTemplates ?? []).map((t) => [
      t.id,
      { startTime: t.startTime, endTime: t.endTime },
    ]),
  );

  const adjustments = (adjustmentsRes.data ?? []).map((a) => ({
    staffId: a.staff_id as string,
    category: a.category as "fixed" | "variable" | "deduction" | "addon",
    code: a.code as string,
    label: a.label as string,
    amount: Number(a.amount),
    percentOfDailyRate:
      a.percent_of_daily_rate != null
        ? Number(a.percent_of_daily_rate)
        : null,
    daysApplied: a.days_applied != null ? Number(a.days_applied) : null,
    source: "adjustment" as const,
  }));

  const benefits = (benefitsRes.data ?? []).map((b) => {
    const runRaw = b.run as
      | { benefit_month?: string }
      | { benefit_month?: string }[]
      | null;
    const run = Array.isArray(runRaw) ? runRaw[0] : runRaw;
    return {
      staff_id: b.staff_id as string,
      benefit_type: b.benefit_type as string,
      amount: Number(b.amount),
      benefit_month: run?.benefit_month
        ? String(run.benefit_month).slice(0, 10)
        : null,
      period_start: b.period_start
        ? String(b.period_start).slice(0, 10)
        : null,
    };
  });

  const { employees, exceptions, totals } = calculateVenuePayroll({
    period,
    settings,
    leavePolicy,
    salaryPct: {
      basic: salaryDefaults.basicPct,
      accom: salaryDefaults.accomPct,
      transp: salaryDefaults.transpPct,
    },
    staff: staffInputs,
    scheduleDays,
    attendanceDays,
    shiftTemplates: shiftTemplateMap,
    timezone: importRules.timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
    varianceMinutes:
      importRules.scheduleVarianceMinutes ??
      DEFAULT_HR_ATTENDANCE_IMPORT_RULES.scheduleVarianceMinutes,
    benefits,
    adjustments,
    adjustmentCodes,
  });

  await service.from("hr_payroll_lines").delete().eq("run_id", runId);
  await service.from("hr_payroll_exceptions").delete().eq("run_id", runId);
  await service.from("hr_payroll_payments").delete().eq("run_id", runId);
  // Detach adjustments before run employees are replaced — avoids CASCADE
  // deleting staging rows when run_employee_id still uses ON DELETE CASCADE.
  await service
    .from("hr_payroll_adjustments")
    .update({ run_employee_id: null })
    .eq("run_id", runId);
  await service.from("hr_payroll_run_employees").delete().eq("run_id", runId);

  if (employees.length > 0) {
    const empPayload = employees.map((e) => ({
      venue_id: venueId,
      run_id: runId,
      staff_id: e.staffId,
      emp_no: e.empNo,
      full_name: e.fullName,
      department_id: e.departmentId,
      department_name: e.departmentName,
      position_id: e.positionId,
      position_name: e.positionName,
      included: e.included,
      exclude_reason: e.excludeReason,
      is_new_joiner: e.isNewJoiner,
      is_leaver: e.isLeaver,
      employment_status: e.employmentStatus,
      wps_employee_id: e.wpsEmployeeId,
      iban: e.iban,
      bank_name: e.bankName,
      swift_code: e.swiftCode,
      wage_package: e.wagePackage,
      basic_salary: e.basicSalary,
      accom_allowance: e.accomAllowance,
      transp_allowance: e.transpAllowance,
      salary_to_pay: e.salaryToPay,
      company_accommodation: e.companyAccommodation,
      daily_rate: e.dailyRate,
      calendar_days: e.calendarDays,
      paid_days: e.paidDays,
      unpaid_days: e.unpaidDays,
      half_pay_days: e.halfPayDays,
      fixed_earnings: e.fixedEarnings,
      variable_earnings: e.variableEarnings,
      total_deductions: e.totalDeductions,
      gross_earnings: e.grossEarnings,
      net_salary: e.netSalary,
      snapshot: {
        dayFractions: e.dayFractions,
        effectivePaidDays: e.effectivePaidDays,
        joiningDate:
          staffInputs.find((s) => s.id === e.staffId)?.joining_date ?? null,
        terminationDate:
          staffInputs.find((s) => s.id === e.staffId)?.termination_date ?? null,
        workingStatus:
          staffInputs.find((s) => s.id === e.staffId)?.working_status ?? null,
      },
      updated_at: new Date().toISOString(),
    }));

    const { data: insertedEmps, error: empErr } = await service
      .from("hr_payroll_run_employees")
      .insert(empPayload)
      .select("id, staff_id");

    if (empErr) throw new Error(empErr.message);

    const staffToRunEmp = new Map(
      (insertedEmps ?? []).map((r) => [r.staff_id as string, r.id as string]),
    );

    const relinkPayload = (insertedEmps ?? [])
      .map((r) => ({
        staff_id: r.staff_id as string,
        run_employee_id: r.id as string,
      }))
      .filter((r) => r.staff_id && r.run_employee_id);

    // Batch relink — avoid sequential updates (one round-trip per employee).
    await Promise.all(
      relinkPayload.map((row) =>
        service
          .from("hr_payroll_adjustments")
          .update({ run_employee_id: row.run_employee_id })
          .eq("run_id", runId)
          .eq("staff_id", row.staff_id),
      ),
    );

    const linePayload: Record<string, unknown>[] = [];
    for (const e of employees) {
      const runEmpId = staffToRunEmp.get(e.staffId);
      if (!runEmpId) continue;
      for (const line of e.lines) {
        linePayload.push({
          venue_id: venueId,
          run_id: runId,
          run_employee_id: runEmpId,
          category: line.category,
          code: line.code,
          label: line.label,
          amount: line.amount,
          quantity: line.quantity ?? null,
          rate: line.rate ?? null,
          meta: line.meta ?? {},
          source: line.source,
          sort_order: line.sortOrder,
        });
      }
    }
    if (linePayload.length > 0) {
      const { error: lineErr } = await service
        .from("hr_payroll_lines")
        .insert(linePayload);
      if (lineErr) throw new Error(lineErr.message);
    }

    const paymentPayload = employees
      .filter((e) => e.included)
      .map((e) => {
        const runEmpId = staffToRunEmp.get(e.staffId);
        return {
          venue_id: venueId,
          run_id: runId,
          run_employee_id: runEmpId,
          staff_id: e.staffId,
          wps_employee_id: e.wpsEmployeeId,
          iban: e.iban,
          bank_name: e.bankName,
          fixed_salary: e.fixedEarnings,
          variable_salary: e.variableEarnings,
          days_paid: e.paidDays,
          leave_days: e.dayFractions.filter((d) => d.isLeave && d.approved)
            .length,
          net_salary: e.netSalary,
          payment_method: resolveEmployeePaymentMethod(e.iban, settings),
          status: "pending",
          updated_at: new Date().toISOString(),
        };
      })
      .filter((p) => p.run_employee_id);

    if (paymentPayload.length > 0) {
      const { error: payErr } = await service
        .from("hr_payroll_payments")
        .insert(paymentPayload);
      if (payErr) throw new Error(payErr.message);
    }

    const leaverPayload = employees
      .filter((e) => e.isLeaver)
      .map((e) => {
        const runEmpId = staffToRunEmp.get(e.staffId);
        const staff = staffInputs.find((s) => s.id === e.staffId);
        return {
          venue_id: venueId,
          run_id: runId,
          run_employee_id: runEmpId,
          staff_id: e.staffId,
          termination_date: staff?.termination_date ?? null,
          leave_encashment: 0,
          outstanding_advances: 0,
          eosb_amount: 0,
          other_amount: 0,
          net_settlement: e.netSalary,
          include_in_run: true,
          updated_at: new Date().toISOString(),
        };
      })
      .filter((s) => s.run_employee_id);

    if (leaverPayload.length > 0) {
      await service.from("hr_payroll_settlements").upsert(leaverPayload, {
        onConflict: "run_id,staff_id",
      });
    }
  }

  if (exceptions.length > 0) {
    const { error: exErr } = await service.from("hr_payroll_exceptions").insert(
      exceptions.map((ex) => ({
        venue_id: venueId,
        run_id: runId,
        staff_id: ex.staffId,
        emp_no: ex.empNo,
        severity: ex.severity,
        exception_type: ex.exceptionType,
        message: ex.message,
        work_date: ex.workDate ?? null,
        meta: ex.meta ?? {},
      })),
    );
    if (exErr) throw new Error(exErr.message);
  }

  const runUpdate: Record<string, unknown> = {
    period_start: period.periodStart,
    period_end: period.periodEnd,
    payment_date: period.paymentDate,
    totals,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  try {
    const revenue = await sumVenueNetRevenueForPeriod(
      supabase,
      venueId,
      period.periodStart,
      period.periodEnd,
    );
    runUpdate.revenue_amount = revenue.netRevenue;
  } catch {
    // Daily sales may be unavailable — leave revenue_amount unchanged.
  }

  const { error: runErr } = await service
    .from("hr_payroll_runs")
    .update(runUpdate)
    .eq("id", runId)
    .eq("venue_id", venueId);

  if (runErr) throw new Error(runErr.message);

  return { totals, employeeCount: employees.length };
}

async function loadPayrollCalcContext(
  supabase: SupabaseClient,
  venueId: string,
) {
  const [settings, adjustmentCodes, leaveRaw, salaryDefaults, importRules] =
    await Promise.all([
      loadPayrollSettings(supabase, venueId),
      loadPayrollAdjustmentCodes(supabase, venueId),
      getHrVenueSetting<Partial<HrLeavePolicySettings>>(
        supabase,
        venueId,
        HR_SETTINGS_KEYS.leavePolicy,
        {},
      ),
      getHrVenueSetting<HrSalaryDefaults>(
        supabase,
        venueId,
        HR_SETTINGS_KEYS.salaryDefaults,
        DEFAULT_HR_SALARY_DEFAULTS,
      ),
      getHrVenueSetting<HrAttendanceImportRules>(
        supabase,
        venueId,
        HR_SETTINGS_KEYS.attendanceImportRules,
        DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
      ),
    ]);

  return {
    settings,
    adjustmentCodes,
    leavePolicy: mergeLeavePolicy(leaveRaw),
    salaryDefaults,
    importRules,
  };
}

function staffRowToInput(
  s: Awaited<ReturnType<typeof getStaffById>>,
): PayrollStaffInput {
  return {
    id: s.id,
    emp_no: s.emp_no,
    full_name: s.full_name,
    department_id: s.department_id,
    department_name: s.department?.name ?? null,
    position_id: s.position_id,
    position_name: s.position?.name ?? null,
    joining_date: s.joining_date,
    termination_date: s.termination_date,
    employment_status: s.employment_status?.name ?? null,
    working_status: s.working_status?.name ?? null,
    wps_employee_id:
      (s as { wps_employee_id?: string | null }).wps_employee_id ?? null,
    iban: s.iban,
    bank_name: s.bank_name,
    swift_code: s.swift_code,
    wage_package: s.wage_package,
    company_accommodation: s.company_accommodation,
    basic_salary_60: s.basic_salary_60,
    accom_all_25: s.accom_all_25,
    transp_all_15: s.transp_all_15,
    fly_home_ticket_per_year: s.fly_home_ticket_per_year,
  };
}

export async function recomputeRunTotalsFromDb(
  service: ReturnType<typeof createServiceClient>,
  runId: string,
): Promise<PayrollRunTotals> {
  const [{ data: empRows }, { data: lineRows }] = await Promise.all([
    service
      .from("hr_payroll_run_employees")
      .select(
        "id, included, is_new_joiner, is_leaver, gross_earnings, net_salary, total_deductions",
      )
      .eq("run_id", runId),
    service
      .from("hr_payroll_lines")
      .select("run_employee_id, code, amount")
      .eq("run_id", runId),
  ]);

  const linesByEmp = new Map<string, { code: string; amount: number }[]>();
  for (const line of lineRows ?? []) {
    const empId = line.run_employee_id as string;
    const list = linesByEmp.get(empId) ?? [];
    list.push({ code: line.code as string, amount: Number(line.amount) });
    linesByEmp.set(empId, list);
  }

  const employees = (empRows ?? []).map((e) => ({
    staffId: e.id as string,
    empNo: "",
    fullName: "",
    departmentId: null,
    departmentName: null,
    positionId: null,
    positionName: null,
    included: Boolean(e.included),
    excludeReason: null,
    isNewJoiner: Boolean(e.is_new_joiner),
    isLeaver: Boolean(e.is_leaver),
    employmentStatus: null,
    wpsEmployeeId: null,
    iban: null,
    bankName: null,
    swiftCode: null,
    wagePackage: null,
    basicSalary: null,
    accomAllowance: null,
    transpAllowance: null,
    salaryToPay: null,
    companyAccommodation: false,
    dailyRate: null,
    calendarDays: 0,
    paidDays: 0,
    unpaidDays: 0,
    halfPayDays: 0,
    effectivePaidDays: 0,
    fixedEarnings: 0,
    variableEarnings: 0,
    totalDeductions: Number(e.total_deductions ?? 0),
    grossEarnings: Number(e.gross_earnings ?? 0),
    netSalary: Number(e.net_salary ?? 0),
    lines: (linesByEmp.get(e.id as string) ?? []).map((l, i) => ({
      category: "fixed" as const,
      code: l.code,
      label: l.code,
      amount: l.amount,
      source: "system" as const,
      sortOrder: i,
    })),
    dayFractions: [],
  })) as CalculatedEmployeePayroll[];

  if (employees.length === 0) return emptyPayrollTotals();
  return summarizeEmployees(employees);
}

/** Recompute and persist run.totals from current employee rows (e.g. after include/exclude). */
export async function syncPayrollRunTotals(opts: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  runId: string;
  userId?: string;
}): Promise<PayrollRunTotals> {
  const { service, venueId, runId, userId } = opts;
  const totals = await recomputeRunTotalsFromDb(service, runId);
  const { error } = await service
    .from("hr_payroll_runs")
    .update({
      totals,
      ...(userId ? { updated_by: userId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("venue_id", venueId);

  if (error) throw new Error(error.message);
  return totals;
}

/**
 * Fast path after add/edit/delete adjustment: recalculate one employee in place.
 * Avoids wiping the whole run (attendance + all staff + lines rebuild).
 */
export async function persistSingleEmployeePayroll(opts: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  runId: string;
  staffId: string;
  period: ReturnType<typeof resolvePayrollPeriod>;
  userId: string;
}): Promise<{ totals: PayrollRunTotals }> {
  const { service, venueId, runId, staffId, period, userId } = opts;
  const supabase = service as unknown as SupabaseClient;

  const { data: runEmp, error: runEmpErr } = await service
    .from("hr_payroll_run_employees")
    .select("id")
    .eq("run_id", runId)
    .eq("staff_id", staffId)
    .maybeSingle();

  if (runEmpErr) throw new Error(runEmpErr.message);
  if (!runEmp?.id) {
    // Employee not on this run yet — fall back to full rebuild.
    return persistCalculatedPayrollRun({
      service,
      venueId,
      runId,
      period,
      userId,
    });
  }

  const runEmployeeId = runEmp.id as string;
  const ctx = await loadPayrollCalcContext(supabase, venueId);
  const staff = staffRowToInput(await getStaffById(supabase, staffId, venueId));

  await promotePendingPayrollDeductions({
    service,
    venueId,
    runId,
    staffId,
    actorId: userId,
  });

  const [scheduleDays, attendanceDays, shiftTemplates, adjustmentsRes, benefitsRes] =
    await Promise.all([
      listScheduleDaysByDateRange(supabase, venueId, {
        fromDate: period.periodStart,
        toDate: period.periodEnd,
        staffIds: [staff.id],
        empNos: [staff.emp_no],
      }),
      listAttendanceDaysForStaff(supabase, venueId, {
        staffIds: [staff.id],
        empNos: [staff.emp_no],
        fromDate: period.periodStart,
        toDate: period.periodEnd,
      }),
      listShiftTemplates(supabase, venueId, { includeInactive: true }),
      service
        .from("hr_payroll_adjustments")
        .select("*")
        .eq("run_id", runId)
        .eq("staff_id", staffId),
      service
        .from("hr_benefit_allocations")
        .select(
          "staff_id, benefit_type, amount, status, period_start, run:hr_benefit_runs(benefit_month)",
        )
        .eq("venue_id", venueId)
        .eq("staff_id", staffId)
        .lte("period_start", period.periodEnd)
        .gte("period_end", period.periodStart)
        .in("status", ["applied_to_payroll"]),
    ]);

  const shiftTemplateMap = Object.fromEntries(
    (shiftTemplates ?? []).map((t) => [
      t.id,
      { startTime: t.startTime, endTime: t.endTime },
    ]),
  );

  const adjustments = (adjustmentsRes.data ?? []).map((a) => ({
    staffId: a.staff_id as string,
    category: a.category as "fixed" | "variable" | "deduction" | "addon",
    code: a.code as string,
    label: a.label as string,
    amount: Number(a.amount),
    percentOfDailyRate:
      a.percent_of_daily_rate != null
        ? Number(a.percent_of_daily_rate)
        : null,
    daysApplied: a.days_applied != null ? Number(a.days_applied) : null,
    source: "adjustment" as const,
  }));

  const benefits = (benefitsRes.data ?? []).map((b) => {
    const runRaw = b.run as
      | { benefit_month?: string }
      | { benefit_month?: string }[]
      | null;
    const run = Array.isArray(runRaw) ? runRaw[0] : runRaw;
    return {
      staff_id: b.staff_id as string,
      benefit_type: b.benefit_type as string,
      amount: Number(b.amount),
      benefit_month: run?.benefit_month
        ? String(run.benefit_month).slice(0, 10)
        : null,
      period_start: b.period_start
        ? String(b.period_start).slice(0, 10)
        : null,
    };
  });

  const { employees, exceptions } = calculateVenuePayroll({
    period,
    settings: ctx.settings,
    leavePolicy: ctx.leavePolicy,
    salaryPct: {
      basic: ctx.salaryDefaults.basicPct,
      accom: ctx.salaryDefaults.accomPct,
      transp: ctx.salaryDefaults.transpPct,
    },
    staff: [staff],
    scheduleDays,
    attendanceDays,
    shiftTemplates: shiftTemplateMap,
    timezone:
      ctx.importRules.timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone,
    varianceMinutes:
      ctx.importRules.scheduleVarianceMinutes ??
      DEFAULT_HR_ATTENDANCE_IMPORT_RULES.scheduleVarianceMinutes,
    benefits,
    adjustments,
    adjustmentCodes: ctx.adjustmentCodes,
  });

  const e = employees[0];
  if (!e) throw new Error("Employee calculation returned no result.");

  const { error: empUpdateErr } = await service
    .from("hr_payroll_run_employees")
    .update({
      emp_no: e.empNo,
      full_name: e.fullName,
      department_id: e.departmentId,
      department_name: e.departmentName,
      position_id: e.positionId,
      position_name: e.positionName,
      included: e.included,
      exclude_reason: e.excludeReason,
      is_new_joiner: e.isNewJoiner,
      is_leaver: e.isLeaver,
      employment_status: e.employmentStatus,
      wps_employee_id: e.wpsEmployeeId,
      iban: e.iban,
      bank_name: e.bankName,
      swift_code: e.swiftCode,
      wage_package: e.wagePackage,
      basic_salary: e.basicSalary,
      accom_allowance: e.accomAllowance,
      transp_allowance: e.transpAllowance,
      salary_to_pay: e.salaryToPay,
      company_accommodation: e.companyAccommodation,
      daily_rate: e.dailyRate,
      calendar_days: e.calendarDays,
      paid_days: e.paidDays,
      unpaid_days: e.unpaidDays,
      half_pay_days: e.halfPayDays,
      fixed_earnings: e.fixedEarnings,
      variable_earnings: e.variableEarnings,
      total_deductions: e.totalDeductions,
      gross_earnings: e.grossEarnings,
      net_salary: e.netSalary,
      snapshot: {
        dayFractions: e.dayFractions,
        effectivePaidDays: e.effectivePaidDays,
        joiningDate: staff.joining_date,
        terminationDate: staff.termination_date,
        workingStatus: staff.working_status,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", runEmployeeId);

  if (empUpdateErr) throw new Error(empUpdateErr.message);

  // Keep adjustment FK stable (same run_employee row).
  await service
    .from("hr_payroll_adjustments")
    .update({ run_employee_id: runEmployeeId })
    .eq("run_id", runId)
    .eq("staff_id", staffId);

  await Promise.all([
    service
      .from("hr_payroll_lines")
      .delete()
      .eq("run_id", runId)
      .eq("run_employee_id", runEmployeeId),
    service
      .from("hr_payroll_payments")
      .delete()
      .eq("run_id", runId)
      .eq("run_employee_id", runEmployeeId),
    service
      .from("hr_payroll_exceptions")
      .delete()
      .eq("run_id", runId)
      .eq("staff_id", staffId),
  ]);

  if (e.lines.length > 0) {
    const { error: lineErr } = await service.from("hr_payroll_lines").insert(
      e.lines.map((line) => ({
        venue_id: venueId,
        run_id: runId,
        run_employee_id: runEmployeeId,
        category: line.category,
        code: line.code,
        label: line.label,
        amount: line.amount,
        quantity: line.quantity ?? null,
        rate: line.rate ?? null,
        meta: line.meta ?? {},
        source: line.source,
        sort_order: line.sortOrder,
      })),
    );
    if (lineErr) throw new Error(lineErr.message);
  }

  if (e.included) {
    const { error: payErr } = await service.from("hr_payroll_payments").insert({
      venue_id: venueId,
      run_id: runId,
      run_employee_id: runEmployeeId,
      staff_id: e.staffId,
      wps_employee_id: e.wpsEmployeeId,
      iban: e.iban,
      bank_name: e.bankName,
      fixed_salary: e.fixedEarnings,
      variable_salary: e.variableEarnings,
      days_paid: e.paidDays,
      leave_days: e.dayFractions.filter((d) => d.isLeave && d.approved).length,
      net_salary: e.netSalary,
      payment_method: resolveEmployeePaymentMethod(e.iban, ctx.settings),
      status: "pending",
      updated_at: new Date().toISOString(),
    });
    if (payErr) throw new Error(payErr.message);
  }

  if (exceptions.length > 0) {
    const { error: exErr } = await service.from("hr_payroll_exceptions").insert(
      exceptions.map((ex) => ({
        venue_id: venueId,
        run_id: runId,
        staff_id: ex.staffId,
        emp_no: ex.empNo,
        severity: ex.severity,
        exception_type: ex.exceptionType,
        message: ex.message,
        work_date: ex.workDate ?? null,
        meta: ex.meta ?? {},
      })),
    );
    if (exErr) throw new Error(exErr.message);
  }

  if (e.isLeaver) {
    await service.from("hr_payroll_settlements").upsert(
      {
        venue_id: venueId,
        run_id: runId,
        run_employee_id: runEmployeeId,
        staff_id: e.staffId,
        termination_date: staff.termination_date ?? null,
        leave_encashment: 0,
        outstanding_advances: 0,
        eosb_amount: 0,
        other_amount: 0,
        net_settlement: e.netSalary,
        include_in_run: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "run_id,staff_id" },
    );
  }

  const totals = await recomputeRunTotalsFromDb(service, runId);
  const { error: runErr } = await service
    .from("hr_payroll_runs")
    .update({
      totals,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("venue_id", venueId);

  if (runErr) throw new Error(runErr.message);

  return { totals };
}
