import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PAYROLL_BENEFIT_DEDUCTION_SOURCE,
  round2,
  splitEvenly,
  type BenefitDeductionStaffRef,
  type PayrollDeductionProgress,
} from "./deductions";

/**
 * Payroll-kind benefit deductions are queued as one pending payroll charge per
 * person (hr_pending_payroll_deductions, source "benefit_deduction",
 * source_id = deduction id). Payroll → Import Deductions picks them up.
 */

type ChargeRow = {
  id: string;
  staff_id: string;
  original_amount: number;
  remaining_amount: number;
  status: string;
};

async function listCharges(
  service: SupabaseClient,
  venueId: string,
  deductionIds: string[],
): Promise<Array<ChargeRow & { source_id: string }>> {
  if (deductionIds.length === 0) return [];
  const { data, error } = await service
    .from("hr_pending_payroll_deductions")
    .select("id, staff_id, source_id, original_amount, remaining_amount, status")
    .eq("venue_id", venueId)
    .eq("source", PAYROLL_BENEFIT_DEDUCTION_SOURCE)
    .in("source_id", deductionIds);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    staff_id: String(row.staff_id),
    source_id: String(row.source_id),
    original_amount: round2(Number(row.original_amount) || 0),
    remaining_amount: round2(Number(row.remaining_amount) || 0),
    status: String(row.status ?? "pending"),
  }));
}

/** True when any of this deduction's charges was already taken on a payroll. */
async function hasPayrollApplications(
  service: SupabaseClient,
  venueId: string,
  charges: ChargeRow[],
): Promise<boolean> {
  if (charges.length === 0) return false;
  if (charges.some((row) => row.remaining_amount < row.original_amount - 0.005)) {
    return true;
  }
  const { count, error } = await service
    .from("hr_payroll_deduction_applications")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId)
    .in(
      "pending_deduction_id",
      charges.map((row) => row.id),
    );
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export const PAYROLL_DEDUCTION_LOCKED_ERROR =
  "Part of this deduction is already on a payroll run. Remove it from that payroll (Import Deductions → clear) before changing or deleting it, or cancel the rest instead.";

/** Replace this deduction's payroll charges with a fresh equal split. */
export async function replacePayrollDeductionCharges(opts: {
  service: SupabaseClient;
  venueId: string;
  deductionId: string;
  name: string;
  totalAmount: number;
  monthCount: number;
  startMonthLabel: string;
  staff: BenefitDeductionStaffRef[];
  userId: string;
}): Promise<void> {
  const existing = await listCharges(opts.service, opts.venueId, [
    opts.deductionId,
  ]);
  if (await hasPayrollApplications(opts.service, opts.venueId, existing)) {
    throw new Error(PAYROLL_DEDUCTION_LOCKED_ERROR);
  }
  if (existing.length > 0) {
    const { error } = await opts.service
      .from("hr_pending_payroll_deductions")
      .delete()
      .in(
        "id",
        existing.map((row) => row.id),
      );
    if (error) throw new Error(error.message);
  }

  const shares = splitEvenly(opts.totalAmount, opts.staff.length);
  const months = Math.max(1, opts.monthCount);
  const reason = `${opts.name} — ${months} month${months === 1 ? "" : "s"} from ${opts.startMonthLabel}`;
  const rows = opts.staff
    .map((person, index) => ({ person, share: shares[index] ?? 0 }))
    .filter(({ share }) => share > 0)
    .map(({ person, share }) => ({
      venue_id: opts.venueId,
      staff_id: person.id,
      category: "deduction",
      code: "OTHER_DEDUCTION",
      label: opts.name,
      amount: share,
      original_amount: share,
      remaining_amount: share,
      reason,
      source: PAYROLL_BENEFIT_DEDUCTION_SOURCE,
      source_id: opts.deductionId,
      status: "pending",
      created_by: opts.userId,
    }));
  if (rows.length === 0) return;
  const { error } = await opts.service
    .from("hr_pending_payroll_deductions")
    .insert(rows);
  if (error) throw new Error(error.message);
}

/** Cancel (or restore) the part of this deduction not yet taken on payroll. */
export async function setPayrollDeductionChargesCancelled(opts: {
  service: SupabaseClient;
  venueId: string;
  deductionId: string;
  cancelled: boolean;
}): Promise<void> {
  const query = opts.service
    .from("hr_pending_payroll_deductions")
    .update({ status: opts.cancelled ? "cancelled" : "pending" })
    .eq("venue_id", opts.venueId)
    .eq("source", PAYROLL_BENEFIT_DEDUCTION_SOURCE)
    .eq("source_id", opts.deductionId);
  const { error } = opts.cancelled
    ? await query.eq("status", "pending")
    : await query.eq("status", "cancelled").gt("remaining_amount", 0);
  if (error) throw new Error(error.message);
}

/** Delete this deduction's payroll charges; refuses once any was deducted. */
export async function deletePayrollDeductionCharges(opts: {
  service: SupabaseClient;
  venueId: string;
  deductionId: string;
}): Promise<void> {
  const existing = await listCharges(opts.service, opts.venueId, [
    opts.deductionId,
  ]);
  if (existing.length === 0) return;
  if (await hasPayrollApplications(opts.service, opts.venueId, existing)) {
    throw new Error(PAYROLL_DEDUCTION_LOCKED_ERROR);
  }
  const { error } = await opts.service
    .from("hr_pending_payroll_deductions")
    .delete()
    .in(
      "id",
      existing.map((row) => row.id),
    );
  if (error) throw new Error(error.message);
}

/** Applied / remaining per person for each payroll deduction, from its charges. */
export async function loadPayrollDeductionProgress(opts: {
  service: SupabaseClient;
  venueId: string;
  deductions: Array<{ id: string; staff: BenefitDeductionStaffRef[] }>;
}): Promise<Record<string, PayrollDeductionProgress>> {
  const out: Record<string, PayrollDeductionProgress> = {};
  let charges: Array<ChargeRow & { source_id: string }> = [];
  try {
    charges = await listCharges(
      opts.service,
      opts.venueId,
      opts.deductions.map((row) => row.id),
    );
  } catch (e) {
    console.error(
      "[hr/benefits/deductions] payroll progress:",
      e instanceof Error ? e.message : e,
    );
    return out;
  }
  for (const deduction of opts.deductions) {
    const names = new Map(deduction.staff.map((row) => [row.id, row]));
    const people = charges
      .filter((row) => row.source_id === deduction.id)
      .map((row) => {
        const ref = names.get(row.staff_id);
        const remaining =
          row.status === "cancelled" ? 0 : row.remaining_amount;
        return {
          staffId: row.staff_id,
          empNo: ref?.empNo ?? null,
          fullName: ref?.fullName ?? "Staff",
          share: row.original_amount,
          applied: round2(row.original_amount - row.remaining_amount),
          remaining,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    out[deduction.id] = {
      people,
      applied: round2(people.reduce((sum, row) => sum + row.applied, 0)),
      remaining: round2(people.reduce((sum, row) => sum + row.remaining, 0)),
    };
  }
  return out;
}
