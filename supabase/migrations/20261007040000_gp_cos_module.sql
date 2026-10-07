-- GP & COS (Cost of Sales) module
-- Weekly cost runs per cost centre (food/beverage/wine/other), named adjustments,
-- manual purchase lines, and per-venue settings. Mirrors the COS BEV spreadsheet:
--   Cost of Sales = Purchases + Opening Stock - Closing Stock - Adjustments
--   Gross Profit  = Sales - Cost of Sales
--   Cost %        = Cost of Sales / Sales
-- RLS gates on the gp_cos module (features: food_cost / beverages_cost / margins / settings).

-- ---------------------------------------------------------------------------
-- Per-venue settings (targets, auto-adjustment %, approver)
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_cos_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  cost_centre TEXT NOT NULL
    CHECK (cost_centre IN ('food', 'beverage', 'wine', 'other')),
  target_cost_pct NUMERIC(5, 2) NOT NULL DEFAULT 27,
  purchase_target_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  closing_stock_target_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- Automatic adjustment % applied to discounts (e.g. shisha 30% of sales).
  auto_adjustment_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
  approver_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, cost_centre)
);

CREATE TRIGGER venue_cos_settings_set_updated_at
  BEFORE UPDATE ON public.venue_cos_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Weekly cost runs — one row per venue per cost centre per retail week
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_cos_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  cost_centre TEXT NOT NULL
    CHECK (cost_centre IN ('food', 'beverage', 'wine', 'other')),
  -- Retail 4-4-5 week within a fiscal year.
  fiscal_year INT NOT NULL,
  week_no INT NOT NULL CHECK (week_no BETWEEN 1 AND 53),
  week_start DATE,
  week_end DATE,

  -- Sales (auto-pulled from venue_daily_sales; stored as snapshot on the run).
  restaurant_sales_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,  -- total venue sales
  sales_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,             -- this cost centre's sales
  sales_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,    -- discount attributed to centre

  -- Cost inputs.
  purchases_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,         -- manual for now
  opening_stock_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,     -- auto = prev week closing
  closing_stock_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Verification: value imported vs value in system (for difference display).
  imported_sales_gs NUMERIC(14, 2),

  -- Forecast snapshot for the week (expected cost %, expected COS).
  forecast_cost_pct NUMERIC(5, 2),

  -- Approval workflow.
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved')),
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  approver_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, cost_centre, fiscal_year, week_no)
);

CREATE INDEX venue_cos_runs_lookup_idx
  ON public.venue_cos_runs (venue_id, cost_centre, fiscal_year, week_no);

CREATE TRIGGER venue_cos_runs_set_updated_at
  BEFORE UPDATE ON public.venue_cos_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Named adjustments — any number per cost run (no fixed column each)
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_cos_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  cos_run_id UUID NOT NULL REFERENCES public.venue_cos_runs(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  amount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- 'manual' | 'auto_discount' (the 30% rule) | 'stock' | 'other'
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto_discount', 'stock', 'other')),
  ledger_account TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX venue_cos_adjustments_run_idx
  ON public.venue_cos_adjustments (cos_run_id, sort_order);

CREATE TRIGGER venue_cos_adjustments_set_updated_at
  BEFORE UPDATE ON public.venue_cos_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Manual purchase lines (invoice connection comes later via accounting)
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_cos_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  cost_centre TEXT NOT NULL
    CHECK (cost_centre IN ('food', 'beverage', 'wine', 'other')),
  purchase_date DATE NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  product TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  amount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- Future link to an accounting AP invoice (view-only for now).
  ap_invoice_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX venue_cos_purchases_lookup_idx
  ON public.venue_cos_purchases (venue_id, cost_centre, purchase_date DESC);

CREATE TRIGGER venue_cos_purchases_set_updated_at
  BEFORE UPDATE ON public.venue_cos_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — gate on gp_cos module.
--   food_cost       → food cost centre
--   beverages_cost  → beverage / wine / other cost centres
-- View needs any of (food_cost|beverages_cost) view; edit needs the matching edit.
-- To keep policies simple and robust, we require the module 'margins' feature
-- (sensitive, covers GP/cost) for the whole module, matching how Chef wants
-- heads to see cost %. Settings table uses the 'settings' feature.
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_cos_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_cos_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_cos_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_cos_purchases ENABLE ROW LEVEL SECURITY;

-- Helper expression used below: a view / edit check on gp_cos margins.
-- venue_cos_runs ------------------------------------------------------------
CREATE POLICY "venue_cos_runs_select" ON public.venue_cos_runs
  FOR SELECT TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'view', venue_id));
CREATE POLICY "venue_cos_runs_insert" ON public.venue_cos_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id));
CREATE POLICY "venue_cos_runs_update" ON public.venue_cos_runs
  FOR UPDATE TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id));
CREATE POLICY "venue_cos_runs_delete" ON public.venue_cos_runs
  FOR DELETE TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id));

-- venue_cos_adjustments -----------------------------------------------------
CREATE POLICY "venue_cos_adjustments_select" ON public.venue_cos_adjustments
  FOR SELECT TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'view', venue_id));
CREATE POLICY "venue_cos_adjustments_insert" ON public.venue_cos_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id));
CREATE POLICY "venue_cos_adjustments_update" ON public.venue_cos_adjustments
  FOR UPDATE TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id));
CREATE POLICY "venue_cos_adjustments_delete" ON public.venue_cos_adjustments
  FOR DELETE TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id));

-- venue_cos_purchases -------------------------------------------------------
CREATE POLICY "venue_cos_purchases_select" ON public.venue_cos_purchases
  FOR SELECT TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'view', venue_id));
CREATE POLICY "venue_cos_purchases_insert" ON public.venue_cos_purchases
  FOR INSERT TO authenticated
  WITH CHECK (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id));
CREATE POLICY "venue_cos_purchases_update" ON public.venue_cos_purchases
  FOR UPDATE TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id));
CREATE POLICY "venue_cos_purchases_delete" ON public.venue_cos_purchases
  FOR DELETE TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'edit', venue_id));

-- venue_cos_settings --------------------------------------------------------
CREATE POLICY "venue_cos_settings_select" ON public.venue_cos_settings
  FOR SELECT TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'view', venue_id));
CREATE POLICY "venue_cos_settings_insert" ON public.venue_cos_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_feature_permission(auth.uid(), 'gp_cos', 'settings', 'edit', venue_id));
CREATE POLICY "venue_cos_settings_update" ON public.venue_cos_settings
  FOR UPDATE TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'settings', 'edit', venue_id))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'gp_cos', 'settings', 'edit', venue_id));
CREATE POLICY "venue_cos_settings_delete" ON public.venue_cos_settings
  FOR DELETE TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'settings', 'edit', venue_id));
