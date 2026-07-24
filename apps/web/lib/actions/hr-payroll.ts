"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  canAccessPayroll,
  canAdminLookups,
  canEditPayroll,
  canViewPayslips,
  canViewSalary,
} from "@/lib/hr/permissions";
import {
  calculateVenuePayroll,
  buildGlExportLines,
  buildWpsCsv,
  glLinesToCsv,
  mergePayrollSettings,
  resolvePayrollPeriod,
  PAYROLL_STATUS_TRANSITIONS,
  isPayrollLocked,
  type HrPayrollSettings,
  type PayrollLineCategory,
  type PayrollStatus,
  type PayrollStaffInput,
} from "@/lib/hr/payroll";
import {
  getHrVenueSetting,
  listAttendanceDaysForStaff,
  listScheduleDaysByDateRange,
  listStaffForVenue,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_SALARY_DEFAULTS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrLeavePolicySettings,
  type HrSalaryDefaults,
} from "@/lib/hr/types";
import { mergeLeavePolicy } from "@/lib/hr/leave";
import { createServiceClient } from "@/lib/supabase/service";
import { ATTENDANCE_APPROVED_STATUS } from "@/lib/hr/attendance-approval";

export type PayrollActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type PayrollCsvResult =
  | { ok: true; csv: string; filename: string }
  | { ok: false; error: string };

export type PayslipListItem = {
  id: string;
  run_id: string;
  run_employee_id: string;
  staff_id: string;
  version: number;
  email_status: string;
  email_sent_at: string | null;
  pdf_path: string | null;
  created_at: string;
  payroll_month: string | null;
  emp_no: string | null;
  full_name: string | null;
};

async function getPayrollAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) {
    return { error: ctx.error } as const;
  }
  return ctx;
}

function revalidatePayroll(runId?: string) {
  revalidatePath("/hr/payroll");
  revalidatePath("/hr/payslips");
  revalidatePath("/hr/settings/pay");
  revalidatePath("/hr/benefits");
  if (runId) revalidatePath(`/hr/payroll/${runId}`);
}

async function loadPayrollSettings(
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

async function persistCalculatedRun(opts: {
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

  const staffRows = await listStaffForVenue(supabase, venueId);
  const staffInputs = toStaffInput(staffRows);
  const staffIds = staffInputs.map((s) => s.id);
  const empNos = staffInputs.map((s) => s.emp_no);

  const [scheduleDays, attendanceDays, adjustmentsRes, benefitsRes] =
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
      service
        .from("hr_payroll_adjustments")
        .select("*")
        .eq("run_id", runId),
      service
        .from("hr_benefit_allocations")
        .select("staff_id, benefit_type, amount, status")
        .eq("venue_id", venueId)
        .lte("period_start", period.periodEnd)
        .gte("period_end", period.periodStart)
        .in("status", ["finalized", "applied_to_payroll"]),
    ]);

  const approved = attendanceDays.filter(
    (d) => d.approval_status === ATTENDANCE_APPROVED_STATUS,
  );
  const pending = attendanceDays.filter(
    (d) => d.approval_status !== ATTENDANCE_APPROVED_STATUS,
  );

  const adjustments = (adjustmentsRes.data ?? []).map((a) => ({
    staffId: a.staff_id as string,
    category: a.category as "fixed" | "variable" | "deduction",
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

  const benefits = (benefitsRes.data ?? []).map((b) => ({
    staff_id: b.staff_id as string,
    benefit_type: b.benefit_type as string,
    amount: Number(b.amount),
  }));

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
    approvedAttendance: approved,
    pendingAttendance: pending,
    benefits,
    adjustments,
  });

  // Replace employees / lines / exceptions / payments (not adjustments)
  await service.from("hr_payroll_lines").delete().eq("run_id", runId);
  await service.from("hr_payroll_exceptions").delete().eq("run_id", runId);
  await service.from("hr_payroll_payments").delete().eq("run_id", runId);
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
      snapshot: { dayFractions: e.dayFractions },
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
          payment_method: "wps",
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

    // Auto-seed settlements for leavers
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

  const { error: runErr } = await service
    .from("hr_payroll_runs")
    .update({
      period_start: period.periodStart,
      period_end: period.periodEnd,
      payment_date: period.paymentDate,
      totals,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("venue_id", venueId);

  if (runErr) throw new Error(runErr.message);

  return { totals, employeeCount: employees.length };
}

export async function listPayrollRunsAction(): Promise<unknown[]> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return [];
  const { supabase, venue, permissions } = auth;
  if (!canAccessPayroll(permissions, venue.id)) return [];

  const { data, error } = await supabase
    .from("hr_payroll_runs")
    .select(
      "id, payroll_month, period_start, period_end, payment_date, status, totals, locked_at, created_at",
    )
    .eq("venue_id", venue.id)
    .order("payroll_month", { ascending: false });

  if (error) {
    console.error("[payroll] list runs:", error.message);
    return [];
  }
  return data ?? [];
}

export async function createPayrollRun(
  payrollMonth: string,
): Promise<{ id: string } | { error: string }> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { error: "You do not have permission to create payroll runs." };
  }
  if (!canViewSalary(permissions, venue.id)) {
    return { error: "Salary access is required to create payroll runs." };
  }

  try {
    const settings = await loadPayrollSettings(supabase, venue.id);
    const period = resolvePayrollPeriod(payrollMonth, settings);
    const service = createServiceClient();

    const { data: run, error } = await service
      .from("hr_payroll_runs")
      .insert({
        venue_id: venue.id,
        payroll_month: period.payrollMonth,
        period_start: period.periodStart,
        period_end: period.periodEnd,
        payment_date: period.paymentDate,
        status: "draft",
        created_by: user.id,
        updated_by: user.id,
        totals: {},
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { error: "A payroll run already exists for that month." };
      }
      return { error: error.message };
    }

    await persistCalculatedRun({
      service,
      venueId: venue.id,
      runId: run.id,
      period,
      userId: user.id,
    });

    await service.from("hr_payroll_run_events").insert({
      venue_id: venue.id,
      run_id: run.id,
      actor_id: user.id,
      from_status: null,
      to_status: "draft",
      comment: "Payroll run created",
    });

    await writeAuditLog({
      actor_id: user.id,
      venue_id: venue.id,
      action: "payroll.run_created",
      module_key: HR_MODULE_KEY,
      entity: "hr_payroll_runs",
      entity_id: run.id,
      after: { payrollMonth: period.payrollMonth },
    });

    revalidatePayroll(run.id);
    return { id: run.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create run";
    // Table missing → clearer message
    if (/hr_payroll_runs|schema cache|does not exist/i.test(message)) {
      return {
        error:
          "Payroll tables are not migrated yet. Apply supabase/migrations/20260724170000_hr_payroll.sql then retry.",
      };
    }
    return { error: message };
  }
}

export async function recalculatePayrollRun(
  runId: string,
): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission to recalculate payroll." };
  }

  const { data: run, error } = await supabase
    .from("hr_payroll_runs")
    .select("id, status, payroll_month")
    .eq("id", runId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (error || !run) return { ok: false, error: "Payroll run not found." };
  if (isPayrollLocked(run.status)) {
    return {
      ok: false,
      error: "This payroll is locked. Add corrections on the next run.",
    };
  }

  try {
    const settings = await loadPayrollSettings(supabase, venue.id);
    const period = resolvePayrollPeriod(run.payroll_month, settings);
    const service = createServiceClient();
    await persistCalculatedRun({
      service,
      venueId: venue.id,
      runId,
      period,
      userId: user.id,
    });

    await service.from("hr_payroll_run_events").insert({
      venue_id: venue.id,
      run_id: runId,
      actor_id: user.id,
      from_status: run.status,
      to_status: run.status,
      comment: "Recalculated from approved attendance",
    });

    revalidatePayroll(runId);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Recalculate failed",
    };
  }
}

export async function transitionPayrollRun(
  runId: string,
  toStatus: PayrollStatus,
  comment?: string,
): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission to change payroll status." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("id, status")
    .eq("id", runId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!run) return { ok: false, error: "Payroll run not found." };
  if (isPayrollLocked(run.status) && toStatus !== "locked") {
    return { ok: false, error: "Payroll is locked." };
  }

  const from = run.status as PayrollStatus;
  const allowed = PAYROLL_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(toStatus)) {
    return {
      ok: false,
      error: `Cannot move from ${from} to ${toStatus}.`,
    };
  }

  // Block advancing past attendance_validated while blocking exceptions remain
  if (
    toStatus === "hr_review" ||
    toStatus === "finance_review" ||
    toStatus === "final_approval"
  ) {
    const { count } = await supabase
      .from("hr_payroll_exceptions")
      .select("id", { count: "exact", head: true })
      .eq("run_id", runId)
      .eq("severity", "blocking")
      .eq("waived", false);
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: `${count} blocking exception(s) must be resolved or waived first.`,
      };
    }
  }

  const service = createServiceClient();
  const patch: Record<string, unknown> = {
    status: toStatus,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  if (toStatus === "locked" || toStatus === "paid") {
    patch.locked_at = new Date().toISOString();
  }

  const { error } = await service
    .from("hr_payroll_runs")
    .update(patch)
    .eq("id", runId)
    .eq("venue_id", venue.id);

  if (error) return { ok: false, error: error.message };

  await service.from("hr_payroll_run_events").insert({
    venue_id: venue.id,
    run_id: runId,
    actor_id: user.id,
    from_status: from,
    to_status: toStatus,
    comment: comment?.trim() || null,
  });

  if (toStatus === "paid") {
    await service
      .from("hr_payroll_payments")
      .update({
        status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", runId);
  }

  revalidatePayroll(runId);
  return { ok: true };
}

export async function waivePayrollException(
  exceptionId: string,
  comment: string,
): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }
  if (!comment.trim()) {
    return { ok: false, error: "A waive comment is required." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("hr_payroll_exceptions")
    .update({
      waived: true,
      waived_by: user.id,
      waived_at: new Date().toISOString(),
      waive_comment: comment.trim(),
    })
    .eq("id", exceptionId)
    .eq("venue_id", venue.id);

  if (error) return { ok: false, error: error.message };
  revalidatePayroll();
  return { ok: true };
}

export async function addPayrollAdjustment(input: {
  runId: string;
  staffId: string;
  category: PayrollLineCategory;
  code: string;
  label: string;
  amount?: number | null;
  percentOfDailyRate?: number | null;
  daysApplied?: number | null;
  reason: string;
}): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: "Reason is required." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("id, status, payroll_month")
    .eq("id", input.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!run) return { ok: false, error: "Run not found." };
  if (isPayrollLocked(run.status)) {
    return { ok: false, error: "Payroll is locked." };
  }

  const { data: runEmp } = await supabase
    .from("hr_payroll_run_employees")
    .select("id, daily_rate")
    .eq("run_id", input.runId)
    .eq("staff_id", input.staffId)
    .maybeSingle();

  let amount = Number(input.amount ?? 0);
  if (
    input.percentOfDailyRate != null &&
    input.daysApplied != null &&
    runEmp?.daily_rate != null
  ) {
    amount =
      Number(runEmp.daily_rate) *
      (Number(input.percentOfDailyRate) / 100) *
      Number(input.daysApplied);
  }

  const service = createServiceClient();
  const { error } = await service.from("hr_payroll_adjustments").insert({
    venue_id: venue.id,
    run_id: input.runId,
    run_employee_id: runEmp?.id ?? null,
    staff_id: input.staffId,
    category: input.category,
    code: input.code.trim().toUpperCase(),
    label: input.label.trim(),
    amount: Math.round(Math.abs(amount) * 100) / 100,
    percent_of_daily_rate: input.percentOfDailyRate ?? null,
    days_applied: input.daysApplied ?? null,
    reason: input.reason.trim(),
    source: "manual",
    created_by: user.id,
  });

  if (error) return { ok: false, error: error.message };

  // Recalculate to fold adjustment into lines
  const recalc = await recalculatePayrollRun(input.runId);
  return recalc;
}

export async function generateWpsFile(
  runId: string,
): Promise<PayrollCsvResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { venue, permissions, supabase, user } = auth;

  if (!canEditPayroll(permissions, venue.id) || !canViewSalary(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("id, payment_date, payroll_month, status")
    .eq("id", runId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!run) return { ok: false, error: "Run not found." };

  const settings = await loadPayrollSettings(supabase, venue.id);
  const { data: employees } = await supabase
    .from("hr_payroll_run_employees")
    .select("*")
    .eq("run_id", runId)
    .eq("included", true);

  const calcLike = (employees ?? []).map((e) => ({
    staffId: e.staff_id as string,
    empNo: e.emp_no as string,
    fullName: e.full_name as string,
    departmentId: null,
    departmentName: e.department_name as string | null,
    positionId: null,
    positionName: null,
    included: true,
    excludeReason: null,
    isNewJoiner: Boolean(e.is_new_joiner),
    isLeaver: Boolean(e.is_leaver),
    employmentStatus: null,
    wpsEmployeeId: e.wps_employee_id as string | null,
    iban: e.iban as string | null,
    bankName: e.bank_name as string | null,
    swiftCode: e.swift_code as string | null,
    wagePackage: null,
    basicSalary: null,
    accomAllowance: null,
    transpAllowance: null,
    salaryToPay: null,
    companyAccommodation: false,
    dailyRate: null,
    calendarDays: 0,
    paidDays: Number(e.paid_days),
    unpaidDays: Number(e.unpaid_days),
    halfPayDays: 0,
    fixedEarnings: Number(e.fixed_earnings),
    variableEarnings: Number(e.variable_earnings),
    totalDeductions: Number(e.total_deductions),
    grossEarnings: Number(e.gross_earnings),
    netSalary: Number(e.net_salary),
    lines: [],
    dayFractions: [],
  }));

  const { csv, errors } = buildWpsCsv({
    employerId: settings.wpsEmployerId,
    paymentDate: run.payment_date ?? "",
    employees: calcLike,
  });

  if (errors.length && calcLike.length === 0) {
    return { ok: false, error: errors.join(" ") };
  }

  const service = createServiceClient();
  await service
    .from("hr_payroll_payments")
    .update({
      status: "file_generated",
      file_generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", runId);

  await service.from("hr_payroll_run_events").insert({
    venue_id: venue.id,
    run_id: runId,
    actor_id: user.id,
    from_status: run.status,
    to_status: run.status,
    comment: `WPS file generated (${errors.length} warning(s))`,
    changes_summary: { warnings: errors },
  });

  const month = String(run.payroll_month).slice(0, 7);
  revalidatePayroll(runId);
  return {
    ok: true,
    csv,
    filename: `wps-${venue.slug ?? venue.id}-${month}.csv`,
  };
}

export async function markPayrollPaid(
  runId: string,
): Promise<PayrollActionResult> {
  const paid = await transitionPayrollRun(runId, "paid", "Marked as paid");
  if (!paid.ok) return paid;
  return transitionPayrollRun(runId, "locked", "Auto-locked after payment");
}

export async function generatePayslips(
  runId: string,
): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("*")
    .eq("id", runId)
    .eq("venue_id", venue.id)
    .maybeSingle();
  if (!run) return { ok: false, error: "Run not found." };

  const { data: employees } = await supabase
    .from("hr_payroll_run_employees")
    .select("*")
    .eq("run_id", runId)
    .eq("included", true);

  const { data: lines } = await supabase
    .from("hr_payroll_lines")
    .select("*")
    .eq("run_id", runId);

  const linesByEmp = new Map<string, typeof lines>();
  for (const line of lines ?? []) {
    const key = line.run_employee_id as string;
    const list = linesByEmp.get(key) ?? [];
    list.push(line);
    linesByEmp.set(key, list);
  }

  const service = createServiceClient();

  for (const emp of employees ?? []) {
    const { data: existing } = await service
      .from("hr_payslips")
      .select("version")
      .eq("run_employee_id", emp.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const version = (existing?.version ?? 0) + 1;
    const empLines = linesByEmp.get(emp.id as string) ?? [];

    const snapshot = {
      payrollMonth: run.payroll_month,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      paymentDate: run.payment_date,
      employer: { venueId: venue.id, venueName: venue.name },
      employee: {
        empNo: emp.emp_no,
        fullName: emp.full_name,
        department: emp.department_name,
        position: emp.position_name,
      },
      paidDays: emp.paid_days,
      unpaidDays: emp.unpaid_days,
      basicSalary: emp.basic_salary,
      allowances: empLines.filter(
        (l) => l.code === "ACCOM" || l.code === "TRANSP",
      ),
      variables: empLines.filter((l) => l.category === "variable"),
      deductions: empLines.filter((l) => l.category === "deduction"),
      fixed: empLines.filter((l) => l.category === "fixed"),
      grossEarnings: emp.gross_earnings,
      totalDeductions: emp.total_deductions,
      netSalary: emp.net_salary,
      version,
    };

    const { error } = await service.from("hr_payslips").insert({
      venue_id: venue.id,
      run_id: runId,
      run_employee_id: emp.id,
      staff_id: emp.staff_id,
      version,
      snapshot,
      email_status: "not_sent",
    });
    if (error) return { ok: false, error: error.message };
  }

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.payslips_generated",
    module_key: HR_MODULE_KEY,
    entity: "hr_payroll_runs",
    entity_id: runId,
    after: { count: employees?.length ?? 0 },
  });

  revalidatePayroll(runId);
  return { ok: true };
}

export async function exportPayrollGl(
  runId: string,
): Promise<PayrollCsvResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { venue, permissions, supabase, user } = auth;

  if (!canEditPayroll(permissions, venue.id) || !canViewSalary(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("*")
    .eq("id", runId)
    .eq("venue_id", venue.id)
    .maybeSingle();
  if (!run) return { ok: false, error: "Run not found." };

  const settings = await loadPayrollSettings(supabase, venue.id);
  const period = {
    payrollMonth: run.payroll_month as string,
    periodStart: run.period_start as string,
    periodEnd: run.period_end as string,
    paymentDate: (run.payment_date as string) ?? run.period_end,
  };

  const { data: employees } = await supabase
    .from("hr_payroll_run_employees")
    .select("*")
    .eq("run_id", runId);

  const { data: lines } = await supabase
    .from("hr_payroll_lines")
    .select("*")
    .eq("run_id", runId);

  const linesByEmp = new Map<string, typeof lines>();
  for (const line of lines ?? []) {
    const key = line.run_employee_id as string;
    const list = linesByEmp.get(key) ?? [];
    list.push(line);
    linesByEmp.set(key, list);
  }

  const calcLike = (employees ?? []).map((e) => ({
    staffId: e.staff_id as string,
    empNo: e.emp_no as string,
    fullName: e.full_name as string,
    departmentId: e.department_id as string | null,
    departmentName: e.department_name as string | null,
    positionId: null,
    positionName: null,
    included: Boolean(e.included),
    excludeReason: null,
    isNewJoiner: false,
    isLeaver: false,
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
    paidDays: Number(e.paid_days),
    unpaidDays: Number(e.unpaid_days),
    halfPayDays: 0,
    fixedEarnings: Number(e.fixed_earnings),
    variableEarnings: Number(e.variable_earnings),
    totalDeductions: Number(e.total_deductions),
    grossEarnings: Number(e.gross_earnings),
    netSalary: Number(e.net_salary),
    lines: (linesByEmp.get(e.id as string) ?? []).map((l, i) => ({
      category: l.category as "fixed" | "variable" | "deduction",
      code: l.code as string,
      label: l.label as string,
      amount: Number(l.amount),
      source: "system" as const,
      sortOrder: i,
    })),
    dayFractions: [],
  }));

  const totals =
    (run.totals as ReturnType<typeof calculateVenuePayroll>["totals"]) ??
    {
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

  const glLines = buildGlExportLines({
    venueName: venue.name ?? "Venue",
    period,
    settings,
    employees: calcLike,
    totals,
  });

  const service = createServiceClient();
  await service.from("hr_payroll_gl_lines").delete().eq("run_id", runId);
  if (glLines.length > 0) {
    await service.from("hr_payroll_gl_lines").insert(
      glLines.map((l) => ({
        venue_id: venue.id,
        run_id: runId,
        gl_account: l.glAccount,
        cost_centre: l.costCentre,
        department_name: l.departmentName,
        debit: l.debit,
        credit: l.credit,
        accrual_month: l.accrualMonth,
        payment_month: l.paymentMonth,
        description: l.description,
      })),
    );
  }

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.gl_exported",
    module_key: HR_MODULE_KEY,
    entity: "hr_payroll_runs",
    entity_id: runId,
  });

  const month = String(run.payroll_month).slice(0, 7);
  revalidatePayroll(runId);
  return {
    ok: true,
    csv: glLinesToCsv(glLines),
    filename: `payroll-gl-${venue.slug ?? venue.id}-${month}.csv`,
  };
}

export async function updatePayrollBudgetRevenue(
  runId: string,
  budget: number | null,
  revenue: number | null,
): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { venue, permissions } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("hr_payroll_runs")
    .update({
      budget_amount: budget,
      revenue_amount: revenue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("venue_id", venue.id);

  if (error) return { ok: false, error: error.message };
  revalidatePayroll(runId);
  return { ok: true };
}

export async function setEmployeeIncluded(
  runEmployeeId: string,
  included: boolean,
  reason?: string,
): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: emp } = await supabase
    .from("hr_payroll_run_employees")
    .select("id, run_id, run:hr_payroll_runs(status)")
    .eq("id", runEmployeeId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!emp) return { ok: false, error: "Employee row not found." };
  const status = (emp.run as { status?: string } | null)?.status;
  if (status && isPayrollLocked(status)) {
    return { ok: false, error: "Payroll is locked." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("hr_payroll_run_employees")
    .update({
      included,
      exclude_reason: included ? null : reason?.trim() || "Manually excluded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", runEmployeeId);

  if (error) return { ok: false, error: error.message };
  revalidatePayroll(emp.run_id as string);
  return { ok: true };
}

export async function upsertSettlement(input: {
  runId: string;
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
}): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("status")
    .eq("id", input.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();
  if (!run) return { ok: false, error: "Run not found." };
  if (isPayrollLocked(run.status)) {
    return { ok: false, error: "Payroll is locked." };
  }

  const leaveEncashment = Number(input.leaveEncashment ?? 0);
  const outstandingAdvances = Number(input.outstandingAdvances ?? 0);
  const eosbAmount = Number(input.eosbAmount ?? 0);
  const otherAmount = Number(input.otherAmount ?? 0);
  const netSettlement =
    input.netSettlement != null
      ? Number(input.netSettlement)
      : leaveEncashment + eosbAmount + otherAmount - outstandingAdvances;

  const service = createServiceClient();
  const { error } = await service.from("hr_payroll_settlements").upsert(
    {
      venue_id: venue.id,
      run_id: input.runId,
      run_employee_id: input.runEmployeeId,
      staff_id: input.staffId,
      termination_date: input.terminationDate ?? null,
      leave_encashment: leaveEncashment,
      outstanding_advances: outstandingAdvances,
      eosb_amount: eosbAmount,
      other_amount: otherAmount,
      net_settlement: netSettlement,
      include_in_run: input.includeInRun ?? true,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "run_id,staff_id" },
  );

  if (error) return { ok: false, error: error.message };
  revalidatePayroll(input.runId);
  return { ok: true };
}

export async function listPayslipsForVenue(): Promise<PayslipListItem[]> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return [];
  const { supabase, venue, permissions } = auth;
  if (!canViewPayslips(permissions, venue.id)) return [];

  const { data, error } = await supabase
    .from("hr_payslips")
    .select(
      "id, run_id, run_employee_id, staff_id, version, email_status, email_sent_at, pdf_path, created_at, run:hr_payroll_runs(payroll_month), employee:hr_payroll_run_employees(emp_no, full_name)",
    )
    .eq("venue_id", venue.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[payroll] list payslips:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const run = row.run as { payroll_month?: string } | null;
    const emp = row.employee as {
      emp_no?: string;
      full_name?: string;
    } | null;
    return {
      id: row.id as string,
      run_id: row.run_id as string,
      run_employee_id: row.run_employee_id as string,
      staff_id: row.staff_id as string,
      version: row.version as number,
      email_status: row.email_status as string,
      email_sent_at: row.email_sent_at as string | null,
      pdf_path: row.pdf_path as string | null,
      created_at: row.created_at as string,
      payroll_month: run?.payroll_month ?? null,
      emp_no: emp?.emp_no ?? null,
      full_name: emp?.full_name ?? null,
    };
  });
}

export type PayslipSnapshot = {
  payrollMonth: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string | null;
  employer: { venueId: string; venueName: string };
  employee: {
    empNo: string;
    fullName: string;
    department: string | null;
    position: string | null;
  };
  paidDays: number;
  unpaidDays: number;
  version: number;
  fixed: Array<{ label: string; amount: number }>;
  variables: Array<{ label: string; amount: number }>;
  deductions: Array<{ label: string; amount: number }>;
  grossEarnings: number;
  totalDeductions: number;
  netSalary: number;
};

export async function getPayslipSnapshotAction(
  payslipId: string,
): Promise<{ ok: true; snapshot: PayslipSnapshot } | { ok: false; error: string }> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, venue, permissions } = auth;
  if (!canViewPayslips(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data, error } = await supabase
    .from("hr_payslips")
    .select("snapshot")
    .eq("id", payslipId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (error || !data?.snapshot) {
    return { ok: false, error: error?.message ?? "Payslip not found." };
  }

  return { ok: true, snapshot: data.snapshot as PayslipSnapshot };
}

export async function saveHrPayrollSettings(
  formData: FormData,
): Promise<void> {
  const auth = await getPayrollAuth();
  if ("error" in auth) throw new Error(auth.error);
  const { user, venue, permissions } = auth;

  if (!canAdminLookups(permissions, venue.id) && !canEditPayroll(permissions, venue.id)) {
    throw new Error("No permission to save payroll settings.");
  }

  const num = (key: string, fallback: number) => {
    const v = Number(formData.get(key));
    return Number.isFinite(v) ? v : fallback;
  };

  const statusesRaw = String(
    formData.get("exclude_employment_statuses") ?? "",
  );
  const excludeEmploymentStatuses = statusesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const value: HrPayrollSettings = mergePayrollSettings({
    periodStartDay: num("period_start_day", 25),
    periodEndDay: num("period_end_day", 24),
    paymentDateRule: (String(formData.get("payment_date_rule") ?? "fixed_day") ||
      "fixed_day") as HrPayrollSettings["paymentDateRule"],
    paymentDayOfMonth: num("payment_day_of_month", 28),
    excludeEmploymentStatuses:
      excludeEmploymentStatuses.length > 0
        ? excludeEmploymentStatuses
        : undefined,
    excludeFullyUnpaidLeave:
      String(formData.get("exclude_fully_unpaid_leave") ?? "") === "on" ||
      String(formData.get("exclude_fully_unpaid_leave") ?? "") === "true",
    wpsEmployerId: String(formData.get("wps_employer_id") ?? "").trim(),
    wpsBankChannel: String(formData.get("wps_bank_channel") ?? "").trim(),
    defaultCostCentre: String(formData.get("default_cost_centre") ?? "").trim(),
    glAccounts: {
      basicSalary: String(formData.get("gl_basic_salary") ?? "5100").trim(),
      allowances: String(formData.get("gl_allowances") ?? "5110").trim(),
      variables: String(formData.get("gl_variables") ?? "5120").trim(),
      deductions: String(formData.get("gl_deductions") ?? "2100").trim(),
      netPayable: String(formData.get("gl_net_payable") ?? "2150").trim(),
      employerCost: String(formData.get("gl_employer_cost") ?? "5190").trim(),
    },
  });

  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venue.id,
      key: HR_SETTINGS_KEYS.payroll,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.settings_saved",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: venue.id,
  });

  revalidatePayroll();
}
