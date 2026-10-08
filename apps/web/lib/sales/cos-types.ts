// GP & COS module — shared types.

export const COS_MODULE_KEY = "gp_cos" as const;

export const COST_CENTRES = ["food", "beverage", "wine", "other"] as const;
export type CostCentre = (typeof COST_CENTRES)[number];

export const COST_CENTRE_LABELS: Record<CostCentre, string> = {
  food: "Food",
  beverage: "Beverage",
  wine: "Wine",
  other: "Other",
};

/**
 * Auto adjustment % of the cost centre's net discounts, used until a venue
 * saves its own value in GP & COS Settings → Adjustments.
 */
export const DEFAULT_AUTO_ADJUSTMENT_PCT: Record<CostCentre, number> = {
  food: 30,
  beverage: 0,
  wine: 0,
  other: 30,
};

export type CosRunStatus = "draft" | "pending_approval" | "approved";

export type CosAdjustmentSource =
  | "manual"
  | "auto_discount"
  | "stock"
  | "other"
  | "transfer"
  /** Recorded for reference only; excluded from cost of sales. */
  | "neutral";

export type VenueCosSettings = {
  id: string;
  venue_id: string;
  cost_centre: CostCentre;
  target_cost_pct: number;
  purchase_target_gs: number;
  closing_stock_target_gs: number;
  auto_adjustment_pct: number;
  /** Accounts ledgers whose AP invoice lines are this centre's purchases. */
  ledger_account_ids?: string[];
  /** People notified (and allowed) to approve this centre's cost runs. */
  approver_user_ids?: string[];
  approver_user_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueCosAdjustment = {
  id: string;
  venue_id: string;
  cos_run_id: string;
  reason: string;
  amount_gs: number;
  source: CosAdjustmentSource;
  ledger_account: string;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueCosRun = {
  id: string;
  venue_id: string;
  cost_centre: CostCentre;
  fiscal_year: number;
  week_no: number;
  week_start: string | null;
  week_end: string | null;
  restaurant_sales_gs: number;
  sales_gs: number;
  sales_discount_gs: number;
  purchases_gs: number;
  opening_stock_gs: number;
  closing_stock_gs: number;
  imported_sales_gs: number | null;
  forecast_cost_pct: number | null;
  status: CosRunStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  approver_user_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** A cost run joined with its adjustments. */
export type VenueCosRunWithAdjustments = VenueCosRun & {
  adjustments: VenueCosAdjustment[];
};

export type VenueCosPurchase = {
  id: string;
  venue_id: string;
  cost_centre: CostCentre;
  purchase_date: string;
  supplier: string;
  product: string;
  category: string;
  amount_gs: number;
  ap_invoice_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Weekly sales snapshot aggregated from venue_daily_sales for one cost centre. */
export type CosWeekSalesSnapshot = {
  restaurant_sales_gs: number; // total venue sales for the week
  sales_gs: number; // this cost centre's sales for the week
  sales_discount_gs: number; // discount attributed to the cost centre
};

/** Per-month target override; null fields fall back to VenueCosSettings. */
export type VenueCosMonthlyTarget = {
  id: string;
  venue_id: string;
  cost_centre: CostCentre;
  fiscal_year: number;
  month_index: number;
  target_cost_pct: number | null;
  purchase_target_gs: number | null;
  closing_stock_target_gs: number | null;
};

export type CosMonthlyTargetInput = {
  month_index: number;
  target_cost_pct: number | null;
  purchase_target_gs: number | null;
  closing_stock_target_gs: number | null;
};

/**
 * DB = (+) addition (raises cost of sales); CR = (-) deduction;
 * NEU = (=) neutral (recorded, but no effect on cost of sales).
 */
export type CosAdjustmentSide = "DB" | "CR" | "NEU";

export type VenueCosAdjustmentKind = {
  id: string;
  venue_id: string;
  name: string;
  ledger_account_id: string | null;
  default_side: CosAdjustmentSide;
  active: boolean;
  sort_order: number;
};

/** NET purchase value moved between cost centres on a date. */
export type VenueCosTransfer = {
  id: string;
  venue_id: string;
  transfer_date: string;
  from_centre: CostCentre;
  to_centre: CostCentre;
  amount_net: number;
  note: string;
};
