"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import { dispatchPendingPushes } from "@/lib/push/send";
import { isAppAdmin, type UserPermission } from "@/lib/role-permissions";
import { createServiceClient } from "@/lib/supabase/service";
import {
  COS_MODULE_KEY,
  COST_CENTRE_LABELS,
  type CosAdjustmentSide,
} from "@/lib/sales/cos-types";
import {
  createCosTransfer,
  deleteCosAdjustmentKind,
  deleteCosTransfer,
  getVenueCosSettings,
  upsertCosAdjustmentKind,
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
import { getCosWeekImportSnapshot } from "@/lib/sales/cos-sales-data";
import { getCosLiveWeeks } from "@/lib/sales/cos-live-figures";
import { cosWeekRange } from "@/lib/sales/cos-overview-data";
import { listVenueCosRuns } from "@/lib/sales/cos-store";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";

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

async function centreApprovers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  venueId: string,
  costCentre: CostCentre,
): Promise<string[]> {
  const settings = await getVenueCosSettings(supabase, venueId, costCentre);
  return settings?.approver_user_ids ?? [];
}

export async function submitCosRunForApprovalAction(input: {
  runId: string;
  costCentre: CostCentre;
  approverUserId: string | null;
}) {
  const { supabase, user, venue } = await requireContext();
  const approvers = await centreApprovers(supabase, venue.id, input.costCentre);
  const run = await setCosRunStatus(
    supabase,
    venue.id,
    user.id,
    input.runId,
    "pending_approval",
    approvers[0] ?? input.approverUserId,
  );

  // Notify this cost centre's approvers (Settings → Approvals).
  const recipients = approvers.filter((id) => id !== user.id);
  if (recipients.length > 0) {
    const label = COST_CENTRE_LABELS[input.costCentre];
    const service = createServiceClient();
    const rows = recipients.map((approverId) => ({
      user_id: approverId,
      venue_id: venue.id,
      module_key: COS_MODULE_KEY,
      type: "cos_run_approval_requested",
      title: `${label} cost run approval requested — W${run.week_no}`,
      body: `Please review and approve the ${label.toLowerCase()} cost of sales calculation for week ${run.week_no} (${run.fiscal_year}).`,
      entity: "cos_run",
      entity_id: `${input.costCentre}:${run.id}`,
      severity: "warning" as const,
      dedupe_key: `cos-run-approval:${venue.id}:${run.id}:${approverId}:${run.submitted_at ?? ""}`,
      read_at: null,
      push_sent_at: null,
    }));
    const { error } = await service
      .from("notifications")
      .upsert(rows, { onConflict: "dedupe_key" });
    if (error) {
      console.error("[gp-cos] approval notify failed:", error.message);
    } else {
      await dispatchPendingPushes(service);
    }
  }

  revalidatePath(`/gp-cos/${input.costCentre}/cost-runs`);
  return { ok: true as const };
}

export async function approveCosRunAction(input: {
  runId: string;
  costCentre: CostCentre;
}) {
  const { supabase, user, venue } = await requireContext();
  // When approvers are set, only they (or an app admin) may approve.
  const approvers = await centreApprovers(supabase, venue.id, input.costCentre);
  if (approvers.length > 0 && !approvers.includes(user.id)) {
    const { data: permissions } = await supabase
      .from("user_permissions")
      .select("*")
      .eq("user_id", user.id);
    if (!isAppAdmin((permissions ?? []) as UserPermission[])) {
      return {
        ok: false as const,
        error: "Only this cost centre's approvers can approve the run.",
      };
    }
  }
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
  const snapshot = await getCosWeekImportSnapshot(
    supabase,
    venue.id,
    input.costCentre,
    input.weekStart,
    input.weekEnd,
  );
  return { ok: true as const, snapshot };
}

/** Weeks that have started in a fiscal year (1..n). */
function startedWeeks(fiscalYear: number): number {
  const today = dubaiTodayIso();
  let last = 0;
  while (last < 52 && cosWeekRange(fiscalYear, last + 1).start <= today) last += 1;
  return last;
}

/** Weeks Refresh Figures will process: unapproved runs and missing weeks. */
export async function planCosRefreshAction(input: {
  costCentre: CostCentre;
  fiscalYear: number;
}) {
  const { supabase, venue } = await requireContext();
  const runs = await listVenueCosRuns(supabase, venue.id, input.costCentre, input.fiscalYear);
  const approved = new Set(
    runs.filter((r) => r.status === "approved").map((r) => r.week_no),
  );
  const weeks: number[] = [];
  for (let w = 1; w <= startedWeeks(input.fiscalYear); w++) {
    if (!approved.has(w)) weeks.push(w);
  }
  return { ok: true as const, weeks };
}

/**
 * Refresh the computed figures (Revenue sales & discounts, Accounts purchases,
 * auto adjustment, transfers) on the given weeks, creating draft runs for
 * weeks without an entry. Approved weeks are skipped; manual adjustments,
 * stocks and notes are kept. Called in small batches so the page can show
 * progress — pass weeks in ascending order.
 */
export async function refreshCosRunsAction(input: {
  costCentre: CostCentre;
  fiscalYear: number;
  weeks: number[];
}) {
  const { supabase, user, venue } = await requireContext();
  const weeks = [...input.weeks].sort((a, b) => a - b);
  if (!weeks.length) return { ok: true as const, updated: 0, created: 0 };

  const [live, runs] = await Promise.all([
    getCosLiveWeeks(
      supabase,
      venue.id,
      input.costCentre,
      input.fiscalYear,
      weeks[weeks.length - 1],
      weeks[0],
    ),
    listVenueCosRuns(supabase, venue.id, input.costCentre, input.fiscalYear),
  ]);
  const runByWeek = new Map(runs.map((r) => [r.week_no, r]));

  let updated = 0;
  let created = 0;
  for (const weekNo of weeks) {
    const run = runByWeek.get(weekNo);
    const w = live.get(weekNo);
    if (!w || run?.status === "approved") continue;
    // A new week opens with the previous week's closing stock.
    const prevClosing = Number(runByWeek.get(weekNo - 1)?.closing_stock_gs) || 0;
    const manualPurchases =
      run?.manual_purchases_gs ?? (run ? Number(run.purchases_gs) : 0);
    const saved = await upsertVenueCosRun(supabase, venue.id, user.id, {
      id: run?.id,
      cost_centre: input.costCentre,
      fiscal_year: input.fiscalYear,
      week_no: weekNo,
      week_start: w.start,
      week_end: w.end,
      restaurant_sales_gs: w.restaurantSales,
      sales_gs: w.sales,
      sales_discount_gs: w.discount,
      imported_sales_gs: w.sales,
      purchases_gs: w.purchases ?? manualPurchases,
      manual_purchases_gs: manualPurchases,
      opening_stock_gs: run ? Number(run.opening_stock_gs) || 0 : prevClosing,
      closing_stock_gs: run ? Number(run.closing_stock_gs) || 0 : 0,
      forecast_cost_pct: run?.forecast_cost_pct ?? null,
      notes: run?.notes ?? "",
    });
    runByWeek.set(weekNo, { ...saved, adjustments: [] });
    await replaceCosRunAdjustments(supabase, venue.id, user.id, saved.id, [
      ...(run?.adjustments ?? [])
        .filter((a) => a.source !== "auto_discount" && a.source !== "transfer")
        .map((a) => ({
          reason: a.reason,
          amount_gs: Number(a.amount_gs),
          source: a.source,
          ledger_account: a.ledger_account,
        })),
      ...w.transfers.map((t) => ({ ...t, source: "transfer" as const })),
      ...(w.autoAdjustment
        ? [
            {
              reason: w.autoAdjustmentReason,
              amount_gs: w.autoAdjustment,
              source: "auto_discount" as const,
            },
          ]
        : []),
    ]);
    if (run) updated += 1;
    else created += 1;
  }

  revalidatePath(`/gp-cos/${input.costCentre}/cost-runs`);
  return { ok: true as const, updated, created };
}

export async function saveCosSettingsAction(input: {
  cost_centre: CostCentre;
  target_cost_pct: number;
  purchase_target_gs?: number;
  closing_stock_target_gs?: number;
  auto_adjustment_pct?: number;
  approver_user_id?: string | null;
  ledger_account_ids?: string[];
  approver_user_ids?: string[];
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

// ---------------------------------------------------------------------------
// Adjustment kinds & transfers (Settings)
// ---------------------------------------------------------------------------

export async function saveCosAdjustmentKindAction(input: {
  id?: string;
  name: string;
  ledger_account_id: string | null;
  default_side: CosAdjustmentSide;
  active?: boolean;
}) {
  if (!input.name.trim()) return { ok: false as const, error: "Name is required." };
  const { supabase, user, venue } = await requireContext();
  try {
    const kind = await upsertCosAdjustmentKind(supabase, venue.id, user.id, input);
    revalidatePath(`/gp-cos/settings`);
    return { ok: true as const, kind };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save.";
    return {
      ok: false as const,
      error: message.includes("duplicate")
        ? "An adjustment kind with this name already exists."
        : message,
    };
  }
}

export async function deleteCosAdjustmentKindAction(id: string) {
  const { supabase, venue } = await requireContext();
  await deleteCosAdjustmentKind(supabase, venue.id, id);
  revalidatePath(`/gp-cos/settings`);
  return { ok: true as const };
}

export async function createCosTransferAction(input: {
  transfer_date: string;
  from_centre: CostCentre;
  to_centre: CostCentre;
  amount_net: number;
  note: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transfer_date)) {
    return { ok: false as const, error: "Choose a date." };
  }
  if (input.from_centre === input.to_centre) {
    return { ok: false as const, error: "Choose two different cost centres." };
  }
  if (!(input.amount_net > 0)) {
    return { ok: false as const, error: "Enter an amount above 0." };
  }
  const { supabase, user, venue } = await requireContext();
  try {
    const transfer = await createCosTransfer(supabase, venue.id, user.id, input);
    revalidatePath(`/gp-cos/settings`);
    revalidatePath(`/gp-cos/${input.from_centre}/cost-runs`);
    revalidatePath(`/gp-cos/${input.to_centre}/cost-runs`);
    return { ok: true as const, transfer };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Could not save the transfer.",
    };
  }
}

export async function deleteCosTransferAction(id: string) {
  const { supabase, venue } = await requireContext();
  await deleteCosTransfer(supabase, venue.id, id);
  revalidatePath(`/gp-cos/settings`);
  return { ok: true as const };
}
