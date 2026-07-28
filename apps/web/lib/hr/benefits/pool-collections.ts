import type { SupabaseClient } from "@supabase/supabase-js";

export type BenefitPoolCollectionsRow = {
  id: string;
  benefit_month: string;
  ose_amount: number;
  staff_activities_amount: number;
  rounding_amount: number;
  notes: string | null;
  updated_at: string;
};

export type BenefitPoolCollectionsAmounts = {
  oseAmount: number;
  staffActivitiesAmount: number;
  roundingAmount?: number;
};

/** Gratuity run general pool gross — used to suggest collection amounts. */
export type GratuityRunPoolHint = {
  runId: string;
  benefitMonth: string;
  status: string;
  poolGross: number;
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
  return { oseAmount: ose, staffActivitiesAmount: activities, roundingAmount: 0 };
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
  for (const row of data ?? []) {
    const monthKey = String(row.benefit_month).slice(0, 7);
    const poolGross = parseGratuityPoolGross(row.totals);
    if (poolGross == null) continue;

    out[monthKey] = {
      runId: row.id as string,
      benefitMonth: String(row.benefit_month).slice(0, 10),
      status: String(row.status),
      poolGross,
    };
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
      "id, benefit_month, ose_amount, staff_activities_amount, rounding_amount, notes, updated_at",
    )
    .eq("venue_id", venueId)
    .order("benefit_month", { ascending: false });

  if (error) {
    // Pre-migration: rounding_amount column may not exist yet.
    if (/rounding_amount/i.test(error.message)) {
      const fallback = await service
        .from("hr_benefit_pool_collections")
        .select(
          "id, benefit_month, ose_amount, staff_activities_amount, notes, updated_at",
        )
        .eq("venue_id", venueId)
        .order("benefit_month", { ascending: false });
      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data ?? []).map((row) => ({
        id: row.id as string,
        benefit_month: String(row.benefit_month).slice(0, 10),
        ose_amount: asAmount(row.ose_amount),
        staff_activities_amount: asAmount(row.staff_activities_amount),
        rounding_amount: 0,
        notes: (row.notes as string | null) ?? null,
        updated_at: String(row.updated_at),
      }));
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    benefit_month: String(row.benefit_month).slice(0, 10),
    ose_amount: asAmount(row.ose_amount),
    staff_activities_amount: asAmount(row.staff_activities_amount),
    rounding_amount: asAmount(
      (row as { rounding_amount?: unknown }).rounding_amount,
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
    .select("ose_amount, staff_activities_amount, rounding_amount")
    .eq("venue_id", venueId)
    .eq("benefit_month", monthDate)
    .maybeSingle();

  if (error) {
    if (/hr_benefit_pool_collections|schema cache|does not exist/i.test(error.message)) {
      return null;
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
  };
}
