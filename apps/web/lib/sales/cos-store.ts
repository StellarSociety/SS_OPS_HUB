import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CosMonthlyTargetInput,
  CostCentre,
  CosWeekSalesSnapshot,
  VenueCosAdjustment,
  VenueCosAdjustmentKind,
  VenueCosMonthlyTarget,
  VenueCosTransfer,
  CosAdjustmentSide,
  CosAdjustmentSource,
  VenueCosPurchase,
  VenueCosRun,
  VenueCosRunWithAdjustments,
  VenueCosSettings,
} from "@/lib/sales/cos-types";

const COS_TABLES = [
  "venue_cos_runs",
  "venue_cos_adjustments",
  "venue_cos_purchases",
  "venue_cos_settings",
] as const;

export function isCosSchemaMissingError(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return (
    message.includes("PGRST205") ||
    message.includes("Could not find the table") ||
    COS_TABLES.some((t) => message.includes(t))
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export async function listVenueCosSettings(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueCosSettings[]> {
  const { data, error } = await supabase
    .from("venue_cos_settings")
    .select("*")
    .eq("venue_id", venueId);
  if (error) {
    if (isCosSchemaMissingError(error)) return [];
    throw error;
  }
  return (data ?? []) as VenueCosSettings[];
}

export async function getVenueCosSettings(
  supabase: SupabaseClient,
  venueId: string,
  costCentre: CostCentre,
): Promise<VenueCosSettings | null> {
  const { data, error } = await supabase
    .from("venue_cos_settings")
    .select("*")
    .eq("venue_id", venueId)
    .eq("cost_centre", costCentre)
    .maybeSingle();
  if (error) {
    if (isCosSchemaMissingError(error)) return null;
    throw error;
  }
  return (data as VenueCosSettings | null) ?? null;
}

export async function upsertVenueCosSettings(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    cost_centre: CostCentre;
    target_cost_pct: number;
    purchase_target_gs?: number;
    closing_stock_target_gs?: number;
    auto_adjustment_pct?: number;
    approver_user_id?: string | null;
    ledger_account_ids?: string[];
    approver_user_ids?: string[];
  },
): Promise<VenueCosSettings> {
  const row = {
    venue_id: venueId,
    cost_centre: payload.cost_centre,
    target_cost_pct: payload.target_cost_pct,
    purchase_target_gs: payload.purchase_target_gs ?? 0,
    closing_stock_target_gs: payload.closing_stock_target_gs ?? 0,
    auto_adjustment_pct: payload.auto_adjustment_pct ?? 0,
    approver_user_id: payload.approver_user_id ?? null,
    ...(payload.ledger_account_ids
      ? { ledger_account_ids: payload.ledger_account_ids }
      : {}),
    ...(payload.approver_user_ids
      ? { approver_user_ids: payload.approver_user_ids }
      : {}),
    updated_by: userId,
  };
  const { data, error } = await supabase
    .from("venue_cos_settings")
    .upsert({ ...row, created_by: userId }, { onConflict: "venue_id,cost_centre" })
    .select("*")
    .single();
  if (error) throw error;
  return data as VenueCosSettings;
}

// ---------------------------------------------------------------------------
// Cost runs (+ adjustments)
// ---------------------------------------------------------------------------
export async function listVenueCosRuns(
  supabase: SupabaseClient,
  venueId: string,
  costCentre: CostCentre,
  fiscalYear: number,
): Promise<VenueCosRunWithAdjustments[]> {
  const { data: runs, error } = await supabase
    .from("venue_cos_runs")
    .select("*")
    .eq("venue_id", venueId)
    .eq("cost_centre", costCentre)
    .eq("fiscal_year", fiscalYear)
    .order("week_no", { ascending: true });
  if (error) {
    if (isCosSchemaMissingError(error)) return [];
    throw error;
  }
  const runRows = (runs ?? []) as VenueCosRun[];
  if (runRows.length === 0) return [];

  const runIds = runRows.map((r) => r.id);
  const { data: adj, error: adjError } = await supabase
    .from("venue_cos_adjustments")
    .select("*")
    .in("cos_run_id", runIds)
    .order("sort_order", { ascending: true });
  if (adjError && !isCosSchemaMissingError(adjError)) throw adjError;

  const byRun = new Map<string, VenueCosAdjustment[]>();
  for (const a of (adj ?? []) as VenueCosAdjustment[]) {
    const list = byRun.get(a.cos_run_id) ?? [];
    list.push(a);
    byRun.set(a.cos_run_id, list);
  }

  return runRows.map((r) => ({ ...r, adjustments: byRun.get(r.id) ?? [] }));
}

export async function getVenueCosRun(
  supabase: SupabaseClient,
  venueId: string,
  runId: string,
): Promise<VenueCosRunWithAdjustments | null> {
  const { data: run, error } = await supabase
    .from("venue_cos_runs")
    .select("*")
    .eq("venue_id", venueId)
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    if (isCosSchemaMissingError(error)) return null;
    throw error;
  }
  if (!run) return null;

  const { data: adj, error: adjError } = await supabase
    .from("venue_cos_adjustments")
    .select("*")
    .eq("cos_run_id", runId)
    .order("sort_order", { ascending: true });
  if (adjError && !isCosSchemaMissingError(adjError)) throw adjError;

  return {
    ...(run as VenueCosRun),
    adjustments: ((adj ?? []) as VenueCosAdjustment[]),
  };
}

export type UpsertCosRunPayload = {
  id?: string;
  cost_centre: CostCentre;
  fiscal_year: number;
  week_no: number;
  week_start?: string | null;
  week_end?: string | null;
  restaurant_sales_gs?: number;
  sales_gs?: number;
  sales_discount_gs?: number;
  purchases_gs?: number;
  opening_stock_gs?: number;
  closing_stock_gs?: number;
  imported_sales_gs?: number | null;
  forecast_cost_pct?: number | null;
  notes?: string;
};

export async function upsertVenueCosRun(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: UpsertCosRunPayload,
): Promise<VenueCosRun> {
  const row = {
    venue_id: venueId,
    cost_centre: payload.cost_centre,
    fiscal_year: payload.fiscal_year,
    week_no: payload.week_no,
    week_start: payload.week_start ?? null,
    week_end: payload.week_end ?? null,
    restaurant_sales_gs: payload.restaurant_sales_gs ?? 0,
    sales_gs: payload.sales_gs ?? 0,
    sales_discount_gs: payload.sales_discount_gs ?? 0,
    purchases_gs: payload.purchases_gs ?? 0,
    opening_stock_gs: payload.opening_stock_gs ?? 0,
    closing_stock_gs: payload.closing_stock_gs ?? 0,
    imported_sales_gs: payload.imported_sales_gs ?? null,
    forecast_cost_pct: payload.forecast_cost_pct ?? null,
    notes: payload.notes ?? "",
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_cos_runs")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();
    if (error) throw error;
    return data as VenueCosRun;
  }

  const { data, error } = await supabase
    .from("venue_cos_runs")
    .upsert(
      { ...row, created_by: userId },
      { onConflict: "venue_id,cost_centre,fiscal_year,week_no" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as VenueCosRun;
}

export async function setCosRunStatus(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  runId: string,
  status: "draft" | "pending_approval" | "approved",
  approverUserId?: string | null,
): Promise<VenueCosRun> {
  const patch: Record<string, unknown> = { status, updated_by: userId };
  if (status === "pending_approval") {
    patch.submitted_by = userId;
    patch.submitted_at = new Date().toISOString();
    patch.approver_user_id = approverUserId ?? null;
    patch.approved_by = null;
    patch.approved_at = null;
  } else if (status === "approved") {
    patch.approved_by = userId;
    patch.approved_at = new Date().toISOString();
  } else {
    patch.submitted_at = null;
    patch.approved_by = null;
    patch.approved_at = null;
  }

  const { data, error } = await supabase
    .from("venue_cos_runs")
    .update(patch)
    .eq("id", runId)
    .eq("venue_id", venueId)
    .select("*")
    .single();
  if (error) throw error;
  return data as VenueCosRun;
}

export async function deleteVenueCosRun(
  supabase: SupabaseClient,
  venueId: string,
  runId: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_cos_runs")
    .delete()
    .eq("id", runId)
    .eq("venue_id", venueId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Adjustments (replace-all for a run keeps the editor simple)
// ---------------------------------------------------------------------------
export async function replaceCosRunAdjustments(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  runId: string,
  adjustments: {
    reason: string;
    amount_gs: number;
    source?: CosAdjustmentSource;
    ledger_account?: string;
  }[],
): Promise<void> {
  const { error: delError } = await supabase
    .from("venue_cos_adjustments")
    .delete()
    .eq("cos_run_id", runId)
    .eq("venue_id", venueId);
  if (delError) throw delError;

  if (adjustments.length === 0) return;

  const rows = adjustments.map((a, i) => ({
    venue_id: venueId,
    cos_run_id: runId,
    reason: a.reason.trim(),
    amount_gs: a.amount_gs,
    source: a.source ?? "manual",
    ledger_account: a.ledger_account ?? "",
    sort_order: i,
    created_by: userId,
    updated_by: userId,
  }));
  const { error } = await supabase.from("venue_cos_adjustments").insert(rows);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------
export async function listVenueCosPurchases(
  supabase: SupabaseClient,
  venueId: string,
  costCentre: CostCentre,
): Promise<VenueCosPurchase[]> {
  const { data, error } = await supabase
    .from("venue_cos_purchases")
    .select("*")
    .eq("venue_id", venueId)
    .eq("cost_centre", costCentre)
    .order("purchase_date", { ascending: false });
  if (error) {
    if (isCosSchemaMissingError(error)) return [];
    throw error;
  }
  return (data ?? []) as VenueCosPurchase[];
}

// ---------------------------------------------------------------------------
// Weekly sales aggregation from venue_daily_sales (auto-pull source)
// ---------------------------------------------------------------------------
type DailySalesRow = {
  sale_date: string;
  lunch_food_gs: number; dinner_food_gs: number;
  lunch_beverages_gs: number; dinner_beverages_gs: number;
  lunch_wine_gs: number; dinner_wine_gs: number;
  lunch_shisha_gs: number; dinner_shisha_gs: number;
  lunch_tobacco_gs: number; dinner_tobacco_gs: number;
  lunch_others_gs: number; dinner_others_gs: number;
  all_day_discount_gs: number;
};

const CENTRE_FIELDS: Record<CostCentre, (keyof DailySalesRow)[]> = {
  food: ["lunch_food_gs", "dinner_food_gs"],
  beverage: ["lunch_beverages_gs", "dinner_beverages_gs"],
  wine: ["lunch_wine_gs", "dinner_wine_gs"],
  other: [
    "lunch_shisha_gs", "dinner_shisha_gs",
    "lunch_tobacco_gs", "dinner_tobacco_gs",
    "lunch_others_gs", "dinner_others_gs",
  ],
};

function rowTotal(row: DailySalesRow): number {
  return (
    (row.lunch_food_gs || 0) + (row.dinner_food_gs || 0) +
    (row.lunch_beverages_gs || 0) + (row.dinner_beverages_gs || 0) +
    (row.lunch_wine_gs || 0) + (row.dinner_wine_gs || 0) +
    (row.lunch_shisha_gs || 0) + (row.dinner_shisha_gs || 0) +
    (row.lunch_tobacco_gs || 0) + (row.dinner_tobacco_gs || 0) +
    (row.lunch_others_gs || 0) + (row.dinner_others_gs || 0)
  );
}

/**
 * Aggregate daily sales within [weekStart, weekEnd] into a snapshot for a cost
 * centre. The all-day discount is apportioned to the cost centre by its sales
 * share (the daily table stores a single discount, not per centre).
 */
export async function getCosWeekSalesSnapshot(
  supabase: SupabaseClient,
  venueId: string,
  costCentre: CostCentre,
  weekStart: string,
  weekEnd: string,
): Promise<CosWeekSalesSnapshot> {
  const empty: CosWeekSalesSnapshot = {
    restaurant_sales_gs: 0,
    sales_gs: 0,
    sales_discount_gs: 0,
  };
  const { data, error } = await supabase
    .from("venue_daily_sales")
    .select("*")
    .eq("venue_id", venueId)
    .gte("sale_date", weekStart)
    .lte("sale_date", weekEnd);
  if (error) {
    if (isCosSchemaMissingError(error)) return empty;
    throw error;
  }

  let restaurant = 0;
  let centre = 0;
  let discount = 0;
  for (const r of (data ?? []) as DailySalesRow[]) {
    restaurant += rowTotal(r);
    for (const f of CENTRE_FIELDS[costCentre]) {
      centre += Number(r[f]) || 0;
    }
    discount += Number(r.all_day_discount_gs) || 0;
  }

  // Apportion the all-day discount by this centre's share of total sales.
  const centreDiscount = restaurant > 0 ? discount * (centre / restaurant) : 0;

  return {
    restaurant_sales_gs: restaurant,
    sales_gs: centre,
    sales_discount_gs: centreDiscount,
  };
}

// ---------------------------------------------------------------------------
// Monthly targets
// ---------------------------------------------------------------------------

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function listVenueCosMonthlyTargets(
  supabase: SupabaseClient,
  venueId: string,
  filter?: { costCentre?: CostCentre; fiscalYear?: number },
): Promise<VenueCosMonthlyTarget[]> {
  let query = supabase
    .from("venue_cos_monthly_targets")
    .select("*")
    .eq("venue_id", venueId);
  if (filter?.costCentre) query = query.eq("cost_centre", filter.costCentre);
  if (filter?.fiscalYear) query = query.eq("fiscal_year", filter.fiscalYear);
  const { data, error } = await query;
  if (error) {
    // Table not created yet → behave as "no monthly overrides".
    if (isCosSchemaMissingError(error)) return [];
    throw error;
  }
  return (data ?? []).map((r) => ({
    ...(r as VenueCosMonthlyTarget),
    target_cost_pct: numOrNull(r.target_cost_pct),
    purchase_target_gs: numOrNull(r.purchase_target_gs),
    closing_stock_target_gs: numOrNull(r.closing_stock_target_gs),
  }));
}

/** Replace a centre's monthly targets for one year (all-null months removed). */
export async function saveVenueCosMonthlyTargets(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  costCentre: CostCentre,
  fiscalYear: number,
  months: CosMonthlyTargetInput[],
): Promise<void> {
  const keep = months.filter(
    (m) =>
      m.target_cost_pct != null ||
      m.purchase_target_gs != null ||
      m.closing_stock_target_gs != null,
  );
  const clear = months
    .filter((m) => !keep.includes(m))
    .map((m) => m.month_index);

  if (keep.length > 0) {
    const { error } = await supabase.from("venue_cos_monthly_targets").upsert(
      keep.map((m) => ({
        venue_id: venueId,
        cost_centre: costCentre,
        fiscal_year: fiscalYear,
        month_index: m.month_index,
        target_cost_pct: m.target_cost_pct,
        purchase_target_gs: m.purchase_target_gs,
        closing_stock_target_gs: m.closing_stock_target_gs,
        created_by: userId,
        updated_by: userId,
      })),
      { onConflict: "venue_id,cost_centre,fiscal_year,month_index" },
    );
    if (error) throw error;
  }
  if (clear.length > 0) {
    const { error } = await supabase
      .from("venue_cos_monthly_targets")
      .delete()
      .eq("venue_id", venueId)
      .eq("cost_centre", costCentre)
      .eq("fiscal_year", fiscalYear)
      .in("month_index", clear);
    if (error) throw error;
  }
}

/** Effective targets for a month: monthly override, else the centre default. */
export function resolveCosTargets(
  settings: Pick<
    VenueCosSettings,
    "target_cost_pct" | "purchase_target_gs" | "closing_stock_target_gs"
  > | null,
  monthly: VenueCosMonthlyTarget | null | undefined,
): {
  targetCostPct: number;
  purchaseTargetGs: number;
  closingStockTargetGs: number;
} {
  return {
    targetCostPct:
      monthly?.target_cost_pct ?? Number(settings?.target_cost_pct ?? 27),
    purchaseTargetGs:
      monthly?.purchase_target_gs ?? Number(settings?.purchase_target_gs ?? 0),
    closingStockTargetGs:
      monthly?.closing_stock_target_gs ??
      Number(settings?.closing_stock_target_gs ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Adjustment kinds
// ---------------------------------------------------------------------------

export async function listCosAdjustmentKinds(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueCosAdjustmentKind[]> {
  const { data, error } = await supabase
    .from("venue_cos_adjustment_kinds")
    .select("*")
    .eq("venue_id", venueId)
    .order("sort_order")
    .order("name");
  if (error) {
    if (isCosSchemaMissingError(error)) return [];
    throw error;
  }
  return (data ?? []) as VenueCosAdjustmentKind[];
}

export async function upsertCosAdjustmentKind(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  kind: {
    id?: string;
    name: string;
    ledger_account_id: string | null;
    default_side: CosAdjustmentSide;
    active?: boolean;
  },
): Promise<VenueCosAdjustmentKind> {
  const row = {
    venue_id: venueId,
    name: kind.name.trim(),
    ledger_account_id: kind.ledger_account_id,
    default_side: kind.default_side,
    active: kind.active ?? true,
    updated_by: userId,
  };
  const query = kind.id
    ? supabase
        .from("venue_cos_adjustment_kinds")
        .update(row)
        .eq("id", kind.id)
        .eq("venue_id", venueId)
    : supabase
        .from("venue_cos_adjustment_kinds")
        .insert({ ...row, created_by: userId });
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as VenueCosAdjustmentKind;
}

export async function deleteCosAdjustmentKind(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_cos_adjustment_kinds")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export async function listCosTransfers(
  supabase: SupabaseClient,
  venueId: string,
  range?: { from: string; to: string },
): Promise<VenueCosTransfer[]> {
  let query = supabase
    .from("venue_cos_transfers")
    .select("*")
    .eq("venue_id", venueId)
    .order("transfer_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (range) {
    query = query.gte("transfer_date", range.from).lte("transfer_date", range.to);
  }
  const { data, error } = await query;
  if (error) {
    if (isCosSchemaMissingError(error)) return [];
    throw error;
  }
  return (data ?? []).map((t) => ({
    ...(t as VenueCosTransfer),
    transfer_date: String(t.transfer_date).slice(0, 10),
    amount_net: Number(t.amount_net) || 0,
  }));
}

export async function createCosTransfer(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  input: Omit<VenueCosTransfer, "id" | "venue_id">,
): Promise<VenueCosTransfer> {
  const { data, error } = await supabase
    .from("venue_cos_transfers")
    .insert({
      venue_id: venueId,
      ...input,
      note: input.note.trim(),
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as VenueCosTransfer;
}

export async function deleteCosTransfer(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_cos_transfers")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);
  if (error) throw error;
}
