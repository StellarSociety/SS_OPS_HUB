import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export type PendingPayrollDeductionRow = {
  id: string;
  venue_id: string;
  staff_id: string;
  category: "fixed" | "variable" | "deduction" | "addon";
  code: string;
  label: string;
  amount: number;
  original_amount: number;
  remaining_amount: number;
  reason: string;
  source: string;
  source_id: string | null;
  status: "pending" | "applied" | "cleared" | "cancelled";
  applied_run_id: string | null;
  applied_adjustment_id: string | null;
  created_at: string;
};

export {
  PAYROLL_DEDUCTION_IMPORT_SOURCES,
  payrollDeductionSourceLabel,
  type PayrollDeductionImportSourceId,
} from "./pending-deduction-sources";

type ServiceClient = ReturnType<typeof createServiceClient>;

function roundMoney(value: number): number {
  return Math.round(Math.abs(value) * 100) / 100;
}

function nextDeductionStatus(remaining: number): "pending" | "cleared" {
  return remaining > 0 ? "pending" : "cleared";
}

/** Variable pending charges (e.g. visa paybacks) are earnings, not deductions. */
export function isPendingPayrollPaybackCategory(
  category: string | null | undefined,
): boolean {
  return String(category ?? "") === "variable";
}

function adjustmentSourceForPendingCategory(
  category: string | null | undefined,
): "benefits" | "manual" {
  return isPendingPayrollPaybackCategory(category) ? "benefits" : "manual";
}

/**
 * Apply (or update) specific amounts on a payroll run.
 * Amounts may be partial — remaining balance stays pending for later months.
 */
export async function applyPendingDeductionAmounts(opts: {
  service?: ServiceClient;
  venueId: string;
  runId: string;
  actorId?: string | null;
  items: { deductionId: string; amount: number }[];
}): Promise<{ applied: number }> {
  const service = opts.service ?? createServiceClient();
  if (opts.items.length === 0) return { applied: 0 };

  const ids = opts.items.map((i) => i.deductionId);
  const { data: rows, error } = await service
    .from("hr_pending_payroll_deductions")
    .select(
      "id, venue_id, staff_id, category, code, label, amount, original_amount, remaining_amount, reason, source, status",
    )
    .eq("venue_id", opts.venueId)
    .in("id", ids);

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      console.warn(
        "[payroll] pending deductions table missing; skip apply:",
        error.message,
      );
      return { applied: 0 };
    }
    throw new Error(error.message);
  }

  const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));

  const { data: existingApps } = await service
    .from("hr_payroll_deduction_applications")
    .select("id, pending_deduction_id, adjustment_id, amount")
    .eq("venue_id", opts.venueId)
    .eq("run_id", opts.runId)
    .in("pending_deduction_id", ids);

  const appByDeduction = new Map(
    (existingApps ?? []).map((a) => [String(a.pending_deduction_id), a]),
  );

  const staffIds = [
    ...new Set(
      (rows ?? []).map((r) => String(r.staff_id)).filter(Boolean),
    ),
  ];
  const runEmpByStaff = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: runEmployees } = await service
      .from("hr_payroll_run_employees")
      .select("id, staff_id")
      .eq("run_id", opts.runId)
      .in("staff_id", staffIds);
    for (const e of runEmployees ?? []) {
      runEmpByStaff.set(String(e.staff_id), String(e.id));
    }
  }

  let applied = 0;
  for (const item of opts.items) {
    const row = byId.get(item.deductionId);
    if (!row) continue;
    if (String(row.status) === "cancelled") continue;

    const applyAmount = roundMoney(item.amount);
    if (!(applyAmount > 0)) continue;

    const original = roundMoney(
      Number(row.original_amount ?? row.amount ?? 0),
    );
    const remaining = roundMoney(
      Number(row.remaining_amount ?? row.amount ?? 0),
    );
    const existing = appByDeduction.get(item.deductionId);
    const alreadyOnRun = existing
      ? roundMoney(Number(existing.amount ?? 0))
      : 0;
    const maxAllowed = roundMoney(remaining + alreadyOnRun);
    if (applyAmount > maxAllowed + 0.001) {
      throw new Error(
        `Cannot apply ${applyAmount} — only ${maxAllowed} remaining on this charge.`,
      );
    }

    const reason =
      String(row.reason ?? "").trim() ||
      (isPendingPayrollPaybackCategory(String(row.category))
        ? "Visa payback"
        : "Pending payroll deduction");
    const code =
      String(row.code ?? "").trim().toUpperCase() ||
      (isPendingPayrollPaybackCategory(String(row.category))
        ? "PAYBACK"
        : "UNIFORM");
    const label =
      String(row.label ?? "").trim() ||
      (isPendingPayrollPaybackCategory(String(row.category))
        ? "Payback"
        : "Uniform / equipment");
    const category = String(row.category ?? "deduction");
    const source = adjustmentSourceForPendingCategory(category);

    if (existing?.adjustment_id) {
      const { error: adjError } = await service
        .from("hr_payroll_adjustments")
        .update({
          amount: applyAmount,
          reason,
          label,
          code,
          category,
          source,
        })
        .eq("id", existing.adjustment_id)
        .eq("run_id", opts.runId);
      if (adjError) throw new Error(adjError.message);

      const { error: appError } = await service
        .from("hr_payroll_deduction_applications")
        .update({
          amount: applyAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (appError) throw new Error(appError.message);
    } else {
      const { data: inserted, error: insertError } = await service
        .from("hr_payroll_adjustments")
        .insert({
          venue_id: opts.venueId,
          run_id: opts.runId,
          run_employee_id: runEmpByStaff.get(String(row.staff_id)) ?? null,
          staff_id: row.staff_id,
          category,
          code,
          label,
          amount: applyAmount,
          percent_of_daily_rate: null,
          days_applied: null,
          reason,
          source,
          created_by: opts.actorId ?? null,
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);

      const { error: appError } = await service
        .from("hr_payroll_deduction_applications")
        .insert({
          venue_id: opts.venueId,
          pending_deduction_id: row.id,
          run_id: opts.runId,
          adjustment_id: inserted.id,
          amount: applyAmount,
          created_by: opts.actorId ?? null,
        });
      if (appError) throw new Error(appError.message);
    }

    const nextRemaining = roundMoney(remaining + alreadyOnRun - applyAmount);
    const nextStatus = nextDeductionStatus(nextRemaining);
    const { error: updateError } = await service
      .from("hr_pending_payroll_deductions")
      .update({
        amount: original,
        original_amount: original,
        remaining_amount: nextRemaining,
        status: nextStatus,
        // Legacy fields: point at this run when fully cleared here, else clear.
        applied_run_id: nextStatus === "cleared" ? opts.runId : null,
        applied_adjustment_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    applied += 1;
  }

  return { applied };
}

/**
 * Remove this-run applications and restore remaining balances.
 */
export async function unapplyPendingPayrollDeductions(opts: {
  service?: ServiceClient;
  venueId: string;
  runId: string;
  ids?: string[];
}): Promise<{ unapplied: number; staffIds: string[] }> {
  const service = opts.service ?? createServiceClient();

  if (opts.ids && opts.ids.length === 0) {
    return { unapplied: 0, staffIds: [] };
  }

  let appQuery = service
    .from("hr_payroll_deduction_applications")
    .select("id, pending_deduction_id, adjustment_id, amount")
    .eq("venue_id", opts.venueId)
    .eq("run_id", opts.runId);

  if (opts.ids && opts.ids.length > 0) {
    appQuery = appQuery.in("pending_deduction_id", opts.ids);
  }

  const { data: apps, error: appsError } = await appQuery;
  if (appsError) {
    // Fall back to legacy applied_run_id path if applications table missing.
    if (/does not exist|schema cache/i.test(appsError.message)) {
      return unapplyLegacyPendingDeductions(opts);
    }
    throw new Error(appsError.message);
  }

  const rows = apps ?? [];
  if (rows.length === 0) {
    // Also try legacy rows that never got application backfill.
    return unapplyLegacyPendingDeductions(opts);
  }

  const pendingIds = rows.map((r) => String(r.pending_deduction_id));
  const { data: deductions, error: dedError } = await service
    .from("hr_pending_payroll_deductions")
    .select(
      "id, staff_id, original_amount, remaining_amount, amount, status",
    )
    .in("id", pendingIds);
  if (dedError) throw new Error(dedError.message);

  const dedById = new Map(
    (deductions ?? []).map((d) => [String(d.id), d]),
  );

  const adjustmentIds = rows
    .map((r) => r.adjustment_id as string | null)
    .filter((id): id is string => Boolean(id));

  if (adjustmentIds.length > 0) {
    const { error: deleteError } = await service
      .from("hr_payroll_adjustments")
      .delete()
      .eq("run_id", opts.runId)
      .eq("venue_id", opts.venueId)
      .in("id", adjustmentIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  const { error: deleteAppsError } = await service
    .from("hr_payroll_deduction_applications")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id as string),
    );
  if (deleteAppsError) throw new Error(deleteAppsError.message);

  for (const app of rows) {
    const ded = dedById.get(String(app.pending_deduction_id));
    if (!ded) continue;
    const restored = roundMoney(
      Number(ded.remaining_amount ?? 0) + Number(app.amount ?? 0),
    );
    const original = roundMoney(
      Number(ded.original_amount ?? ded.amount ?? restored),
    );
    const { error } = await service
      .from("hr_pending_payroll_deductions")
      .update({
        remaining_amount: restored,
        status: nextDeductionStatus(restored),
        applied_run_id: null,
        applied_adjustment_id: null,
        amount: original,
        original_amount: original,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ded.id);
    if (error) throw new Error(error.message);
  }

  return {
    unapplied: rows.length,
    staffIds: [
      ...new Set(
        (deductions ?? []).map((d) => String(d.staff_id)).filter(Boolean),
      ),
    ],
  };
}

async function unapplyLegacyPendingDeductions(opts: {
  service?: ServiceClient;
  venueId: string;
  runId: string;
  ids?: string[];
}): Promise<{ unapplied: number; staffIds: string[] }> {
  const service = opts.service ?? createServiceClient();

  let query = service
    .from("hr_pending_payroll_deductions")
    .select(
      "id, staff_id, applied_adjustment_id, status, original_amount, amount",
    )
    .eq("venue_id", opts.venueId)
    .eq("applied_run_id", opts.runId)
    .in("status", ["applied", "cleared"]);

  if (opts.ids && opts.ids.length > 0) {
    query = query.in("id", opts.ids);
  }

  const { data, error } = await query;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return { unapplied: 0, staffIds: [] };
    }
    throw new Error(error.message);
  }

  const rows = data ?? [];
  if (rows.length === 0) return { unapplied: 0, staffIds: [] };

  const adjustmentIds = rows
    .map((r) => r.applied_adjustment_id as string | null)
    .filter((id): id is string => Boolean(id));

  if (adjustmentIds.length > 0) {
    const { error: deleteError } = await service
      .from("hr_payroll_adjustments")
      .delete()
      .eq("run_id", opts.runId)
      .eq("venue_id", opts.venueId)
      .in("id", adjustmentIds);
    if (deleteError) throw new Error(deleteError.message);
  }

  for (const row of rows) {
    const original = roundMoney(
      Number(row.original_amount ?? row.amount ?? 0),
    );
    const { error: revertError } = await service
      .from("hr_pending_payroll_deductions")
      .update({
        status: "pending",
        remaining_amount: original,
        original_amount: original,
        amount: original,
        applied_run_id: null,
        applied_adjustment_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (revertError) throw new Error(revertError.message);
  }

  return {
    unapplied: rows.length,
    staffIds: [...new Set(rows.map((r) => String(r.staff_id)))],
  };
}

/** @deprecated Prefer applyPendingDeductionAmounts for partial support. */
export async function promotePendingPayrollDeductions(opts: {
  service?: ServiceClient;
  venueId: string;
  runId: string;
  staffId?: string;
  ids?: string[];
  actorId?: string | null;
}): Promise<{ promoted: number }> {
  const service = opts.service ?? createServiceClient();

  if (opts.ids && opts.ids.length === 0) return { promoted: 0 };

  let query = service
    .from("hr_pending_payroll_deductions")
    .select("id, remaining_amount, amount, status")
    .eq("venue_id", opts.venueId)
    .eq("status", "pending")
    .gt("remaining_amount", 0);

  if (opts.staffId) query = query.eq("staff_id", opts.staffId);
  if (opts.ids && opts.ids.length > 0) query = query.in("id", opts.ids);

  const { data, error } = await query;
  if (error) {
    if (/does not exist|schema cache|remaining_amount/i.test(error.message)) {
      // Pre-migration fallback: full amount promote path removed from auto-use.
      return { promoted: 0 };
    }
    throw new Error(error.message);
  }

  const items = (data ?? []).map((row) => ({
    deductionId: String(row.id),
    amount: roundMoney(Number(row.remaining_amount ?? row.amount ?? 0)),
  }));

  const { applied } = await applyPendingDeductionAmounts({
    service,
    venueId: opts.venueId,
    runId: opts.runId,
    actorId: opts.actorId,
    items,
  });
  return { promoted: applied };
}

export async function listPendingPayrollDeductionsForVenue(
  supabase: SupabaseClient,
  venueId: string,
  opts?: {
    staffIds?: string[];
    status?: "pending" | "applied" | "cleared" | "cancelled";
  },
): Promise<PendingPayrollDeductionRow[]> {
  let query = supabase
    .from("hr_pending_payroll_deductions")
    .select(
      "id, venue_id, staff_id, category, code, label, amount, original_amount, remaining_amount, reason, source, source_id, status, applied_run_id, applied_adjustment_id, created_at",
    )
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false });

  if (opts?.status) {
    query = query.eq("status", opts.status);
  }
  if (opts?.staffIds && opts.staffIds.length > 0) {
    query = query.in("staff_id", opts.staffIds);
  }

  const { data, error } = await query;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    console.error("[payroll] list pending deductions:", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const amount = Number(row.amount ?? 0);
    const original = Number(row.original_amount ?? amount);
    const remaining = Number(
      row.remaining_amount ??
        (row.status === "pending" ? amount : 0),
    );
    return {
      id: String(row.id),
      venue_id: String(row.venue_id),
      staff_id: String(row.staff_id),
      category: row.category as PendingPayrollDeductionRow["category"],
      code: String(row.code ?? "UNIFORM"),
      label: String(row.label ?? ""),
      amount,
      original_amount: original,
      remaining_amount: remaining,
      reason: String(row.reason ?? ""),
      source: String(row.source ?? ""),
      source_id: (row.source_id as string | null) ?? null,
      status: row.status as PendingPayrollDeductionRow["status"],
      applied_run_id: (row.applied_run_id as string | null) ?? null,
      applied_adjustment_id:
        (row.applied_adjustment_id as string | null) ?? null,
      created_at: String(row.created_at ?? ""),
    };
  });
}
