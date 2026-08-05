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
  glLinesToCsv,
  mergePayrollSettings,
  mergePayrollAdjustmentCodes,
  resolvePayrollPeriod,
  resolveManualAdjustmentAmount,
  excludeAdjustmentFromPayslip,
  PAYROLL_STATUS_TRANSITIONS,
  isPayrollLocked,
  parsePayrollMonth,
  payrollMonthKey,
  formatPayrollMonthLabel,
  summarizePayrollLeave,
  type HrPayrollSettings,
  type PayrollLineCategory,
  type PayrollStatus,
} from "@/lib/hr/payroll";
import {
  buildPayrollExport,
  buildPayrollExportFilename,
  dayFractionsFromSnapshot,
} from "@/lib/hr/payroll/wps";
import { resolveEmployeePaymentMethod } from "@/lib/hr/payroll/persist-run";
import type { PayslipPdfLeaveKind } from "@/lib/hr/payslip-pdf";
import { sortPayslipLines } from "@/lib/hr/payslip-line-order";
import { loadPayslipLetterheadForVenue } from "@/lib/hr/payslip-letterhead";
import { HR_MODULE_KEY, HR_SETTINGS_KEYS } from "@/lib/hr/types";
import {
  persistCalculatedPayrollRun,
  persistSingleEmployeePayroll,
  loadPayrollSettings,
  loadPayrollAdjustmentCodes,
  syncPayrollRunTotals,
} from "@/lib/hr/payroll/persist-run";
import {
  PAYROLL_DEDUCTION_IMPORT_SOURCES,
  payrollDeductionSourceLabel,
  applyPendingDeductionAmounts,
  unapplyPendingPayrollDeductions,
  type PayrollDeductionImportSourceId,
} from "@/lib/hr/payroll/pending-deductions";
import { createServiceClient } from "@/lib/supabase/service";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export type PayrollActionResult =
  | { ok: true; warning?: string; generated?: number; skipped?: number }
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
  department_name: string | null;
  employment_status: string | null;
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
  opts?: { allowReopen?: boolean },
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
  const reopening =
    Boolean(opts?.allowReopen) &&
    isPayrollLocked(run.status) &&
    toStatus === "final_approval";
  if (isPayrollLocked(run.status) && toStatus !== "locked" && !reopening) {
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
  if (reopening) {
    patch.locked_at = null;
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
      wagePackage:
        e.wage_package != null && !Number.isNaN(Number(e.wage_package))
          ? Number(e.wage_package)
          : null,
      basicSalary:
        e.basic_salary != null && !Number.isNaN(Number(e.basic_salary))
          ? Number(e.basic_salary)
          : null,
      accomAllowance:
        e.accom_allowance != null && !Number.isNaN(Number(e.accom_allowance))
          ? Number(e.accom_allowance)
          : null,
      transpAllowance:
        e.transp_allowance != null && !Number.isNaN(Number(e.transp_allowance))
          ? Number(e.transp_allowance)
          : null,
      salaryToPay:
        e.salary_to_pay != null && !Number.isNaN(Number(e.salary_to_pay))
          ? Number(e.salary_to_pay)
          : null,
      companyAccommodation: Boolean(e.company_accommodation),
      dailyRate:
        e.daily_rate != null && !Number.isNaN(Number(e.daily_rate))
          ? Number(e.daily_rate)
          : null,
      calendarDays: Number(e.calendar_days) || 0,
      paidDays: Number(e.paid_days),
      effectivePaidDays: Number(snapshot?.effectivePaidDays ?? e.paid_days),
      unpaidDays: Number(e.unpaid_days),
      halfPayDays: Number(e.half_pay_days) || 0,
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
  const payrollSettings = await loadPayrollSettings(supabase, venue.id);

  const { buffer, rows, errors } = await buildPayrollExport({
    companyName,
    payrollMonthLabel,
    employees: calcLike,
    noBankPaymentMethod: payrollSettings.noBankPaymentMethod,
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

function normalizePayslipLinesForCompare(lines: unknown): unknown[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((raw) => {
      const l = (raw ?? {}) as Record<string, unknown>;
      return {
        category: l.category ?? null,
        code: l.code ?? null,
        label: l.label ?? null,
        amount: Number(l.amount ?? 0),
        quantity: l.quantity != null ? Number(l.quantity) : null,
        rate: l.rate != null ? Number(l.rate) : null,
        meta: l.meta ?? {},
      };
    })
    .sort((a, b) => {
      const code = String(a.code ?? "").localeCompare(String(b.code ?? ""));
      if (code !== 0) return code;
      return String(a.label ?? "").localeCompare(String(b.label ?? ""));
    });
}

/** Stable JSON for deep equality — object key order must not affect the hash. */
function stableStringify(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(normalize);
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = normalize(obj[key]);
    }
    return out;
  };
  return JSON.stringify(normalize(value));
}

/** Content fingerprint — ignores version and volatile line row ids/timestamps. */
function payslipContentFingerprint(snapshot: unknown): string {
  const s = (snapshot ?? {}) as Record<string, unknown>;
  const dateOnly = (v: unknown) => {
    const raw = String(v ?? "").trim();
    return raw.slice(0, 10) || null;
  };
  return stableStringify({
    payrollMonth: dateOnly(s.payrollMonth),
    periodStart: dateOnly(s.periodStart),
    periodEnd: dateOnly(s.periodEnd),
    paymentDate: dateOnly(s.paymentDate),
    employer: s.employer ?? null,
    employee: s.employee ?? null,
    paidDays: Number(s.paidDays ?? 0),
    unpaidDays: Number(s.unpaidDays ?? 0),
    leave: (() => {
      const leave = (s.leave ?? null) as Record<string, unknown> | null;
      if (!leave) return null;
      const kinds = Array.isArray(leave.kinds)
        ? [...leave.kinds].sort((a, b) => {
            const aa = (a ?? {}) as Record<string, unknown>;
            const bb = (b ?? {}) as Record<string, unknown>;
            const code = String(aa.code ?? "").localeCompare(String(bb.code ?? ""));
            if (code !== 0) return code;
            return Number(aa.days ?? 0) - Number(bb.days ?? 0);
          })
        : [];
      return {
        paidDays: Number(leave.paidDays ?? 0),
        halfPayDays: Number(leave.halfPayDays ?? 0),
        unpaidDays: Number(leave.unpaidDays ?? 0),
        kinds,
      };
    })(),
    paymentMethod: s.paymentMethod ?? null,
    bankName: s.bankName ?? null,
    accountNumber: s.accountNumber ?? null,
    basicSalary: s.basicSalary != null ? Number(s.basicSalary) : null,
    fixed: normalizePayslipLinesForCompare(s.fixed),
    variables: normalizePayslipLinesForCompare(s.variables),
    deductions: normalizePayslipLinesForCompare(s.deductions),
    allowances: normalizePayslipLinesForCompare(s.allowances),
    grossEarnings: Number(s.grossEarnings ?? 0),
    totalDeductions: Number(s.totalDeductions ?? 0),
    netSalary: Number(s.netSalary ?? 0),
  });
}

export async function generatePayslips(
  runId: string,
  options?: { runEmployeeIds?: string[]; skipIfUnchanged?: boolean },
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

  const employeeIdFilter = options?.runEmployeeIds
    ?.map((id) => id.trim())
    .filter(Boolean);

  let employeesQuery = supabase
    .from("hr_payroll_run_employees")
    .select("*")
    .eq("run_id", runId)
    .eq("included", true);
  if (employeeIdFilter && employeeIdFilter.length > 0) {
    employeesQuery = employeesQuery.in("id", employeeIdFilter);
  }
  const { data: employees } = await employeesQuery;

  if (!employees?.length) {
    return {
      ok: false,
      error: employeeIdFilter?.length
        ? "Employee not found or not included on this run."
        : "No included employees on this run.",
    };
  }

  const { data: lines } = await supabase
    .from("hr_payroll_lines")
    .select("*")
    .eq("run_id", runId)
    .order("sort_order", { ascending: true });

  const linesByEmp = new Map<string, typeof lines>();
  for (const line of lines ?? []) {
    const key = line.run_employee_id as string;
    const list = linesByEmp.get(key) ?? [];
    list.push(line);
    linesByEmp.set(key, list);
  }

  const service = createServiceClient();
  const adjustmentCodes = await loadPayrollAdjustmentCodes(supabase, venue.id);
  const payrollSettings = await loadPayrollSettings(supabase, venue.id);
  const letterhead = await loadPayslipLetterheadForVenue(supabase, venue);

  let generated = 0;
  let skipped = 0;
  let latestPayslipId: string | null = null;

  for (const emp of employees ?? []) {
    const { data: existing } = await service
      .from("hr_payslips")
      .select("id, version, snapshot")
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
      dayFractions?: unknown;
      joiningDate?: string | null;
    };
    const payslipPaidDays =
      empSnapshot.effectivePaidDays != null
        ? Number(empSnapshot.effectivePaidDays)
        : Number(emp.paid_days);

    const leaveSummary = summarizePayrollLeave(
      dayFractionsFromSnapshot(emp.snapshot),
    );

    const iban = (emp.iban as string | null) ?? null;
    const bankName = (emp.bank_name as string | null) ?? null;
    const paymentMethod = resolveEmployeePaymentMethod(iban, payrollSettings);

    const employerHeader = {
      legalName: letterhead.companyName,
      address: letterhead.companyAddress || null,
    };

    const snapshot = {
      payrollMonth: run.payroll_month,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      paymentDate: run.payment_date,
      employer: {
        venueId: venue.id,
        venueName: venue.name,
        legalName: employerHeader.legalName,
        companyAddress: employerHeader.address,
        footerDisclaimer: letterhead.footerDisclaimer,
      },
      employee: {
        empNo: emp.emp_no,
        fullName: emp.full_name,
        department: emp.department_name,
        position: emp.position_name,
        joiningDate: empSnapshot.joiningDate ?? null,
      },
      paidDays: payslipPaidDays,
      unpaidDays: emp.unpaid_days,
      leave: {
        paidDays: leaveSummary.paidDays,
        halfPayDays: leaveSummary.halfPayDays,
        unpaidDays: leaveSummary.unpaidDays,
        kinds: leaveSummary.kinds,
      },
      paymentMethod,
      bankName,
      accountNumber: iban,
      basicSalary: emp.basic_salary,
      allowances: empLines.filter(
        (l) => l.code === "ACCOM" || l.code === "TRANSP",
      ),
      variables: sortPayslipLines(
        empLines
          .filter((l) => l.category === "variable" || l.category === "addon")
          .map((l) => ({
            ...l,
            category: String(l.category),
            code: String(l.code ?? ""),
            label: String(l.label ?? ""),
            sortOrder: Number(l.sort_order ?? 999),
          })),
      ),
      deductions: sortPayslipLines(
        empLines
          .filter((l) => l.category === "deduction")
          .map((l) => ({
            ...l,
            category: String(l.category),
            code: String(l.code ?? ""),
            label: String(l.label ?? ""),
            sortOrder: Number(l.sort_order ?? 999),
          })),
      ),
      fixed: sortPayslipLines(
        empLines
          .filter((l) => l.category === "fixed")
          .map((l) => ({
            ...l,
            category: String(l.category),
            code: String(l.code ?? ""),
            label: String(l.label ?? ""),
            sortOrder: Number(l.sort_order ?? 999),
          })),
      ),
      grossEarnings: emp.gross_earnings,
      totalDeductions: emp.total_deductions,
      netSalary: emp.net_salary,
      version,
    };

    if (
      options?.skipIfUnchanged &&
      existing?.id &&
      existing.snapshot != null &&
      payslipContentFingerprint(snapshot) ===
        payslipContentFingerprint(existing.snapshot)
    ) {
      skipped += 1;
      latestPayslipId = existing.id as string;
      continue;
    }

    const { data: inserted, error } = await service
      .from("hr_payslips")
      .insert({
        venue_id: venue.id,
        run_id: runId,
        run_employee_id: emp.id,
        staff_id: emp.staff_id,
        version,
        snapshot,
        email_status: "not_sent",
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    generated += 1;
    latestPayslipId = (inserted?.id as string | undefined) ?? latestPayslipId;
  }

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.payslips_generated",
    module_key: HR_MODULE_KEY,
    entity: "hr_payroll_runs",
    entity_id: runId,
    after: {
      count: generated,
      skipped,
      skipIfUnchanged: options?.skipIfUnchanged ?? false,
      runEmployeeIds: employeeIdFilter ?? null,
      latestPayslipId,
    },
  });

  revalidatePayroll(runId);
  return { ok: true, generated, skipped };
}

/** Create a new payslip version for one run employee from current payroll lines. */
export async function regenerateEmployeePayslip(
  runEmployeeId: string,
): Promise<
  | { ok: true; payslipId: string; version: number; unchanged: boolean }
  | { ok: false; error: string }
> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const id = runEmployeeId.trim();
  if (!id) return { ok: false, error: "Missing employee." };

  const { data: emp, error } = await supabase
    .from("hr_payroll_run_employees")
    .select("id, run_id, included, venue_id")
    .eq("id", id)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!emp) return { ok: false, error: "Employee not found on this run." };
  if (!emp.included) {
    return { ok: false, error: "Employee is excluded from this payroll run." };
  }

  const result = await generatePayslips(emp.run_id as string, {
    runEmployeeIds: [emp.id as string],
    skipIfUnchanged: true,
  });
  if (!result.ok) return result;

  const { data: latest } = await supabase
    .from("hr_payslips")
    .select("id, version")
    .eq("run_employee_id", emp.id)
    .eq("venue_id", venue.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest?.id) {
    return { ok: false, error: "Payslip was generated but could not be loaded." };
  }

  return {
    ok: true,
    payslipId: latest.id as string,
    version: Number(latest.version) || 1,
    unchanged: (result.generated ?? 0) === 0,
  };
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
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: emp } = await supabase
    .from("hr_payroll_run_employees")
    .select(
      "id, run_id, staff_id, run:hr_payroll_runs(status, payroll_month)",
    )
    .eq("id", runEmployeeId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!emp) return { ok: false, error: "Employee row not found." };
  const runMeta = emp.run as {
    status?: string;
    payroll_month?: string;
  } | null;
  const status = runMeta?.status;
  if (status && isPayrollLocked(status)) {
    return { ok: false, error: "Payroll is locked." };
  }

  const service = createServiceClient();
  const excludeReason = included
    ? null
    : reason?.trim() || "Manually excluded";

  const { error } = await service
    .from("hr_payroll_run_employees")
    .update({
      included,
      exclude_reason: excludeReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runEmployeeId);
  if (error) return { ok: false, error: error.message };

  // Recalculate organic pay values; inclusion flag is preserved via overrides.
  // Excluded staff keep amounts/lines but drop out of run totals and payments.
  try {
    const settings = await loadPayrollSettings(supabase, venue.id);
    const period = resolvePayrollPeriod(
      runMeta?.payroll_month ?? new Date().toISOString(),
      settings,
    );
    await persistSingleEmployeePayroll({
      service,
      venueId: venue.id,
      runId: emp.run_id as string,
      staffId: emp.staff_id as string,
      period,
      userId: user.id,
    });
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : included
            ? "Included, but could not recalculate pay"
            : "Excluded, but could not refresh pay values",
    };
  }

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
      "id, run_id, run_employee_id, staff_id, version, email_status, email_sent_at, pdf_path, created_at, run:hr_payroll_runs(payroll_month), employee:hr_payroll_run_employees(emp_no, full_name, department_name, employment_status)",
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
      department_name?: string | null;
      employment_status?: string | null;
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
      department_name: emp?.department_name?.trim() || null,
      employment_status: emp?.employment_status?.trim() || null,
    };
  });
}

export type StaffMonthlyPayslipItem = {
  payslipId: string;
  payrollMonth: string;
  payrollMonthLabel: string;
  version: number;
  netSalary: number;
};

/**
 * Latest payslip version per payroll month for one staff member, with net pay.
 * Newest month first.
 */
export async function listStaffMonthlyPayslips(
  staffId: string,
): Promise<
  | { ok: true; items: StaffMonthlyPayslipItem[] }
  | { ok: false; error: string }
> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, venue, permissions } = auth;

  if (
    !canViewPayslips(permissions, venue.id) &&
    !canViewSalary(permissions, venue.id)
  ) {
    return { ok: false, error: "No permission to view pay history." };
  }

  const id = staffId.trim();
  if (!id) return { ok: false, error: "Staff member is required." };

  const { data, error } = await supabase
    .from("hr_payslips")
    .select(
      "id, version, snapshot, run:hr_payroll_runs(payroll_month)",
    )
    .eq("venue_id", venue.id)
    .eq("staff_id", id)
    .order("created_at", { ascending: false })
    .limit(240);

  if (error) {
    console.error("[payroll] list staff monthly payslips:", error.message);
    return { ok: false, error: error.message };
  }

  const byMonth = new Map<string, StaffMonthlyPayslipItem>();

  for (const row of data ?? []) {
    const run = row.run as { payroll_month?: string } | null;
    const snapshot = row.snapshot as Record<string, unknown> | null;
    const rawMonth =
      (typeof run?.payroll_month === "string" && run.payroll_month) ||
      (typeof snapshot?.payrollMonth === "string" && snapshot.payrollMonth) ||
      "";
    const monthKey = rawMonth.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;

    const version = Number(row.version) || 1;
    const existing = byMonth.get(monthKey);
    if (existing && version <= existing.version) continue;

    const payrollMonth =
      rawMonth.length >= 10 ? rawMonth.slice(0, 10) : `${monthKey}-01`;
    let label = monthKey;
    try {
      label = formatPayrollMonthLabel(payrollMonth);
    } catch {
      /* keep YYYY-MM */
    }

    byMonth.set(monthKey, {
      payslipId: row.id as string,
      payrollMonth,
      payrollMonthLabel: label,
      version,
      netSalary: Number(snapshot?.netSalary ?? 0),
    });
  }

  const items = [...byMonth.values()].sort((a, b) =>
    b.payrollMonth.localeCompare(a.payrollMonth),
  );

  return { ok: true, items };
}

export type PayslipLeaveSnapshot = {
  paidDays: number;
  halfPayDays: number;
  unpaidDays: number;
  kinds: PayslipPdfLeaveKind[];
};

export type PayslipSnapshot = {
  payrollMonth: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string | null;
  employer: {
    venueId: string;
    venueName: string;
    legalName?: string | null;
    companyAddress?: string | null;
    footerDisclaimer?: string | null;
  };
  employee: {
    empNo: string;
    fullName: string;
    department: string | null;
    position: string | null;
    joiningDate?: string | null;
  };
  paidDays: number;
  unpaidDays: number;
  leave?: PayslipLeaveSnapshot;
  paymentMethod?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  version: number;
  fixed: Array<{
    code?: string | null;
    label: string;
    amount: number;
    sortOrder?: number | null;
    meta?: { rateDiscountPercent?: number | null } | null;
  }>;
  variables: Array<{
    code?: string | null;
    label: string;
    amount: number;
    sortOrder?: number | null;
    meta?: { rateDiscountPercent?: number | null } | null;
  }>;
  deductions: Array<{
    code?: string | null;
    label: string;
    amount: number;
    sortOrder?: number | null;
    meta?: { rateDiscountPercent?: number | null } | null;
  }>;
  grossEarnings: number;
  totalDeductions: number;
  netSalary: number;
};

function normalizePayslipLeaveKinds(raw: unknown): PayslipPdfLeaveKind[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const days = Number(row.days ?? 0);
      if (!Number.isFinite(days) || days <= 0) return null;
      return {
        code: String(row.code ?? "").trim() || "—",
        name: String(row.name ?? "").trim() || String(row.code ?? "Leave"),
        days,
        bucket: String(row.bucket ?? "paid"),
        explanation: String(row.explanation ?? "").trim(),
      } satisfies PayslipPdfLeaveKind;
    })
    .filter((k): k is PayslipPdfLeaveKind => k != null);
}

function leaveFromPayslipSnapshot(snapshot: Record<string, unknown>): PayslipLeaveSnapshot | null {
  const leave = snapshot.leave as Record<string, unknown> | undefined;
  if (leave && Array.isArray(leave.kinds)) {
    const kinds = normalizePayslipLeaveKinds(leave.kinds);
    return {
      paidDays: Number(leave.paidDays ?? 0),
      halfPayDays: Number(leave.halfPayDays ?? 0),
      unpaidDays: Number(leave.unpaidDays ?? 0),
      kinds,
    };
  }
  const fromFractions = summarizePayrollLeave(
    dayFractionsFromSnapshot(snapshot),
  );
  if (fromFractions.kinds.length === 0) return null;
  return {
    paidDays: fromFractions.paidDays,
    halfPayDays: fromFractions.halfPayDays,
    unpaidDays: fromFractions.unpaidDays,
    kinds: fromFractions.kinds,
  };
}

export async function getPayslipSnapshotAction(
  payslipId: string,
): Promise<
  | { ok: true; snapshot: PayslipSnapshot; venueLogoUrl: string | null; venueStampUrl: string | null }
  | { ok: false; error: string }
> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { supabase, venue, permissions } = auth;
  if (!canViewPayslips(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data, error } = await supabase
    .from("hr_payslips")
    .select("snapshot, run_employee_id")
    .eq("id", payslipId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (error || !data?.snapshot) {
    return { ok: false, error: error?.message ?? "Payslip not found." };
  }

  const snapshot = data.snapshot as PayslipSnapshot & Record<string, unknown>;
  let leave = leaveFromPayslipSnapshot(snapshot as Record<string, unknown>);

  let paymentMethod =
    typeof snapshot.paymentMethod === "string" ? snapshot.paymentMethod : null;
  let bankName =
    typeof snapshot.bankName === "string" ? snapshot.bankName : null;
  let accountNumber =
    typeof snapshot.accountNumber === "string" ? snapshot.accountNumber : null;
  let joiningDate =
    typeof snapshot.employee?.joiningDate === "string"
      ? snapshot.employee.joiningDate
      : null;

  // Older payslips may lack leave / payment / joining fields — derive from the run employee.
  if (
    !leave ||
    leave.kinds.length === 0 ||
    !paymentMethod ||
    !bankName ||
    !accountNumber ||
    !joiningDate
  ) {
    const { data: emp } = await supabase
      .from("hr_payroll_run_employees")
      .select("snapshot, iban, bank_name")
      .eq("id", data.run_employee_id)
      .maybeSingle();
    if (emp?.snapshot) {
      const fromRun = summarizePayrollLeave(
        dayFractionsFromSnapshot(emp.snapshot),
      );
      if ((!leave || leave.kinds.length === 0) && fromRun.kinds.length > 0) {
        leave = {
          paidDays: fromRun.paidDays,
          halfPayDays: fromRun.halfPayDays,
          unpaidDays: fromRun.unpaidDays,
          kinds: fromRun.kinds,
        };
      }
      if (!joiningDate) {
        const snap = emp.snapshot as { joiningDate?: string | null };
        joiningDate = snap.joiningDate ?? null;
      }
    }
    if (emp) {
      const iban = (emp.iban as string | null) ?? null;
      if (!accountNumber) accountNumber = iban;
      if (!bankName) bankName = (emp.bank_name as string | null) ?? null;
      if (!paymentMethod) {
        const settings = await loadPayrollSettings(supabase, venue.id);
        paymentMethod = resolveEmployeePaymentMethod(iban, settings);
      }
    }
  }

  const letterhead = await loadPayslipLetterheadForVenue(supabase, venue);

  return {
    ok: true,
    snapshot: {
      ...snapshot,
      employer: {
        ...snapshot.employer,
        legalName: snapshot.employer?.legalName ?? letterhead.companyName,
        companyAddress:
          snapshot.employer?.companyAddress ??
          (letterhead.companyAddress || null),
        footerDisclaimer:
          snapshot.employer?.footerDisclaimer ?? letterhead.footerDisclaimer,
      },
      employee: {
        ...snapshot.employee,
        joiningDate,
      },
      leave: leave ?? undefined,
      paymentMethod,
      bankName,
      accountNumber,
    },
    venueLogoUrl: getVenueLogoUrl({
      slug: venue.slug,
      logo_url: venue.logo_url,
      icon_url: venue.icon_url,
      favicon_url: venue.favicon_url,
    }),
    venueStampUrl: letterhead.stampUrl,
  };
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

export type PayrollBenefitImportType =
  | "tips"
  | "service_charge"
  | "compensation"
  | "other";

export type PayrollBenefitImportRow = {
  allocationId: string;
  staffId: string;
  empNo: string;
  fullName: string;
  departmentName: string | null;
  benefitType: PayrollBenefitImportType;
  amount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  alreadyApplied: boolean;
};

const BENEFIT_TYPE_TO_KIND: Record<string, string> = {
  tips: "gratuity",
  service_charge: "service_charge",
};

function normalizeBenefitMonthDate(input: string): string {
  const trimmed = input.trim();
  const { year, month } = parsePayrollMonth(
    trimmed.length === 7 ? `${trimmed}-01` : trimmed,
  );
  return payrollMonthKey(year, month);
}

/**
 * List finalized/applied benefit allocations for a benefit month + type,
 * ready to selectively import into a payroll run.
 */
export async function listBenefitsForPayrollImport(input: {
  runId: string;
  benefitMonth: string;
  benefitType: PayrollBenefitImportType | "all";
}): Promise<
  | { ok: true; rows: PayrollBenefitImportRow[] }
  | { ok: false; error: string }
> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("id, status")
    .eq("id", input.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();
  if (!run) return { ok: false, error: "Payroll run not found." };

  let monthDate: string;
  try {
    monthDate = normalizeBenefitMonthDate(input.benefitMonth);
  } catch {
    return { ok: false, error: "Invalid benefit month." };
  }

  const service = createServiceClient();

  let runQuery = service
    .from("hr_benefit_runs")
    .select("id, benefit_kind, benefit_month, period_start, period_end, status")
    .eq("venue_id", venue.id)
    .eq("benefit_month", monthDate)
    .in("status", [
      "calculated",
      "review",
      "finalized",
      "applied_to_payroll",
    ]);

  if (input.benefitType !== "all") {
    const kind = BENEFIT_TYPE_TO_KIND[input.benefitType];
    if (kind) runQuery = runQuery.eq("benefit_kind", kind);
  }

  const { data: benefitRuns, error: runsError } = await runQuery;
  if (runsError) {
    if (/hr_benefit_runs|schema cache|does not exist/i.test(runsError.message)) {
      return {
        ok: false,
        error:
          "Benefits tables are not available yet. Finalize a Benefits run first.",
      };
    }
    return { ok: false, error: runsError.message };
  }

  const runIds = (benefitRuns ?? []).map((r) => r.id as string);
  const settings = await loadPayrollSettings(supabase, venue.id);
  const period = resolvePayrollPeriod(monthDate, settings);

  let usable: Array<Record<string, unknown>> = [];

  if (runIds.length > 0) {
    let allocQuery = service
      .from("hr_benefit_allocations")
      .select(
        "id, staff_id, benefit_type, amount, status, period_start, period_end, run_id",
      )
      .eq("venue_id", venue.id)
      .in("run_id", runIds)
      .in("status", ["finalized", "applied_to_payroll", "draft"]);

    if (input.benefitType !== "all") {
      allocQuery = allocQuery.eq("benefit_type", input.benefitType);
    }

    const { data: allocations, error: allocError } = await allocQuery;
    if (allocError) return { ok: false, error: allocError.message };
    usable = (allocations ?? []) as Array<Record<string, unknown>>;
  } else {
    // Fallback: period-overlap allocations when no benefit run row exists
    let allocQuery = service
      .from("hr_benefit_allocations")
      .select(
        "id, staff_id, benefit_type, amount, status, period_start, period_end, run_id",
      )
      .eq("venue_id", venue.id)
      .lte("period_start", period.periodEnd)
      .gte("period_end", period.periodStart)
      .in("status", ["finalized", "applied_to_payroll"]);

    if (input.benefitType !== "all") {
      allocQuery = allocQuery.eq("benefit_type", input.benefitType);
    }

    const { data: allocations, error: allocError } = await allocQuery;
    if (allocError) {
      if (
        /hr_benefit_allocations|schema cache|does not exist/i.test(
          allocError.message,
        )
      ) {
        return {
          ok: false,
          error:
            "Benefits tables are not available yet. Finalize a Benefits run first.",
        };
      }
      return { ok: false, error: allocError.message };
    }
    usable = (allocations ?? []) as Array<Record<string, unknown>>;
  }

  usable = usable.filter((a) => {
    const status = String(a.status);
    const amount = Number(a.amount) || 0;
    if (status === "applied_to_payroll" || status === "finalized") return true;
    return amount > 0 && status === "draft";
  });

  const staffIds = [
    ...new Set(usable.map((a) => a.staff_id as string).filter(Boolean)),
  ];
  const staffById = new Map<
    string,
    { emp_no: string; full_name: string; department_name: string | null }
  >();

  if (staffIds.length > 0) {
    const { data: staffRows } = await service
      .from("staff")
      .select("id, emp_no, full_name, department:departments(name)")
      .in("id", staffIds);
    for (const s of staffRows ?? []) {
      const dept = s.department as { name?: string } | null;
      staffById.set(s.id as string, {
        emp_no: String(s.emp_no),
        full_name: String(s.full_name),
        department_name: dept?.name ?? null,
      });
    }
  }

  const rows: PayrollBenefitImportRow[] = usable
    .map((a) => {
      const staff = staffById.get(a.staff_id as string);
      return {
        allocationId: a.id as string,
        staffId: a.staff_id as string,
        empNo: staff?.emp_no ?? "—",
        fullName: staff?.full_name ?? "Unknown",
        departmentName: staff?.department_name ?? null,
        benefitType: a.benefit_type as PayrollBenefitImportType,
        amount: Number(a.amount) || 0,
        status: String(a.status),
        periodStart: String(a.period_start).slice(0, 10),
        periodEnd: String(a.period_end).slice(0, 10),
        alreadyApplied: String(a.status) === "applied_to_payroll",
      };
    })
    .sort((a, b) => a.empNo.localeCompare(b.empNo));

  return { ok: true, rows };
}

/**
 * Apply selected benefit allocations to this payroll run (variable lines),
 * then recalculate. Unselected allocations of the same month/type that were
 * previously applied are returned to finalized so they leave this run.
 */
export async function importBenefitsToPayrollRun(input: {
  runId: string;
  benefitMonth: string;
  benefitType: PayrollBenefitImportType | "all";
  allocationIds: string[];
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

  if (!run) return { ok: false, error: "Payroll run not found." };
  if (isPayrollLocked(run.status)) {
    return { ok: false, error: "Payroll is locked." };
  }

  let monthDate: string;
  try {
    monthDate = normalizeBenefitMonthDate(input.benefitMonth);
  } catch {
    return { ok: false, error: "Invalid benefit month." };
  }

  const selected = new Set(input.allocationIds);
  if (selected.size === 0) {
    return { ok: false, error: "Select at least one employee to import." };
  }

  const preview = await listBenefitsForPayrollImport({
    runId: input.runId,
    benefitMonth: monthDate,
    benefitType: input.benefitType,
  });
  if (!preview.ok) return preview;

  const service = createServiceClient();
  const selectedRows = preview.rows.filter((r) => selected.has(r.allocationId));
  const unselectedPreviouslyApplied = preview.rows.filter(
    (r) => !selected.has(r.allocationId) && r.alreadyApplied,
  );

  if (selectedRows.length === 0) {
    return { ok: false, error: "No matching benefit rows to import." };
  }

  // Apply selected
  const { error: applyError } = await service
    .from("hr_benefit_allocations")
    .update({
      status: "applied_to_payroll",
      updated_at: new Date().toISOString(),
    })
    .eq("venue_id", venue.id)
    .in(
      "id",
      selectedRows.map((r) => r.allocationId),
    );

  if (applyError) return { ok: false, error: applyError.message };

  // Un-apply deselected that were previously on payroll
  if (unselectedPreviouslyApplied.length > 0) {
    const { error: revertError } = await service
      .from("hr_benefit_allocations")
      .update({
        status: "finalized",
        payroll_line_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("venue_id", venue.id)
      .in(
        "id",
        unselectedPreviouslyApplied.map((r) => r.allocationId),
      );
    if (revertError) return { ok: false, error: revertError.message };
  }

  // Mark matching benefit runs as applied when any allocation is applied
  const kinds = new Set(
    selectedRows.map((r) => BENEFIT_TYPE_TO_KIND[r.benefitType]).filter(Boolean),
  );
  for (const kind of kinds) {
    await service
      .from("hr_benefit_runs")
      .update({
        status: "applied_to_payroll",
        updated_at: new Date().toISOString(),
      })
      .eq("venue_id", venue.id)
      .eq("benefit_month", monthDate)
      .eq("benefit_kind", kind)
      .in("status", ["finalized", "review", "calculated", "applied_to_payroll"]);
  }

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.benefits_imported",
    module_key: HR_MODULE_KEY,
    entity: "hr_payroll_runs",
    entity_id: input.runId,
    after: {
      benefitMonth: monthDate,
      benefitType: input.benefitType,
      imported: selectedRows.length,
      reverted: unselectedPreviouslyApplied.length,
    },
  });

  await service.from("hr_payroll_run_events").insert({
    venue_id: venue.id,
    run_id: input.runId,
    actor_id: user.id,
    from_status: run.status,
    to_status: run.status,
    comment: `Benefits imported (${monthDate.slice(0, 7)})`,
  });

  const recalc = await recalculatePayrollRun(input.runId);
  if (!recalc.ok) return recalc;

  revalidatePath("/hr/benefits");
  return { ok: true };
}

/**
 * Re-pull amounts for benefit allocations already applied to this payroll
 * (current month/type filter) and recalculate the run.
 */
export async function refreshImportedBenefitsOnPayrollRun(input: {
  runId: string;
  benefitMonth: string;
  benefitType: PayrollBenefitImportType | "all";
}): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("id, status")
    .eq("id", input.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!run) return { ok: false, error: "Payroll run not found." };
  if (isPayrollLocked(run.status)) {
    return { ok: false, error: "Payroll is locked." };
  }

  let monthDate: string;
  try {
    monthDate = normalizeBenefitMonthDate(input.benefitMonth);
  } catch {
    return { ok: false, error: "Invalid benefit month." };
  }

  const preview = await listBenefitsForPayrollImport({
    runId: input.runId,
    benefitMonth: monthDate,
    benefitType: input.benefitType,
  });
  if (!preview.ok) return preview;

  const applied = preview.rows.filter((r) => r.alreadyApplied);
  if (applied.length === 0) {
    return { ok: false, error: "No imported benefits to refresh." };
  }

  // Touch applied rows so updated benefit amounts are the source of truth,
  // then recalculate payroll lines from those allocations.
  const service = createServiceClient();
  const { error: touchError } = await service
    .from("hr_benefit_allocations")
    .update({
      status: "applied_to_payroll",
      updated_at: new Date().toISOString(),
    })
    .eq("venue_id", venue.id)
    .in(
      "id",
      applied.map((r) => r.allocationId),
    );
  if (touchError) return { ok: false, error: touchError.message };

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.benefits_refreshed",
    module_key: HR_MODULE_KEY,
    entity: "hr_payroll_runs",
    entity_id: input.runId,
    after: {
      benefitMonth: monthDate,
      benefitType: input.benefitType,
      refreshed: applied.length,
    },
  });

  const recalc = await recalculatePayrollRun(input.runId);
  if (!recalc.ok) return recalc;

  revalidatePath("/hr/benefits");
  return { ok: true };
}

/**
 * Remove all imported benefit figures for the month/type filter from payroll
 * (revert allocations to finalized) and recalculate the run.
 */
export async function clearImportedBenefitsFromPayrollRun(input: {
  runId: string;
  benefitMonth: string;
  benefitType: PayrollBenefitImportType | "all";
}): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("id, status")
    .eq("id", input.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!run) return { ok: false, error: "Payroll run not found." };
  if (isPayrollLocked(run.status)) {
    return { ok: false, error: "Payroll is locked." };
  }

  let monthDate: string;
  try {
    monthDate = normalizeBenefitMonthDate(input.benefitMonth);
  } catch {
    return { ok: false, error: "Invalid benefit month." };
  }

  const preview = await listBenefitsForPayrollImport({
    runId: input.runId,
    benefitMonth: monthDate,
    benefitType: input.benefitType,
  });
  if (!preview.ok) return preview;

  const applied = preview.rows.filter((r) => r.alreadyApplied);
  if (applied.length === 0) {
    return { ok: false, error: "No imported benefits to delete." };
  }

  const service = createServiceClient();
  const { error: revertError } = await service
    .from("hr_benefit_allocations")
    .update({
      status: "finalized",
      payroll_line_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("venue_id", venue.id)
    .in(
      "id",
      applied.map((r) => r.allocationId),
    );
  if (revertError) return { ok: false, error: revertError.message };

  const kindsByType = new Map<string, string>();
  for (const row of applied) {
    const kind = BENEFIT_TYPE_TO_KIND[row.benefitType];
    if (kind) kindsByType.set(row.benefitType, kind);
  }

  for (const [benefitType, kind] of kindsByType) {
    // Only revert the benefit run when no allocations remain applied for it.
    const { data: stillApplied } = await service
      .from("hr_benefit_allocations")
      .select("id")
      .eq("venue_id", venue.id)
      .eq("status", "applied_to_payroll")
      .eq("benefit_type", benefitType)
      .limit(1);

    if ((stillApplied ?? []).length > 0) continue;

    await service
      .from("hr_benefit_runs")
      .update({
        status: "finalized",
        updated_at: new Date().toISOString(),
      })
      .eq("venue_id", venue.id)
      .eq("benefit_month", monthDate)
      .eq("benefit_kind", kind)
      .eq("status", "applied_to_payroll");
  }

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.benefits_cleared",
    module_key: HR_MODULE_KEY,
    entity: "hr_payroll_runs",
    entity_id: input.runId,
    after: {
      benefitMonth: monthDate,
      benefitType: input.benefitType,
      cleared: applied.length,
    },
  });

  const recalc = await recalculatePayrollRun(input.runId);
  if (!recalc.ok) return recalc;

  revalidatePath("/hr/benefits");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Import Deductions (uniform / assets / insurance / certifications / visa)
// ---------------------------------------------------------------------------

export type PayrollDeductionImportType =
  | PayrollDeductionImportSourceId
  | "all";

export type PayrollDeductionImportStatus =
  | "pending"
  | "partial"
  | "on_this_run"
  | "cleared";

export type PayrollDeductionImportRow = {
  deductionId: string;
  staffId: string;
  empNo: string;
  fullName: string;
  departmentName: string | null;
  source: string;
  sourceLabel: string;
  code: string;
  label: string;
  /** Original charge amount. */
  originalAmount: number;
  /** Still outstanding (not yet recovered on any payroll). */
  remainingAmount: number;
  /** Amount already applied on this payroll run (0 if none). */
  appliedOnThisRun: number;
  /** Max that can be set for this run = remaining + appliedOnThisRun. */
  maxApplyAmount: number;
  reason: string;
  createdAt: string;
  status: PayrollDeductionImportStatus;
  statusLabel: string;
  alreadyApplied: boolean;
  sourceAvailable: boolean;
};

function availableDeductionSourceIds(): Set<string> {
  return new Set(
    PAYROLL_DEDUCTION_IMPORT_SOURCES.filter((s) => s.available).map((s) => s.id),
  );
}

function matchesDeductionSourceFilter(
  source: string,
  filter: PayrollDeductionImportType,
): boolean {
  if (filter === "all") return availableDeductionSourceIds().has(source);
  return source === filter;
}

function deductionImportStatus(opts: {
  remaining: number;
  original: number;
  appliedOnThisRun: number;
}): { status: PayrollDeductionImportStatus; statusLabel: string } {
  if (opts.appliedOnThisRun > 0 && opts.remaining > 0) {
    return {
      status: "on_this_run",
      statusLabel: "On this run · balance left",
    };
  }
  if (opts.appliedOnThisRun > 0 && opts.remaining <= 0) {
    return { status: "on_this_run", statusLabel: "On this run · cleared" };
  }
  if (opts.remaining <= 0) {
    return { status: "cleared", statusLabel: "Cleared" };
  }
  if (opts.remaining < opts.original - 0.001) {
    return { status: "partial", statusLabel: "Partial · balance left" };
  }
  return { status: "pending", statusLabel: "Pending" };
}

export async function listDeductionsForPayrollImport(input: {
  runId: string;
  source: PayrollDeductionImportType;
}): Promise<
  | { ok: true; rows: PayrollDeductionImportRow[] }
  | { ok: false; error: string }
> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { venue, permissions, supabase } = auth;

  if (!canAccessPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("id")
    .eq("id", input.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();
  if (!run) return { ok: false, error: "Payroll run not found." };

  if (
    input.source !== "all" &&
    !PAYROLL_DEDUCTION_IMPORT_SOURCES.some((s) => s.id === input.source)
  ) {
    return { ok: false, error: "Unknown deduction source." };
  }

  const sourceMeta = PAYROLL_DEDUCTION_IMPORT_SOURCES.find(
    (s) => s.id === input.source,
  );
  if (sourceMeta && !sourceMeta.available) {
    return { ok: true, rows: [] };
  }

  const service = createServiceClient();
  let data:
    | {
        id: string;
        staff_id: string;
        category?: string;
        code?: string;
        label?: string;
        amount?: number | string;
        original_amount?: number | string | null;
        remaining_amount?: number | string | null;
        reason?: string;
        source?: string;
        status?: string;
        applied_run_id?: string | null;
        created_at?: string;
      }[]
    | null = null;

  {
    const primary = await service
      .from("hr_pending_payroll_deductions")
      .select(
        "id, staff_id, category, code, label, amount, original_amount, remaining_amount, reason, source, status, applied_run_id, created_at",
      )
      .eq("venue_id", venue.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });

    if (primary.error) {
      if (/does not exist|schema cache/i.test(primary.error.message)) {
        return { ok: true, rows: [] };
      }
      // Pre-migration fallback without original/remaining columns.
      if (/original_amount|remaining_amount/i.test(primary.error.message)) {
        const legacy = await service
          .from("hr_pending_payroll_deductions")
          .select(
            "id, staff_id, category, code, label, amount, reason, source, status, applied_run_id, created_at",
          )
          .eq("venue_id", venue.id)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false });
        if (legacy.error) return { ok: false, error: legacy.error.message };
        data = (legacy.data ?? []).map((row) => ({
          ...row,
          original_amount: row.amount,
          remaining_amount:
            row.status === "pending" ? row.amount : 0,
        }));
      } else {
        return { ok: false, error: primary.error.message };
      }
    } else {
      data = primary.data;
    }
  }

  const { data: apps, error: appsError } = await service
    .from("hr_payroll_deduction_applications")
    .select("pending_deduction_id, amount")
    .eq("venue_id", venue.id)
    .eq("run_id", input.runId);

  const appliedOnRun = new Map<string, number>();
  if (!appsError) {
    for (const app of apps ?? []) {
      appliedOnRun.set(
        String(app.pending_deduction_id),
        Math.round(Number(app.amount ?? 0) * 100) / 100,
      );
    }
  }

  // Legacy fully-applied rows (pre-applications table).
  for (const row of data ?? []) {
    const id = String(row.id);
    if (appliedOnRun.has(id)) continue;
    if (
      String(row.applied_run_id) === input.runId &&
      (row.status === "applied" || row.status === "cleared")
    ) {
      const amount = Math.round(Number(row.original_amount ?? row.amount ?? 0) * 100) / 100;
      if (amount > 0) appliedOnRun.set(id, amount);
    }
  }

  // Visible while outstanding, or if this run already has an application.
  const scoped = (data ?? []).filter((row) => {
    const remaining = Number(
      row.remaining_amount ??
        (row.status === "pending" ? row.amount : 0),
    );
    const onThisRun = appliedOnRun.get(String(row.id)) ?? 0;
    if (onThisRun > 0) return true;
    return remaining > 0;
  });

  const filtered = scoped.filter((row) =>
    matchesDeductionSourceFilter(String(row.source ?? ""), input.source),
  );

  const staffIds = [...new Set(filtered.map((r) => r.staff_id as string))];
  const staffById = new Map<
    string,
    { emp_no: string; full_name: string; department_name: string | null }
  >();

  if (staffIds.length > 0) {
    const { data: staffRows } = await service
      .from("staff")
      .select("id, emp_no, full_name, department:departments(name)")
      .in("id", staffIds);
    for (const s of staffRows ?? []) {
      const deptRaw = s.department as
        | { name?: string }
        | { name?: string }[]
        | null;
      const dept = Array.isArray(deptRaw) ? deptRaw[0] : deptRaw;
      staffById.set(String(s.id), {
        emp_no: String(s.emp_no ?? "—"),
        full_name: String(s.full_name ?? "Unknown"),
        department_name: dept?.name ?? null,
      });
    }
  }

  const available = availableDeductionSourceIds();
  const rows: PayrollDeductionImportRow[] = filtered
    .map((row) => {
      const staff = staffById.get(String(row.staff_id));
      const source = String(row.source ?? "");
      const original = Math.round(
        Number(row.original_amount ?? row.amount ?? 0) * 100,
      ) / 100;
      const remaining = Math.round(
        Number(
          row.remaining_amount ??
            (row.status === "pending" ? row.amount : 0),
        ) * 100,
      ) / 100;
      const appliedThis = appliedOnRun.get(String(row.id)) ?? 0;
      const maxApply = Math.round((remaining + appliedThis) * 100) / 100;
      const { status, statusLabel } = deductionImportStatus({
        remaining,
        original,
        appliedOnThisRun: appliedThis,
      });
      return {
        deductionId: String(row.id),
        staffId: String(row.staff_id),
        empNo: staff?.emp_no ?? "—",
        fullName: staff?.full_name ?? "Unknown",
        departmentName: staff?.department_name ?? null,
        source,
        sourceLabel: payrollDeductionSourceLabel(source),
        code: String(row.code ?? ""),
        label: String(row.label ?? ""),
        originalAmount: original,
        remainingAmount: remaining,
        appliedOnThisRun: appliedThis,
        maxApplyAmount: maxApply,
        reason: String(row.reason ?? ""),
        createdAt: String(row.created_at ?? ""),
        status,
        statusLabel,
        alreadyApplied: appliedThis > 0,
        sourceAvailable: available.has(source),
      };
    })
    .sort((a, b) => a.empNo.localeCompare(b.empNo));

  return { ok: true, rows };
}

/**
 * Apply selected pending deductions (optionally partial amounts) to this run.
 * Deselected rows that were on this run are returned to outstanding balance.
 */
export async function importDeductionsToPayrollRun(input: {
  runId: string;
  source: PayrollDeductionImportType;
  /** Selected deductions with the amount to apply on this run. */
  items: { deductionId: string; amount: number }[];
}): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("id, status")
    .eq("id", input.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!run) return { ok: false, error: "Payroll run not found." };
  if (isPayrollLocked(run.status)) {
    return { ok: false, error: "Payroll is locked." };
  }

  const preview = await listDeductionsForPayrollImport({
    runId: input.runId,
    source: input.source,
  });
  if (!preview.ok) return preview;

  const selected = new Map(
    input.items
      .filter((i) => i.amount > 0)
      .map((i) => [i.deductionId, Math.round(i.amount * 100) / 100]),
  );
  const selectedRows = preview.rows.filter((r) => selected.has(r.deductionId));
  const unselectedPreviouslyApplied = preview.rows.filter(
    (r) => !selected.has(r.deductionId) && r.alreadyApplied,
  );

  if (selectedRows.length === 0 && unselectedPreviouslyApplied.length === 0) {
    return {
      ok: false,
      error: "Select at least one deduction with an amount, or clear imported ones.",
    };
  }

  const service = createServiceClient();

  if (unselectedPreviouslyApplied.length > 0) {
    await unapplyPendingPayrollDeductions({
      service,
      venueId: venue.id,
      runId: input.runId,
      ids: unselectedPreviouslyApplied.map((r) => r.deductionId),
    });
  }

  const applyItems = selectedRows.map((r) => ({
    deductionId: r.deductionId,
    amount: selected.get(r.deductionId) ?? 0,
  }));

  const { applied } = await applyPendingDeductionAmounts({
    service,
    venueId: venue.id,
    runId: input.runId,
    actorId: user.id,
    items: applyItems,
  });

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.deductions_imported",
    module_key: HR_MODULE_KEY,
    entity: "hr_payroll_runs",
    entity_id: input.runId,
    after: {
      source: input.source,
      imported: applied,
      reverted: unselectedPreviouslyApplied.length,
      selected: selectedRows.length,
      items: applyItems,
    },
  });

  await service.from("hr_payroll_run_events").insert({
    venue_id: venue.id,
    run_id: input.runId,
    actor_id: user.id,
    from_status: run.status,
    to_status: run.status,
    comment: `Deductions imported (${
      input.source === "all"
        ? "all sources"
        : payrollDeductionSourceLabel(input.source)
    })`,
  });

  const recalc = await recalculatePayrollRun(input.runId);
  if (!recalc.ok) return recalc;

  revalidatePath("/hr/payroll");
  revalidatePath(`/hr/payroll/${input.runId}`);
  revalidatePath("/hr/assets/uniform/employees");
  return { ok: true };
}

export async function clearImportedDeductionsFromPayrollRun(input: {
  runId: string;
  source: PayrollDeductionImportType;
}): Promise<PayrollActionResult> {
  const auth = await getPayrollAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { user, venue, permissions, supabase } = auth;

  if (!canEditPayroll(permissions, venue.id)) {
    return { ok: false, error: "No permission." };
  }

  const { data: run } = await supabase
    .from("hr_payroll_runs")
    .select("id, status")
    .eq("id", input.runId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (!run) return { ok: false, error: "Payroll run not found." };
  if (isPayrollLocked(run.status)) {
    return { ok: false, error: "Payroll is locked." };
  }

  const preview = await listDeductionsForPayrollImport({
    runId: input.runId,
    source: input.source,
  });
  if (!preview.ok) return preview;

  const applied = preview.rows.filter((r) => r.alreadyApplied);
  if (applied.length === 0) {
    return { ok: false, error: "No imported deductions to remove." };
  }

  const service = createServiceClient();
  await unapplyPendingPayrollDeductions({
    service,
    venueId: venue.id,
    runId: input.runId,
    ids: applied.map((r) => r.deductionId),
  });

  await writeAuditLog({
    actor_id: user.id,
    venue_id: venue.id,
    action: "payroll.deductions_cleared",
    module_key: HR_MODULE_KEY,
    entity: "hr_payroll_runs",
    entity_id: input.runId,
    after: {
      source: input.source,
      cleared: applied.length,
    },
  });

  await service.from("hr_payroll_run_events").insert({
    venue_id: venue.id,
    run_id: input.runId,
    actor_id: user.id,
    from_status: run.status,
    to_status: run.status,
    comment: `Imported deductions cleared (${
      input.source === "all"
        ? "all sources"
        : payrollDeductionSourceLabel(input.source)
    })`,
  });

  const recalc = await recalculatePayrollRun(input.runId);
  if (!recalc.ok) return recalc;

  revalidatePath("/hr/payroll");
  revalidatePath(`/hr/payroll/${input.runId}`);
  revalidatePath("/hr/assets/uniform/employees");
  return { ok: true };
}

