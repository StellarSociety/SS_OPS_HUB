import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appliedDeductionsByStaffForMonth,
  collectedBenefitDeductionCuts,
  mapBenefitDeductionRow,
  mergeBenefitPayout,
  mergeBenefitRunPerson,
  type BenefitDeductionEntry,
  type BenefitPayoutMap,
  type BenefitRunRosterMap,
} from "./deductions";
import type { BenefitKind } from "./types";
import { sumAed5RoundingRemainder } from "./rounding";

export type BenefitPoolCollectionsRow = {
  id: string;
  benefit_month: string;
  ose_amount: number;
  staff_activities_amount: number;
  rounding_amount: number;
  withheld_retain_amount: number;
  benefit_deduction_amount: number;
  notes: string | null;
  updated_at: string;
};

export type BenefitPoolCollectionsAmounts = {
  oseAmount: number;
  staffActivitiesAmount: number;
  roundingAmount?: number;
  withheldRetainAmount?: number;
  benefitDeductionAmount?: number;
};

/** Gratuity run general pool gross — used to suggest collection amounts. */
export type GratuityRunPoolHint = {
  runId: string;
  benefitMonth: string;
  status: string;
  poolGross: number;
  /** AED 5 payout remainders; null when the run has no allocations to derive them from. */
  roundingCollected: number | null;
  /** Retain kept because the collector is not entitled; null when the run predates this field. */
  withheldRetain: number | null;
  /** Benefit deductions taken from staff payouts; null when the run predates this field. */
  benefitDeductions: number | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function asAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Normalize YYYY-MM or YYYY-MM-01 to benefit_month DATE string. */
export function benefitMonthToDate(monthKey: string): string {
  const trimmed = monthKey.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed.slice(0, 7)}-01`;
  }
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }
  throw new Error("Invalid benefit month.");
}

export function resolvePoolDeductions(args: {
  poolGross: number;
  osePercent: number;
  activitiesPercent: number;
  recorded: BenefitPoolCollectionsAmounts | null;
}): {
  ose: number;
  activities: number;
  usedRecorded: boolean;
} {
  if (args.recorded) {
    return {
      ose: round2(args.recorded.oseAmount),
      activities: round2(args.recorded.staffActivitiesAmount),
      usedRecorded: true,
    };
  }

  const poolGross = Math.max(0, Number(args.poolGross) || 0);
  return {
    ose: round2((poolGross * args.osePercent) / 100),
    activities: round2((poolGross * args.activitiesPercent) / 100),
    usedRecorded: false,
  };
}

function parseGratuityPoolGross(totals: unknown): number | null {
  if (!totals || typeof totals !== "object") return null;
  const t = totals as Record<string, unknown>;
  const pool = t.pool as Record<string, unknown> | undefined;
  const gross = Number(pool?.gross ?? t.poolGross);
  return Number.isFinite(gross) && gross > 0 ? gross : null;
}

function parseGratuityRoundingCollected(totals: unknown): number | null {
  if (!totals || typeof totals !== "object") return null;
  const pool = (totals as Record<string, unknown>).pool as
    | Record<string, unknown>
    | undefined;
  if (pool?.roundingCollected == null) return null;
  const value = Number(pool.roundingCollected);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function parseGratuityWithheldRetain(totals: unknown): number | null {
  if (!totals || typeof totals !== "object") return null;
  const pool = (totals as Record<string, unknown>).pool as
    | Record<string, unknown>
    | undefined;
  if (pool?.withheldRetain == null) return null;
  const value = Number(pool.withheldRetain);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function parseGratuityBenefitDeductions(totals: unknown): number | null {
  if (!totals || typeof totals !== "object") return null;
  const pool = (totals as Record<string, unknown>).pool as
    | Record<string, unknown>
    | undefined;
  if (pool?.benefitDeductions == null) return null;
  const value = Number(pool.benefitDeductions);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function parseGratuityContributors(totals: unknown): Array<{
  staffId: string | null;
  retain: number;
  withheld: boolean;
}> {
  if (!totals || typeof totals !== "object") return [];
  const contributors = (totals as Record<string, unknown>).contributors;
  if (!Array.isArray(contributors)) return [];
  return contributors.map((entry) => {
    const row = (entry ?? {}) as {
      staffId?: unknown;
      retain?: unknown;
      withheld?: unknown;
    };
    return {
      staffId: typeof row.staffId === "string" && row.staffId ? row.staffId : null,
      retain: asAmount(row.retain),
      withheld: Boolean(row.withheld),
    };
  });
}

function parseGratuityContributorStaffIds(totals: unknown): Set<string> {
  const ids = new Set<string>();
  if (!totals || typeof totals !== "object") return ids;
  const contributors = (totals as Record<string, unknown>).contributors;
  if (!Array.isArray(contributors)) return ids;
  for (const entry of contributors) {
    const staffId = (entry as { staffId?: unknown } | null)?.staffId;
    if (typeof staffId === "string" && staffId) ids.add(staffId);
  }
  return ids;
}

/**
 * Rounding remainders for runs calculated before the total was persisted.
 * Mirrors the run page: contributors round on retained tips, others on payout.
 */
async function roundingCollectedFromAllocations(
  service: SupabaseClient,
  venueId: string,
  runIds: string[],
  contributorStaffIdsByRun: Map<string, Set<string>>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (runIds.length === 0) return out;

  const { data, error } = await service
    .from("hr_benefit_allocations")
    .select("run_id, staff_id, amount, meta")
    .eq("venue_id", venueId)
    .in("run_id", runIds);

  if (error || !data) return out;

  const amountsByRun = new Map<string, number[]>();
  for (const row of data) {
    const runId = String(row.run_id);
    const contributors = contributorStaffIdsByRun.get(runId);
    const meta = (row.meta ?? {}) as { retain?: unknown };
    const amount = contributors?.has(String(row.staff_id))
      ? asAmount(meta.retain)
      : asAmount(row.amount);
    const list = amountsByRun.get(runId) ?? [];
    list.push(amount);
    amountsByRun.set(runId, list);
  }

  for (const [runId, amounts] of amountsByRun) {
    out.set(runId, sumAed5RoundingRemainder(amounts));
  }
  return out;
}

function mapDeductionRows(
  rows: Array<Record<string, unknown>>,
): BenefitDeductionEntry[] {
  return rows
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
        later_split_mode: row.later_split_mode,
        created_at: String(row.created_at ?? ""),
        cancelled_at:
          row.cancelled_at == null ? null : String(row.cancelled_at),
      }),
    )
    .filter((row): row is BenefitDeductionEntry => row != null);
}

/**
 * Live benefit-deduction totals per gratuity run — same retain-then-pool
 * split as the run page, so Collections can fill before a recalc persists it.
 */
async function benefitDeductionsCollectedByRun(
  service: SupabaseClient,
  venueId: string,
  hints: GratuityRunPoolHint[],
  totalsByRun: Map<string, unknown>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (hints.length === 0) return out;

  const { data: deductionRows, error: deductionError } = await service
    .from("hr_benefit_deductions")
    .select(
      "id, name, total_amount, benefit_kind, target_type, department_id, department_name, staff_snapshot, month_count, start_month, later_split_mode, created_at, cancelled_at",
    )
    .eq("venue_id", venueId);

  let entries: BenefitDeductionEntry[] = [];
  if (deductionError) {
    if (/hr_benefit_deductions|schema cache|does not exist/i.test(deductionError.message)) {
      return out;
    }
    if (/later_split_mode/i.test(deductionError.message)) {
      const retry = await service
        .from("hr_benefit_deductions")
        .select(
          "id, name, total_amount, benefit_kind, target_type, department_id, department_name, staff_snapshot, month_count, start_month, created_at, cancelled_at",
        )
        .eq("venue_id", venueId);
      if (retry.error) return out;
      entries = mapDeductionRows((retry.data ?? []) as Array<Record<string, unknown>>);
    } else {
      return out;
    }
  } else {
    entries = mapDeductionRows((deductionRows ?? []) as Array<Record<string, unknown>>);
  }
  if (entries.length === 0) return out;

  const { data: runs, error: runError } = await service
    .from("hr_benefit_runs")
    .select("id, benefit_kind, benefit_month, status")
    .eq("venue_id", venueId)
    .in("benefit_kind", ["gratuity", "service_charge"])
    .neq("status", "cancelled");
  if (runError || !runs?.length) return out;

  const runMeta = new Map<string, { kind: BenefitKind; month: string }>();
  for (const run of runs) {
    const kind = String(run.benefit_kind);
    if (kind !== "gratuity" && kind !== "service_charge") continue;
    runMeta.set(String(run.id), {
      kind,
      month: String(run.benefit_month).slice(0, 10),
    });
  }

  const { data: allocations, error: allocError } = await service
    .from("hr_benefit_allocations")
    .select(
      "run_id, staff_id, amount, meta, staff:staff_id(emp_no, full_name, department_id, department:departments(name))",
    )
    .eq("venue_id", venueId)
    .in("run_id", [...runMeta.keys()]);
  if (allocError || !allocations) return out;

  let payouts: BenefitPayoutMap = {};
  let rosters: BenefitRunRosterMap = {};
  const allocationsByRun = new Map<
    string,
    Array<{
      staffId: string;
      amount: number;
      poolShare: number;
      retain: number;
      excluded: boolean;
    }>
  >();

  for (const row of allocations) {
    const runId = String(row.run_id);
    const meta = runMeta.get(runId);
    if (!meta) continue;
    const staffId = String(row.staff_id);
    const amount = asAmount(row.amount);
    const staffRaw = row.staff as
      | {
          emp_no?: string | null;
          full_name?: string | null;
          department_id?: string | null;
          department?: { name?: string } | null;
        }
      | Array<{
          emp_no?: string | null;
          full_name?: string | null;
          department_id?: string | null;
          department?: { name?: string } | null;
        }>
      | null;
    const staff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
    payouts = mergeBenefitPayout(payouts, meta.kind, meta.month, staffId, amount);
    rosters = mergeBenefitRunPerson(rosters, meta.kind, meta.month, {
      staffId,
      amount,
      empNo: staff?.emp_no ? String(staff.emp_no) : null,
      fullName: staff?.full_name ? String(staff.full_name) : "Staff",
      departmentId: staff?.department_id ? String(staff.department_id) : null,
      departmentName: staff?.department?.name
        ? String(staff.department.name)
        : null,
    });
    const rowMeta = (row.meta ?? {}) as Record<string, unknown>;
    const list = allocationsByRun.get(runId) ?? [];
    list.push({
      staffId,
      amount,
      poolShare: asAmount(rowMeta.poolShare),
      retain: asAmount(rowMeta.retain),
      excluded: rowMeta.excluded === true,
    });
    allocationsByRun.set(runId, list);
  }

  for (const hint of hints) {
    const appliedByStaff = appliedDeductionsByStaffForMonth(
      entries,
      payouts,
      "gratuity",
      hint.benefitMonth,
      rosters,
    );
    if (appliedByStaff.size === 0) {
      out.set(hint.runId, 0);
      continue;
    }
    out.set(
      hint.runId,
      collectedBenefitDeductionCuts({
        appliedByStaff,
        allocations: allocationsByRun.get(hint.runId) ?? [],
        contributors: parseGratuityContributors(totalsByRun.get(hint.runId)),
      }),
    );
  }
  return out;
}

/** Policy % of gratuity run general pool gross. */
export function suggestedPoolCollectionsFromGratuityRun(
  hint: GratuityRunPoolHint,
  osePercent: number,
  activitiesPercent: number,
): BenefitPoolCollectionsAmounts {
  const { ose, activities } = resolvePoolDeductions({
    poolGross: hint.poolGross,
    osePercent,
    activitiesPercent,
    recorded: null,
  });
  return {
    oseAmount: ose,
    staffActivitiesAmount: activities,
    ...(hint.roundingCollected == null
      ? {}
      : { roundingAmount: hint.roundingCollected }),
    ...(hint.withheldRetain == null
      ? {}
      : { withheldRetainAmount: hint.withheldRetain }),
    ...(hint.benefitDeductions == null
      ? {}
      : { benefitDeductionAmount: hint.benefitDeductions }),
  };
}

export async function listGratuityRunPoolHintsByMonth(
  service: SupabaseClient,
  venueId: string,
): Promise<Record<string, GratuityRunPoolHint>> {
  const { data, error } = await service
    .from("hr_benefit_runs")
    .select("id, benefit_month, status, totals")
    .eq("venue_id", venueId)
    .eq("benefit_kind", "gratuity")
    .order("benefit_month", { ascending: false });

  if (error) {
    if (/hr_benefit_runs|schema cache|does not exist/i.test(error.message)) {
      return {};
    }
    throw new Error(error.message);
  }

  const out: Record<string, GratuityRunPoolHint> = {};
  const contributorStaffIdsByRun = new Map<string, Set<string>>();
  const totalsByRun = new Map<string, unknown>();
  for (const row of data ?? []) {
    const monthKey = String(row.benefit_month).slice(0, 7);
    const poolGross = parseGratuityPoolGross(row.totals);
    if (poolGross == null) continue;

    const runId = row.id as string;
    totalsByRun.set(runId, row.totals);
    contributorStaffIdsByRun.set(
      runId,
      parseGratuityContributorStaffIds(row.totals),
    );
    out[monthKey] = {
      runId,
      benefitMonth: String(row.benefit_month).slice(0, 10),
      status: String(row.status),
      poolGross,
      roundingCollected: parseGratuityRoundingCollected(row.totals),
      withheldRetain: parseGratuityWithheldRetain(row.totals),
      benefitDeductions: parseGratuityBenefitDeductions(row.totals),
    };
  }

  const legacyRunIds = Object.values(out)
    .filter((hint) => hint.roundingCollected == null)
    .map((hint) => hint.runId);
  if (legacyRunIds.length > 0) {
    const derived = await roundingCollectedFromAllocations(
      service,
      venueId,
      legacyRunIds,
      contributorStaffIdsByRun,
    );
    for (const hint of Object.values(out)) {
      const value = derived.get(hint.runId);
      if (value != null) hint.roundingCollected = value;
    }
  }

  const liveDeductions = await benefitDeductionsCollectedByRun(
    service,
    venueId,
    Object.values(out),
    totalsByRun,
  );
  for (const hint of Object.values(out)) {
    const value = liveDeductions.get(hint.runId);
    if (value != null) hint.benefitDeductions = value;
  }

  return out;
}

export async function listBenefitPoolCollections(
  service: SupabaseClient,
  venueId: string,
): Promise<BenefitPoolCollectionsRow[]> {
  const { data, error } = await service
    .from("hr_benefit_pool_collections")
    .select(
      "id, benefit_month, ose_amount, staff_activities_amount, rounding_amount, withheld_retain_amount, benefit_deduction_amount, notes, updated_at",
    )
    .eq("venue_id", venueId)
    .order("benefit_month", { ascending: false });

  if (error) {
    let listError = error;
    // Pre-migration: rounding / withheld-retain / benefit-deduction columns may not exist yet.
    if (/benefit_deduction_amount/i.test(listError.message)) {
      const fallback = await service
        .from("hr_benefit_pool_collections")
        .select(
          "id, benefit_month, ose_amount, staff_activities_amount, rounding_amount, withheld_retain_amount, notes, updated_at",
        )
        .eq("venue_id", venueId)
        .order("benefit_month", { ascending: false });
      if (!fallback.error) {
        return (fallback.data ?? []).map((row) => ({
          id: row.id as string,
          benefit_month: String(row.benefit_month).slice(0, 10),
          ose_amount: asAmount(row.ose_amount),
          staff_activities_amount: asAmount(row.staff_activities_amount),
          rounding_amount: asAmount(
            (row as { rounding_amount?: unknown }).rounding_amount,
          ),
          withheld_retain_amount: asAmount(
            (row as { withheld_retain_amount?: unknown }).withheld_retain_amount,
          ),
          benefit_deduction_amount: 0,
          notes: (row.notes as string | null) ?? null,
          updated_at: String(row.updated_at),
        }));
      }
      listError = fallback.error;
    }
    if (/rounding_amount|withheld_retain_amount/i.test(listError.message)) {
      const fallback = await service
        .from("hr_benefit_pool_collections")
        .select(
          "id, benefit_month, ose_amount, staff_activities_amount, rounding_amount, notes, updated_at",
        )
        .eq("venue_id", venueId)
        .order("benefit_month", { ascending: false });
      if (
        fallback.error &&
        /rounding_amount/i.test(fallback.error.message)
      ) {
        const legacy = await service
          .from("hr_benefit_pool_collections")
          .select(
            "id, benefit_month, ose_amount, staff_activities_amount, notes, updated_at",
          )
          .eq("venue_id", venueId)
          .order("benefit_month", { ascending: false });
        if (legacy.error) throw new Error(legacy.error.message);
        return (legacy.data ?? []).map((row) => ({
          id: row.id as string,
          benefit_month: String(row.benefit_month).slice(0, 10),
          ose_amount: asAmount(row.ose_amount),
          staff_activities_amount: asAmount(row.staff_activities_amount),
          rounding_amount: 0,
          withheld_retain_amount: 0,
          benefit_deduction_amount: 0,
          notes: (row.notes as string | null) ?? null,
          updated_at: String(row.updated_at),
        }));
      }
      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data ?? []).map((row) => ({
        id: row.id as string,
        benefit_month: String(row.benefit_month).slice(0, 10),
        ose_amount: asAmount(row.ose_amount),
        staff_activities_amount: asAmount(row.staff_activities_amount),
        rounding_amount: asAmount(
          (row as { rounding_amount?: unknown }).rounding_amount,
        ),
        withheld_retain_amount: 0,
        benefit_deduction_amount: 0,
        notes: (row.notes as string | null) ?? null,
        updated_at: String(row.updated_at),
      }));
    }
    throw new Error(listError.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    benefit_month: String(row.benefit_month).slice(0, 10),
    ose_amount: asAmount(row.ose_amount),
    staff_activities_amount: asAmount(row.staff_activities_amount),
    rounding_amount: asAmount(
      (row as { rounding_amount?: unknown }).rounding_amount,
    ),
    withheld_retain_amount: asAmount(
      (row as { withheld_retain_amount?: unknown }).withheld_retain_amount,
    ),
    benefit_deduction_amount: asAmount(
      (row as { benefit_deduction_amount?: unknown }).benefit_deduction_amount,
    ),
    notes: (row.notes as string | null) ?? null,
    updated_at: String(row.updated_at),
  }));
}

export async function loadBenefitPoolCollectionsForMonth(
  service: SupabaseClient,
  venueId: string,
  benefitMonth: string,
): Promise<BenefitPoolCollectionsAmounts | null> {
  const monthDate = benefitMonthToDate(benefitMonth);

  const { data, error } = await service
    .from("hr_benefit_pool_collections")
    .select(
      "ose_amount, staff_activities_amount, rounding_amount, withheld_retain_amount, benefit_deduction_amount",
    )
    .eq("venue_id", venueId)
    .eq("benefit_month", monthDate)
    .maybeSingle();

  if (error) {
    if (/hr_benefit_pool_collections|schema cache|does not exist/i.test(error.message)) {
      return null;
    }
    if (/benefit_deduction_amount/i.test(error.message)) {
      const fallback = await service
        .from("hr_benefit_pool_collections")
        .select(
          "ose_amount, staff_activities_amount, rounding_amount, withheld_retain_amount",
        )
        .eq("venue_id", venueId)
        .eq("benefit_month", monthDate)
        .maybeSingle();
      if (fallback.error) {
        if (
          /hr_benefit_pool_collections|schema cache|does not exist/i.test(
            fallback.error.message,
          )
        ) {
          return null;
        }
        throw new Error(fallback.error.message);
      }
      if (!fallback.data) return null;
      return {
        oseAmount: asAmount(fallback.data.ose_amount),
        staffActivitiesAmount: asAmount(fallback.data.staff_activities_amount),
        roundingAmount: asAmount(
          (fallback.data as { rounding_amount?: unknown }).rounding_amount,
        ),
        withheldRetainAmount: asAmount(
          (fallback.data as { withheld_retain_amount?: unknown })
            .withheld_retain_amount,
        ),
        benefitDeductionAmount: 0,
      };
    }
    if (/withheld_retain_amount/i.test(error.message)) {
      const fallback = await service
        .from("hr_benefit_pool_collections")
        .select("ose_amount, staff_activities_amount, rounding_amount")
        .eq("venue_id", venueId)
        .eq("benefit_month", monthDate)
        .maybeSingle();
      if (fallback.error) {
        if (/hr_benefit_pool_collections|schema cache|does not exist/i.test(fallback.error.message)) {
          return null;
        }
        throw new Error(fallback.error.message);
      }
      if (!fallback.data) return null;
      return {
        oseAmount: asAmount(fallback.data.ose_amount),
        staffActivitiesAmount: asAmount(fallback.data.staff_activities_amount),
        roundingAmount: asAmount(
          (fallback.data as { rounding_amount?: unknown }).rounding_amount,
        ),
        withheldRetainAmount: 0,
        benefitDeductionAmount: 0,
      };
    }
    throw new Error(error.message);
  }

  if (!data) return null;

  return {
    oseAmount: asAmount(data.ose_amount),
    staffActivitiesAmount: asAmount(data.staff_activities_amount),
    roundingAmount: asAmount(
      (data as { rounding_amount?: unknown }).rounding_amount,
    ),
    withheldRetainAmount: asAmount(
      (data as { withheld_retain_amount?: unknown }).withheld_retain_amount,
    ),
    benefitDeductionAmount: asAmount(
      (data as { benefit_deduction_amount?: unknown }).benefit_deduction_amount,
    ),
  };
}

/** Keep rounding, withheld retain, and benefit deductions on an existing collections row in sync with the run. */
export async function syncDerivedPoolCollectionsFromGratuityRun(args: {
  service: SupabaseClient;
  venueId: string;
  benefitMonth: string;
  roundingAmount: number;
  withheldRetainAmount: number;
  benefitDeductionAmount: number;
  userId: string;
}): Promise<void> {
  const monthDate = benefitMonthToDate(args.benefitMonth);
  const { data, error } = await args.service
    .from("hr_benefit_pool_collections")
    .select("id")
    .eq("venue_id", args.venueId)
    .eq("benefit_month", monthDate)
    .maybeSingle();

  if (error) {
    if (
      /hr_benefit_pool_collections|schema cache|does not exist/i.test(
        error.message,
      )
    ) {
      return;
    }
    throw new Error(error.message);
  }
  if (!data?.id) return;

  const { error: updateError } = await args.service
    .from("hr_benefit_pool_collections")
    .update({
      rounding_amount: round2(Math.max(0, args.roundingAmount)),
      withheld_retain_amount: round2(Math.max(0, args.withheldRetainAmount)),
      benefit_deduction_amount: round2(Math.max(0, args.benefitDeductionAmount)),
      updated_by: args.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("venue_id", args.venueId);

  if (updateError && /benefit_deduction_amount/i.test(updateError.message)) {
    const fallback = await args.service
      .from("hr_benefit_pool_collections")
      .update({
        rounding_amount: round2(Math.max(0, args.roundingAmount)),
        withheld_retain_amount: round2(Math.max(0, args.withheldRetainAmount)),
        updated_by: args.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("venue_id", args.venueId);
    if (
      fallback.error &&
      /withheld_retain_amount/i.test(fallback.error.message)
    ) {
      await args.service
        .from("hr_benefit_pool_collections")
        .update({
          rounding_amount: round2(Math.max(0, args.roundingAmount)),
          updated_by: args.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .eq("venue_id", args.venueId);
      return;
    }
    if (fallback.error) throw new Error(fallback.error.message);
    return;
  }
  if (
    updateError &&
    /withheld_retain_amount/i.test(updateError.message)
  ) {
    await args.service
      .from("hr_benefit_pool_collections")
      .update({
        rounding_amount: round2(Math.max(0, args.roundingAmount)),
        updated_by: args.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("venue_id", args.venueId);
    return;
  }
  if (updateError) throw new Error(updateError.message);
}
