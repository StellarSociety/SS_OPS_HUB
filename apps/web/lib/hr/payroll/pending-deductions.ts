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
  reason: string;
  source: string;
  source_id: string | null;
  status: "pending" | "applied" | "cancelled";
  applied_run_id: string | null;
  applied_adjustment_id: string | null;
  created_at: string;
};

/**
 * Promote venue pending deductions into a payroll run as adjustments.
 * Safe to call repeatedly — only rows with status=pending are inserted.
 */
export async function promotePendingPayrollDeductions(opts: {
  service?: ReturnType<typeof createServiceClient>;
  venueId: string;
  runId: string;
  staffId?: string;
  actorId?: string | null;
}): Promise<{ promoted: number }> {
  const service = opts.service ?? createServiceClient();

  let query = service
    .from("hr_pending_payroll_deductions")
    .select(
      "id, venue_id, staff_id, category, code, label, amount, reason, source, source_id, status",
    )
    .eq("venue_id", opts.venueId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (opts.staffId) {
    query = query.eq("staff_id", opts.staffId);
  }

  const { data, error } = await query;
  if (error) {
    // Table may not be migrated yet — don't block payroll.
    if (/does not exist|schema cache/i.test(error.message)) {
      console.warn(
        "[payroll] pending deductions table missing; skip promote:",
        error.message,
      );
      return { promoted: 0 };
    }
    throw new Error(error.message);
  }

  const rows = data ?? [];
  if (rows.length === 0) return { promoted: 0 };

  const { data: runEmployees } = await service
    .from("hr_payroll_run_employees")
    .select("id, staff_id")
    .eq("run_id", opts.runId)
    .in(
      "staff_id",
      rows.map((r) => r.staff_id as string),
    );

  const runEmpByStaff = new Map(
    (runEmployees ?? []).map((e) => [
      e.staff_id as string,
      e.id as string,
    ]),
  );

  let promoted = 0;
  for (const row of rows) {
    const amount = Math.round(Math.abs(Number(row.amount)) * 100) / 100;
    if (!(amount > 0)) {
      await service
        .from("hr_pending_payroll_deductions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");
      continue;
    }

    const { data: inserted, error: insertError } = await service
      .from("hr_payroll_adjustments")
      .insert({
        venue_id: opts.venueId,
        run_id: opts.runId,
        run_employee_id: runEmpByStaff.get(row.staff_id as string) ?? null,
        staff_id: row.staff_id,
        category: row.category ?? "deduction",
        code: String(row.code ?? "UNIFORM").trim().toUpperCase() || "UNIFORM",
        label: String(row.label ?? "Uniform / equipment").trim() || "Uniform / equipment",
        amount,
        percent_of_daily_rate: null,
        days_applied: null,
        reason: String(row.reason ?? "").trim() || "Pending payroll deduction",
        source: "manual",
        created_by: opts.actorId ?? null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error(
        "[payroll] promote pending deduction failed:",
        insertError.message,
        row.id,
      );
      continue;
    }

    const { error: updateError } = await service
      .from("hr_pending_payroll_deductions")
      .update({
        status: "applied",
        applied_run_id: opts.runId,
        applied_adjustment_id: inserted.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "pending");

    if (updateError) {
      console.error(
        "[payroll] mark pending deduction applied failed:",
        updateError.message,
        row.id,
      );
      continue;
    }

    promoted += 1;
  }

  return { promoted };
}

export async function listPendingPayrollDeductionsForVenue(
  supabase: SupabaseClient,
  venueId: string,
  opts?: { staffIds?: string[]; status?: "pending" | "applied" | "cancelled" },
): Promise<PendingPayrollDeductionRow[]> {
  let query = supabase
    .from("hr_pending_payroll_deductions")
    .select(
      "id, venue_id, staff_id, category, code, label, amount, reason, source, source_id, status, applied_run_id, applied_adjustment_id, created_at",
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

  return (data ?? []).map((row) => ({
    id: String(row.id),
    venue_id: String(row.venue_id),
    staff_id: String(row.staff_id),
    category: row.category as PendingPayrollDeductionRow["category"],
    code: String(row.code ?? "UNIFORM"),
    label: String(row.label ?? ""),
    amount: Number(row.amount ?? 0),
    reason: String(row.reason ?? ""),
    source: String(row.source ?? ""),
    source_id: (row.source_id as string | null) ?? null,
    status: row.status as PendingPayrollDeductionRow["status"],
    applied_run_id: (row.applied_run_id as string | null) ?? null,
    applied_adjustment_id: (row.applied_adjustment_id as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
  }));
}
