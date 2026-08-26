import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  allocationPayoutFields,
  appliedDeductionsByStaffForMonth,
  contributorsFromRunTotals,
  mapBenefitDeductionRow,
  mergeBenefitPayout,
  mergeBenefitRunPerson,
  netBenefitPayout,
  type BenefitDeductionEntry,
  type BenefitPayoutMap,
  type BenefitRunRosterMap,
} from "./deductions";
import { payrollBenefitPayoutAmount } from "./rounding";
import type { BenefitKind } from "./types";

export type BenefitPayrollAmountInput = {
  staffId: string;
  benefitType: string;
  amount: number;
  meta?: unknown;
  benefitKind?: string | null;
  benefitMonth?: string | null;
  runTotals?: unknown;
};

export async function listBenefitDeductions(
  supabase: SupabaseClient,
  venueId: string,
): Promise<{ rows: BenefitDeductionEntry[]; migrationRequired: boolean }> {
  const { data, error } = await supabase
    .from("hr_benefit_deductions")
    .select(
      "id, name, total_amount, benefit_kind, target_type, department_id, department_name, staff_snapshot, month_count, start_month, later_split_mode, created_at, cancelled_at",
    )
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false });

  if (error) {
    if (/hr_benefit_deductions|schema cache|does not exist/i.test(error.message)) {
      return { rows: [], migrationRequired: true };
    }
    if (/later_split_mode/i.test(error.message)) {
      const retry = await supabase
        .from("hr_benefit_deductions")
        .select(
          "id, name, total_amount, benefit_kind, target_type, department_id, department_name, staff_snapshot, month_count, start_month, created_at, cancelled_at",
        )
        .eq("venue_id", venueId)
        .order("created_at", { ascending: false });
      if (retry.error) {
        console.error("[hr/benefits/deductions] list:", retry.error.message);
        return { rows: [], migrationRequired: false };
      }
      const rows = (retry.data ?? [])
        .map((row) =>
          mapBenefitDeductionRow({
            id: String(row.id),
            name: String(row.name ?? ""),
            total_amount: row.total_amount,
            benefit_kind: String(row.benefit_kind ?? ""),
            target_type: String(row.target_type ?? ""),
            department_id:
              row.department_id == null ? null : String(row.department_id),
            department_name:
              row.department_name == null ? null : String(row.department_name),
            staff_snapshot: row.staff_snapshot,
            month_count: row.month_count,
            start_month: String(row.start_month ?? ""),
            created_at: String(row.created_at ?? ""),
            cancelled_at:
              row.cancelled_at == null ? null : String(row.cancelled_at),
          }),
        )
        .filter((row): row is BenefitDeductionEntry => row != null);
      return { rows, migrationRequired: false };
    }
    console.error("[hr/benefits/deductions] list:", error.message);
    return { rows: [], migrationRequired: false };
  }

  const rows = (data ?? [])
    .map((row) =>
      mapBenefitDeductionRow({
        id: String(row.id),
        name: String(row.name ?? ""),
        total_amount: row.total_amount,
        benefit_kind: String(row.benefit_kind ?? ""),
        target_type: String(row.target_type ?? ""),
        department_id: row.department_id == null ? null : String(row.department_id),
        department_name:
          row.department_name == null ? null : String(row.department_name),
        staff_snapshot: row.staff_snapshot,
        month_count: row.month_count,
        start_month: String(row.start_month ?? ""),
        later_split_mode: (row as { later_split_mode?: unknown }).later_split_mode,
        created_at: String(row.created_at ?? ""),
        cancelled_at:
          row.cancelled_at == null ? null : String(row.cancelled_at),
      }),
    )
    .filter((row): row is BenefitDeductionEntry => row != null);

  return { rows, migrationRequired: false };
}

export type BenefitDeductionPayouts = {
  payouts: BenefitPayoutMap;
  rosters: BenefitRunRosterMap;
};

const EMPTY_PAYOUTS: BenefitDeductionPayouts = { payouts: {}, rosters: {} };

/**
 * Load payable amounts and each month’s run roster (who is on that run).
 * Deductions split each installment across the matching people on that roster.
 */
export async function loadBenefitPayoutMap(
  supabase: SupabaseClient,
  venueId: string,
): Promise<BenefitDeductionPayouts> {
  const { data: runs, error: runError } = await supabase
    .from("hr_benefit_runs")
    .select("id, benefit_kind, benefit_month, status")
    .eq("venue_id", venueId)
    .in("benefit_kind", ["gratuity", "service_charge"])
    .neq("status", "cancelled");

  if (runError) {
    if (
      /hr_benefit_runs|schema cache|does not exist/i.test(runError.message)
    ) {
      return EMPTY_PAYOUTS;
    }
    console.error("[hr/benefits/deductions] list runs:", runError.message);
    return EMPTY_PAYOUTS;
  }

  const runMeta = new Map<
    string,
    { kind: BenefitKind; month: string }
  >();
  const rosters: BenefitRunRosterMap = {};
  for (const run of runs ?? []) {
    const kind = String(run.benefit_kind);
    if (kind !== "gratuity" && kind !== "service_charge") continue;
    runMeta.set(String(run.id), {
      kind,
      month: String(run.benefit_month).slice(0, 10),
    });
    const rosterKey = `${kind}|${String(run.benefit_month).slice(0, 7)}`;
    if (!Object.prototype.hasOwnProperty.call(rosters, rosterKey)) {
      rosters[rosterKey] = [];
    }
  }

  const runIds = [...runMeta.keys()];
  if (runIds.length === 0) return { payouts: {}, rosters };

  const { data: allocations, error: allocError } = await supabase
    .from("hr_benefit_allocations")
    .select(
      "run_id, staff_id, amount, staff:staff_id(emp_no, full_name, department_id, department:departments(name))",
    )
    .eq("venue_id", venueId)
    .in("run_id", runIds);

  if (allocError) {
    console.error("[hr/benefits/deductions] list allocations:", allocError.message);
    return { payouts: {}, rosters };
  }

  let payouts: BenefitPayoutMap = {};
  let nextRosters = rosters;
  for (const row of allocations ?? []) {
    const meta = runMeta.get(String(row.run_id));
    if (!meta) continue;
    const staffId = String(row.staff_id);
    const amount = Number(row.amount) || 0;
    const staff = row.staff as
      | {
          emp_no?: string | null;
          full_name?: string | null;
          department_id?: string | null;
          department?: { name?: string } | null;
        }
      | null;
    payouts = mergeBenefitPayout(
      payouts,
      meta.kind,
      meta.month,
      staffId,
      amount,
    );
    nextRosters = mergeBenefitRunPerson(nextRosters, meta.kind, meta.month, {
      staffId,
      amount,
      empNo: staff?.emp_no ? String(staff.emp_no) : null,
      fullName: staff?.full_name ? String(staff.full_name) : "Staff",
      departmentId: staff?.department_id ? String(staff.department_id) : null,
      departmentName: staff?.department?.name
        ? String(staff.department.name)
        : null,
    });
  }
  return { payouts, rosters: nextRosters };
}

function kindFromBenefitType(benefitType: string): BenefitKind | null {
  if (benefitType === "tips") return "gratuity";
  if (benefitType === "service_charge") return "service_charge";
  return null;
}

/**
 * Amount that should land on a payroll TIPS / SERVICE_CHARGE line: net after
 * benefit deductions (Kitchen Aid etc.), then floored to AED 5 — the same
 * figure as Indv Rounded Gratuity on the benefit run.
 */
export async function mapAllocationsToPayrollAmounts(
  supabase: SupabaseClient,
  venueId: string,
  rows: BenefitPayrollAmountInput[],
): Promise<number[]> {
  const needsCuts = rows.some(
    (row) => row.benefitType === "tips" || row.benefitType === "service_charge",
  );
  if (!needsCuts) {
    return rows.map((row) =>
      payrollBenefitPayoutAmount(row.benefitType, row.amount),
    );
  }

  const [{ rows: entries }, { payouts, rosters }] = await Promise.all([
    listBenefitDeductions(supabase, venueId),
    loadBenefitPayoutMap(supabase, venueId),
  ]);

  const appliedCache = new Map<string, Map<string, number>>();
  const appliedFor = (kind: BenefitKind, month: string) => {
    const key = `${kind}|${String(month).slice(0, 7)}`;
    const cached = appliedCache.get(key);
    if (cached) return cached;
    const next = appliedDeductionsByStaffForMonth(
      entries,
      payouts,
      kind,
      month,
      rosters,
    );
    appliedCache.set(key, next);
    return next;
  };

  return rows.map((row) => {
    const kind =
      (row.benefitKind === "gratuity" || row.benefitKind === "service_charge"
        ? row.benefitKind
        : null) ?? kindFromBenefitType(row.benefitType);
    if (!kind) {
      return payrollBenefitPayoutAmount(row.benefitType, row.amount);
    }
    const month = row.benefitMonth ? String(row.benefitMonth).slice(0, 10) : "";
    const applied = month
      ? (appliedFor(kind, month).get(row.staffId) ?? 0)
      : 0;
    const fields = allocationPayoutFields(row.meta);
    const contributor = contributorsFromRunTotals(row.runTotals).find(
      (entry) => entry.staffId === row.staffId,
    );
    const net = netBenefitPayout({
      amount: row.amount,
      poolShare: fields.poolShare,
      retain: fields.retain || Number(contributor?.retain) || 0,
      excluded: fields.excluded,
      applied,
      isContributor: Boolean(contributor),
      withheld: Boolean(contributor?.withheld),
    });
    return payrollBenefitPayoutAmount(row.benefitType, net);
  });
}
