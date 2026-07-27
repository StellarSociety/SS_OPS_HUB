"use server";

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
  buildPayrollExport,
  buildPayrollExportFilename,
  dayFractionsFromSnapshot,
  glLinesToCsv,
  mergePayrollSettings,
  mergePayrollAdjustmentCodes,
  resolvePayrollPeriod,
  resolveManualAdjustmentAmount,
  excludeAdjustmentFromPayslip,
  PAYROLL_STATUS_TRANSITIONS,
  isPayrollLocked,
  type HrPayrollSettings,
  type PayrollLineCategory,
  type PayrollStatus,
} from "@/lib/hr/payroll";
import { HR_MODULE_KEY, HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { persistCalculatedPayrollRun, persistSingleEmployeePayroll, loadPayrollSettings, loadPayrollAdjustmentCodes } from "@/lib/hr/payroll/persist-run";
import { createServiceClient } from "@/lib/supabase/service";

export type PayrollActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type PayrollCsvResult =
  | {
      ok: true;
      csv?: string;
      base64?: string;
      filename: string;
      mimeType?: string;
      warnings?: string[];
    }
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
  revalidatePath("/hr/payroll", "page");
  revalidatePath("/hr/payslips", "page");
  revalidatePath("/hr/settings/pay", "page");
  revalidatePath("/hr/benefits", "page");
  if (runId) revalidatePath(`/hr/payroll/${runId}`, "page");
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

    await persistCalculatedPayrollRun({
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
    await persistCalculatedPayrollRun({
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

/** Fast path: recalculate one employee after an adjustment change. */
async function recalculatePayrollRunEmployee(opts: {
  runId: string;
  staffId: string;
  payrollMonth: string;
  venueId: string;
  userId: string;
}): Promise<PayrollActionResult> {
  try {
    const service = createServiceClient();
    const settings = await loadPayrollSettings(
      service as unknown as import("@supabase/supabase-js").SupabaseClient,
      opts.venueId,
    );
    const period = resolvePayrollPeriod(opts.payrollMonth, settings);
    await persistSingleEmployeePayroll({
      service,
      venueId: opts.venueId,
      runId: opts.runId,
      staffId: opts.staffId,
      period,
      userId: opts.userId,
    });
    revalidatePayroll(opts.runId);
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

  const dailyRate =
    runEmp?.daily_rate != null ? Number(runEmp.daily_rate) : null;
  const resolved = resolveManualAdjustmentAmount(
    {
      amount: input.amount ?? null,
      percentOfDailyRate: input.percentOfDailyRate ?? null,
      daysApplied: input.daysApplied ?? null,
      rateDiscountWhenPercentOnly: input.category === "deduction",
    },
    dailyRate,
  );
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  const { amount, percentOfDailyRate, daysApplied } = resolved.value;

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
    percent_of_daily_rate: percentOfDailyRate,
    days_applied: daysApplied,
    reason: input.reason.trim(),
    source: "manual",
    created_by: user.id,
  });

  if (error) return { ok: false, error: error.message };

  // Recalculate only this employee — full-run rebuild is too slow for edits.
  return recalculatePayrollRunEmployee({
    runId: input.runId,
    staffId: input.staffId,
    payrollMonth: run.payroll_month,
    venueId: venue.id,
    userId: user.id,
  });
}

export async function updatePayrollAdjustment(input: {
  adjustmentId: string;
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

  const { data: existing } = await supabase
    .from("hr_payroll_adjustments")
    .select("id, source")
    .eq("id", input.adjustmentId)
    .eq("run_id", input.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Adjustment not found." };
  if (existing.source !== "manual") {
    return { ok: false, error: "Only manual adjustments can be edited." };
  }

  const { data: runEmp } = await supabase
    .from("hr_payroll_run_employees")
    .select("id, daily_rate")
    .eq("run_id", input.runId)
    .eq("staff_id", input.staffId)
    .maybeSingle();

  const dailyRate =
    runEmp?.daily_rate != null ? Number(runEmp.daily_rate) : null;
  const resolved = resolveManualAdjustmentAmount(
    {
      amount: input.amount ?? null,
      percentOfDailyRate: input.percentOfDailyRate ?? null,
      daysApplied: input.daysApplied ?? null,
      rateDiscountWhenPercentOnly: input.category === "deduction",
    },
    dailyRate,
  );
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  const { amount, percentOfDailyRate, daysApplied } = resolved.value;

  const service = createServiceClient();
  const { error } = await service
    .from("hr_payroll_adjustments")
    .update({
      run_employee_id: runEmp?.id ?? null,
      staff_id: input.staffId,
      category: input.category,
      code: input.code.trim().toUpperCase(),
      label: input.label.trim(),
      amount: Math.round(Math.abs(amount) * 100) / 100,
      percent_of_daily_rate: percentOfDailyRate,
      days_applied: daysApplied,
      reason: input.reason.trim(),
    })
    .eq("id", input.adjustmentId)
    .eq("run_id", input.runId)
    .eq("venue_id", venue.id);

  if (error) return { ok: false, error: error.message };

  return recalculatePayrollRunEmployee({
    runId: input.runId,
    staffId: input.staffId,
    payrollMonth: run.payroll_month,
    venueId: venue.id,
    userId: user.id,
  });
}

export async function deletePayrollAdjustment(input: {
  adjustmentId: string;
  runId: string;
}): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
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

  const { data: existing } = await supabase
    .from("hr_payroll_adjustments")
    .select("id, source, staff_id")
    .eq("id", input.adjustmentId)
    .eq("run_id", input.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Adjustment not found." };
  if (existing.source !== "manual") {
    return { ok: false, error: "Only manual adjustments can be deleted." };
  }

  const staffId = existing.staff_id as string;

  const service = createServiceClient();
  const { error } = await service
    .from("hr_payroll_adjustments")
    .delete()
    .eq("id", input.adjustmentId)
    .eq("run_id", input.runId)
    .eq("venue_id", venue.id);

  if (error) return { ok: false, error: error.message };

  return recalculatePayrollRunEmployee({
    runId: input.runId,
    staffId,
    payrollMonth: run.payroll_month,
    venueId: venue.id,
    userId: user.id,
  });
}

type BulkAdjustmentFields = {
  category: PayrollLineCategory;
  code: string;
  label: string;
  amount?: number | null;
  percentOfDailyRate?: number | null;
  daysApplied?: number | null;
  reason: string;
};

async function recalculatePayrollRunEmployees(opts: {
  runId: string;
  staffIds: string[];
  payrollMonth: string;
  venueId: string;
  userId: string;
}): Promise<PayrollActionResult> {
  const unique = [...new Set(opts.staffIds.filter(Boolean))];
  for (const staffId of unique) {
    const result = await recalculatePayrollRunEmployee({
      runId: opts.runId,
      staffId,
      payrollMonth: opts.payrollMonth,
      venueId: opts.venueId,
      userId: opts.userId,
    });
    if (!result.ok) return result;
  }
  if (unique.length === 0) {
    revalidatePayroll(opts.runId);
  }
  return { ok: true };
}

export async function addBulkPayrollAdjustment(input: {
  runId: string;
  staffIds: string[];
} & BulkAdjustmentFields): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: "Reason is required." };
  }
  const staffIds = [...new Set(input.staffIds.filter(Boolean))];
  if (staffIds.length === 0) {
    return { ok: false, error: "Select at least one employee." };
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

  const { data: runEmps } = await supabase
    .from("hr_payroll_run_employees")
    .select("id, staff_id, daily_rate")
    .eq("run_id", input.runId)
    .in("staff_id", staffIds);

  const empByStaff = new Map(
    (runEmps ?? []).map((e) => [e.staff_id as string, e]),
  );

  const bulkGroupId = crypto.randomUUID();
  const rows: Record<string, unknown>[] = [];
  for (const staffId of staffIds) {
    const runEmp = empByStaff.get(staffId);
    const dailyRate =
      runEmp?.daily_rate != null ? Number(runEmp.daily_rate) : null;
    const resolved = resolveManualAdjustmentAmount(
      {
        amount: input.amount ?? null,
        percentOfDailyRate: input.percentOfDailyRate ?? null,
        daysApplied: input.daysApplied ?? null,
        rateDiscountWhenPercentOnly: input.category === "deduction",
      },
      dailyRate,
    );
    if (!resolved.ok) {
      return {
        ok: false,
        error: `Could not resolve amount for an employee: ${resolved.error}`,
      };
    }
    rows.push({
      venue_id: venue.id,
      run_id: input.runId,
      run_employee_id: runEmp?.id ?? null,
      staff_id: staffId,
      category: input.category,
      code: input.code.trim().toUpperCase(),
      label: input.label.trim(),
      amount: Math.round(Math.abs(resolved.value.amount) * 100) / 100,
      percent_of_daily_rate: resolved.value.percentOfDailyRate,
      days_applied: resolved.value.daysApplied,
      reason: input.reason.trim(),
      source: "manual",
      bulk_group_id: bulkGroupId,
      created_by: user.id,
    });
  }

  const service = createServiceClient();
  const { error } = await service.from("hr_payroll_adjustments").insert(rows);
  if (error) return { ok: false, error: error.message };

  return recalculatePayrollRunEmployees({
    runId: input.runId,
    staffIds,
    payrollMonth: run.payroll_month,
    venueId: venue.id,
    userId: user.id,
  });
}

export async function updateBulkPayrollAdjustment(input: {
  runId: string;
  bulkGroupId: string;
  staffIds: string[];
} & BulkAdjustmentFields): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: "Reason is required." };
  }
  const nextStaffIds = [...new Set(input.staffIds.filter(Boolean))];
  if (nextStaffIds.length === 0) {
    return { ok: false, error: "Select at least one employee." };
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

  const { data: existing } = await supabase
    .from("hr_payroll_adjustments")
    .select("id, staff_id, source")
    .eq("run_id", input.runId)
    .eq("venue_id", venue.id)
    .eq("bulk_group_id", input.bulkGroupId);

  if (!existing?.length) {
    return { ok: false, error: "Bulk adjustment not found." };
  }
  if (existing.some((row) => row.source !== "manual")) {
    return { ok: false, error: "Only manual adjustments can be edited." };
  }

  const previousStaffIds = existing.map((row) => row.staff_id as string);
  const previousSet = new Set(previousStaffIds);
  const nextSet = new Set(nextStaffIds);
  const toRemove = existing.filter(
    (row) => !nextSet.has(row.staff_id as string),
  );
  const toKeepStaffIds = nextStaffIds.filter((id) => previousSet.has(id));
  const toAddStaffIds = nextStaffIds.filter((id) => !previousSet.has(id));
  const affectedStaffIds = [
    ...new Set([...previousStaffIds, ...nextStaffIds]),
  ];

  const allNeededStaffIds = [...new Set([...toKeepStaffIds, ...toAddStaffIds])];
  const { data: runEmps } = await supabase
    .from("hr_payroll_run_employees")
    .select("id, staff_id, daily_rate")
    .eq("run_id", input.runId)
    .in("staff_id", allNeededStaffIds);

  const empByStaff = new Map(
    (runEmps ?? []).map((e) => [e.staff_id as string, e]),
  );

  const service = createServiceClient();

  if (toRemove.length > 0) {
    const { error: deleteError } = await service
      .from("hr_payroll_adjustments")
      .delete()
      .eq("run_id", input.runId)
      .eq("venue_id", venue.id)
      .eq("bulk_group_id", input.bulkGroupId)
      .in(
        "id",
        toRemove.map((row) => row.id as string),
      );
    if (deleteError) return { ok: false, error: deleteError.message };
  }

  for (const staffId of toKeepStaffIds) {
    const runEmp = empByStaff.get(staffId);
    const dailyRate =
      runEmp?.daily_rate != null ? Number(runEmp.daily_rate) : null;
    const resolved = resolveManualAdjustmentAmount(
      {
        amount: input.amount ?? null,
        percentOfDailyRate: input.percentOfDailyRate ?? null,
        daysApplied: input.daysApplied ?? null,
        rateDiscountWhenPercentOnly: input.category === "deduction",
      },
      dailyRate,
    );
    if (!resolved.ok) {
      return {
        ok: false,
        error: `Could not resolve amount for an employee: ${resolved.error}`,
      };
    }
    const { error: updateError } = await service
      .from("hr_payroll_adjustments")
      .update({
        run_employee_id: runEmp?.id ?? null,
        category: input.category,
        code: input.code.trim().toUpperCase(),
        label: input.label.trim(),
        amount: Math.round(Math.abs(resolved.value.amount) * 100) / 100,
        percent_of_daily_rate: resolved.value.percentOfDailyRate,
        days_applied: resolved.value.daysApplied,
        reason: input.reason.trim(),
      })
      .eq("run_id", input.runId)
      .eq("venue_id", venue.id)
      .eq("bulk_group_id", input.bulkGroupId)
      .eq("staff_id", staffId);
    if (updateError) return { ok: false, error: updateError.message };
  }

  if (toAddStaffIds.length > 0) {
    const rows: Record<string, unknown>[] = [];
    for (const staffId of toAddStaffIds) {
      const runEmp = empByStaff.get(staffId);
      const dailyRate =
        runEmp?.daily_rate != null ? Number(runEmp.daily_rate) : null;
      const resolved = resolveManualAdjustmentAmount(
        {
          amount: input.amount ?? null,
          percentOfDailyRate: input.percentOfDailyRate ?? null,
          daysApplied: input.daysApplied ?? null,
          rateDiscountWhenPercentOnly: input.category === "deduction",
        },
        dailyRate,
      );
      if (!resolved.ok) {
        return {
          ok: false,
          error: `Could not resolve amount for an employee: ${resolved.error}`,
        };
      }
      rows.push({
        venue_id: venue.id,
        run_id: input.runId,
        run_employee_id: runEmp?.id ?? null,
        staff_id: staffId,
        category: input.category,
        code: input.code.trim().toUpperCase(),
        label: input.label.trim(),
        amount: Math.round(Math.abs(resolved.value.amount) * 100) / 100,
        percent_of_daily_rate: resolved.value.percentOfDailyRate,
        days_applied: resolved.value.daysApplied,
        reason: input.reason.trim(),
        source: "manual",
        bulk_group_id: input.bulkGroupId,
        created_by: user.id,
      });
    }
    const { error: insertError } = await service
      .from("hr_payroll_adjustments")
      .insert(rows);
    if (insertError) return { ok: false, error: insertError.message };
  }

  return recalculatePayrollRunEmployees({
    runId: input.runId,
    staffIds: affectedStaffIds,
    payrollMonth: run.payroll_month,
    venueId: venue.id,
    userId: user.id,
  });
}

export async function deleteBulkPayrollAdjustment(input: {
  runId: string;
  bulkGroupId: string;
}): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
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

  const { data: existing } = await supabase
    .from("hr_payroll_adjustments")
    .select("id, staff_id, source")
    .eq("run_id", input.runId)
    .eq("venue_id", venue.id)
    .eq("bulk_group_id", input.bulkGroupId);

  if (!existing?.length) {
    return { ok: false, error: "Bulk adjustment not found." };
  }
  if (existing.some((row) => row.source !== "manual")) {
    return { ok: false, error: "Only manual adjustments can be deleted." };
  }

  const staffIds = existing.map((row) => row.staff_id as string);
  const service = createServiceClient();
  const { error } = await service
    .from("hr_payroll_adjustments")
    .delete()
    .eq("run_id", input.runId)
    .eq("venue_id", venue.id)
    .eq("bulk_group_id", input.bulkGroupId);

  if (error) return { ok: false, error: error.message };

  return recalculatePayrollRunEmployees({
    runId: input.runId,
    staffIds,
    payrollMonth: run.payroll_month,
    venueId: venue.id,
    userId: user.id,
  });
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

  const [{ data: employees }, { data: adjustments }] = await Promise.all([
    supabase
      .from("hr_payroll_run_employees")
      .select("*")
      .eq("run_id", runId)
      .eq("included", true),
    supabase
      .from("hr_payroll_adjustments")
      .select("staff_id, category, percent_of_daily_rate, days_applied, amount")
      .eq("run_id", runId),
  ]);

  const calcLike = (employees ?? []).map((e) => {
    const snapshot = e.snapshot as {
      effectivePaidDays?: number;
      dayFractions?: unknown;
    } | null;
    return {
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
      effectivePaidDays: Number(snapshot?.effectivePaidDays ?? e.paid_days),
      unpaidDays: Number(e.unpaid_days),
      halfPayDays: 0,
      fixedEarnings: Number(e.fixed_earnings),
      variableEarnings: Number(e.variable_earnings),
      totalDeductions: Number(e.total_deductions),
      grossEarnings: Number(e.gross_earnings),
      netSalary: Number(e.net_salary),
      lines: [],
      dayFractions: dayFractionsFromSnapshot(snapshot),
    };
  });

  const monthKey = String(run.payroll_month).slice(0, 7);
  const [year, monthNum] = monthKey.split("-").map(Number);
  const payrollMonthLabel = Number.isFinite(year) && Number.isFinite(monthNum)
    ? new Date(year, monthNum - 1, 1).toLocaleString("en-GB", {
        month: "long",
        year: "numeric",
      })
    : monthKey;

  const companyName = payrollCompanyLegalName(venue.name ?? "Venue");

  const { buffer, rows, errors } = await buildPayrollExport({
    companyName,
    payrollMonthLabel,
    employees: calcLike,
    adjustments: (adjustments ?? []).map((a) => ({
      staffId: a.staff_id as string,
      category: a.category as string,
      percentOfDailyRate:
        a.percent_of_daily_rate != null
          ? Number(a.percent_of_daily_rate)
          : null,
      daysApplied: a.days_applied != null ? Number(a.days_applied) : null,
      amount: a.amount != null ? Number(a.amount) : null,
    })),
  });

  if (rows.length === 0) {
    return {
      ok: false,
      error:
        errors.length > 0
          ? `Payroll export is empty. ${errors.slice(0, 8).join(" ")}${
              errors.length > 8 ? ` (+${errors.length - 8} more)` : ""
            }`
          : "Payroll export is empty — no included employees on this run.",
    };
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
    comment: `Payroll export generated (${rows.length} row(s)${
      errors.length > 0 ? `, ${errors.length} warning(s)` : ""
    })`,
    changes_summary: { warnings: errors, rowCount: rows.length },
  });

  revalidatePayroll(runId);
  return {
    ok: true,
    base64: buffer.toString("base64"),
    filename: buildPayrollExportFilename(venue.name ?? "Venue", monthKey),
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    warnings: errors.length > 0 ? errors : undefined,
  };
}

/** Legal entity line for payroll export headers (e.g. Orilla → Orilla Restaurant LLC). */
function payrollCompanyLegalName(venueName: string): string {
  const name = venueName.trim() || "Venue";
  if (/\bllc\b/i.test(name)) return name;
  if (/\brestaurant\b/i.test(name)) return `${name} LLC`;
  return `${name} Restaurant LLC`;
}

function parseNoBankPaymentMethod(
  raw: FormDataEntryValue | null,
): HrPayrollSettings["noBankPaymentMethod"] {
  const value = String(raw ?? "cash").trim().toLowerCase();
  if (value === "cheque" || value === "other") return value;
  return "cash";
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
  const adjustmentCodes = await loadPayrollAdjustmentCodes(supabase, venue.id);

  for (const emp of employees ?? []) {
    const { data: existing } = await service
      .from("hr_payslips")
      .select("version")
      .eq("run_employee_id", emp.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const version = (existing?.version ?? 0) + 1;
    const empLines = (linesByEmp.get(emp.id as string) ?? []).filter(
      (l) => !excludeAdjustmentFromPayslip(l.code as string, adjustmentCodes),
    );

    const empSnapshot = (emp.snapshot ?? {}) as {
      effectivePaidDays?: number;
    };
    const payslipPaidDays =
      empSnapshot.effectivePaidDays != null
        ? Number(empSnapshot.effectivePaidDays)
        : Number(emp.paid_days);

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
      paidDays: payslipPaidDays,
      unpaidDays: emp.unpaid_days,
      basicSalary: emp.basic_salary,
      allowances: empLines.filter(
        (l) => l.code === "ACCOM" || l.code === "TRANSP",
      ),
      variables: empLines.filter(
        (l) => l.category === "variable" || l.category === "addon",
      ),
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
    effectivePaidDays: Number(
      (e.snapshot as { effectivePaidDays?: number } | null)?.effectivePaidDays ??
        e.paid_days,
    ),
    unpaidDays: Number(e.unpaid_days),
    halfPayDays: 0,
    fixedEarnings: Number(e.fixed_earnings),
    variableEarnings: Number(e.variable_earnings),
    totalDeductions: Number(e.total_deductions),
    grossEarnings: Number(e.gross_earnings),
    netSalary: Number(e.net_salary),
    lines: (linesByEmp.get(e.id as string) ?? []).map((l, i) => ({
      category: l.category as "fixed" | "variable" | "deduction" | "addon",
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
    noBankPaymentMethod: parseNoBankPaymentMethod(
      formData.get("no_bank_payment_method"),
    ),
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

export async function saveHrPayrollAdjustmentCodesSettings(
  formData: FormData,
): Promise<void> {
  const auth = await getPayrollAuth();
  if ("error" in auth) throw new Error(auth.error);
  const { user, venue, permissions } = auth;

  if (
    !canAdminLookups(permissions, venue.id) &&
    !canEditPayroll(permissions, venue.id)
  ) {
    throw new Error("No permission to save payroll adjustment codes.");
  }

  const codesJson = String(formData.get("codes_json") ?? "");
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(codesJson);
  } catch {
    throw new Error("Invalid adjustment codes payload.");
  }

  const codes = mergePayrollAdjustmentCodes({
    codes: Array.isArray(parsed) ? parsed : [],
  });

  if (codes.length === 0) {
    throw new Error("At least one adjustment code is required.");
  }

  const value = { codes };

  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venue.id,
      key: HR_SETTINGS_KEYS.payrollAdjustmentCodes,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.adjustment_codes_saved",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: venue.id,
  });

  revalidatePath("/hr/settings/pay", "page");
  revalidatePath("/hr/settings/pay/adjustments", "page");
  revalidatePath("/hr/payroll", "page");
}
