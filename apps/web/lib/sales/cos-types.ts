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

export type CosRunStatus = "draft" | "pending_approval" | "approved";

export type CosAdjustmentSource = "manual" | "auto_discount" | "stock" | "other";

export type VenueCosSettings = {
  id: string;
  venue_id: string;
  cost_centre: CostCentre;
  target_cost_pct: number;
  purchase_target_gs: number;
  closing_stock_target_gs: number;
  auto_adjustment_pct: number;
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
