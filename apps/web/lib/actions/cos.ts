"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import {
  replaceCosRunAdjustments,
  setCosRunStatus,
  upsertVenueCosRun,
  upsertVenueCosSettings,
  saveVenueCosMonthlyTargets,
  type UpsertCosRunPayload,
} from "@/lib/sales/cos-store";
import type {
  CosAdjustmentSource,
  CosMonthlyTargetInput,
  CostCentre,
} from "@/lib/sales/cos-types";
import { getCosDailySales } from "@/lib/sales/cos-sales-data";

async function requireContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const venue = await resolveActiveVenue(supabase);
  if (!venue) throw new Error("No active venue");
  return { supabase, user, venue };
}

export type SaveCosRunInput = UpsertCosRunPayload & {
  adjustments: {
    reason: string;
    amount_gs: number;
    source?: CosAdjustmentSource;
    ledger_account?: string;
  }[];
};

export async function saveCosRunAction(input: SaveCosRunInput) {
  const { supabase, user, venue } = await requireContext();
  const { adjustments, ...runPayload } = input;

  const run = await upsertVenueCosRun(supabase, venue.id, user.id, runPayload);
  await replaceCosRunAdjustments(
    supabase,
    venue.id,
    user.id,
    run.id,
    adjustments,
  );

  revalidatePath(`/gp-cos/${input.cost_centre}/cost-runs`);
  return { ok: true as const, runId: run.id };
}

export async function submitCosRunForApprovalAction(input: {
  runId: string;
  costCentre: CostCentre;
  approverUserId: string | null;
}) {
  const { supabase, user, venue } = await requireContext();
  await setCosRunStatus(
    supabase,
    venue.id,
    user.id,
    input.runId,
    "pending_approval",
    input.approverUserId,
  );
  revalidatePath(`/gp-cos/${input.costCentre}/cost-runs`);
  return { ok: true as const };
}

export async function approveCosRunAction(input: {
  runId: string;
  costCentre: CostCentre;
}) {
  const { supabase, user, venue } = await requireContext();
  await setCosRunStatus(supabase, venue.id, user.id, input.runId, "approved");
  revalidatePath(`/gp-cos/${input.costCentre}/cost-runs`);
  return { ok: true as const };
}

export async function reopenCosRunAction(input: {
  runId: string;
  costCentre: CostCentre;
}) {
  const { supabase, user, venue } = await requireContext();
  await setCosRunStatus(supabase, venue.id, user.id, input.runId, "draft");
  revalidatePath(`/gp-cos/${input.costCentre}/cost-runs`);
  return { ok: true as const };
}

export async function importCosWeekSalesAction(input: {
  costCentre: CostCentre;
  weekStart: string;
  weekEnd: string;
}) {
  const { supabase, venue } = await requireContext();
  // NET figures from Revenue (daily sales + per-category daily discounts),
  // the same source as the Sales/Discounts tab. Column names keep the _gs suffix.
  const { rows } = await getCosDailySales(
    supabase,
    venue.id,
    input.costCentre,
    input.weekStart,
    input.weekEnd,
  );
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const snapshot = {
    restaurant_sales_gs: round2(rows.reduce((s, r) => s + r.restaurantSalesNet, 0)),
    sales_gs: round2(rows.reduce((s, r) => s + r.centreSalesNet, 0)),
    sales_discount_gs: round2(rows.reduce((s, r) => s + r.centreDiscountNet, 0)),
  };
  return { ok: true as const, snapshot };
}

export async function saveCosSettingsAction(input: {
  cost_centre: CostCentre;
  target_cost_pct: number;
  purchase_target_gs?: number;
  closing_stock_target_gs?: number;
  auto_adjustment_pct?: number;
  approver_user_id?: string | null;
  ledger_account_ids?: string[];
}) {
  const { supabase, user, venue } = await requireContext();
  await upsertVenueCosSettings(supabase, venue.id, user.id, input);
  revalidatePath(`/gp-cos/settings`);
  return { ok: true as const };
}

export async function saveCosMonthlyTargetsAction(input: {
  cost_centre: CostCentre;
  fiscal_year: number;
  months: CosMonthlyTargetInput[];
}) {
  const { supabase, user, venue } = await requireContext();
  await saveVenueCosMonthlyTargets(
    supabase,
    venue.id,
    user.id,
    input.cost_centre,
    input.fiscal_year,
    input.months,
  );
  revalidatePath(`/gp-cos/settings`);
  revalidatePath(`/gp-cos/${input.cost_centre}/cost-runs`);
  return { ok: true as const };
}
