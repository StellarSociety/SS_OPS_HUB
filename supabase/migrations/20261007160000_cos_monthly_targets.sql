-- GP & COS: per-month targets for each cost centre (retail 4-4-5 months).
-- A NULL value means "use the cost centre default" from venue_cos_settings.

CREATE TABLE IF NOT EXISTS public.venue_cos_monthly_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  cost_centre TEXT NOT NULL
    CHECK (cost_centre IN ('food', 'beverage', 'wine', 'other')),
  fiscal_year INT NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2100),
  month_index INT NOT NULL CHECK (month_index BETWEEN 0 AND 11),
  target_cost_pct NUMERIC(5, 2),
  purchase_target_gs NUMERIC(14, 2),
  closing_stock_target_gs NUMERIC(14, 2),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, cost_centre, fiscal_year, month_index)
);

DROP TRIGGER IF EXISTS venue_cos_monthly_targets_set_updated_at
  ON public.venue_cos_monthly_targets;
CREATE TRIGGER venue_cos_monthly_targets_set_updated_at
  BEFORE UPDATE ON public.venue_cos_monthly_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_cos_monthly_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_cos_monthly_targets_select" ON public.venue_cos_monthly_targets;
CREATE POLICY "venue_cos_monthly_targets_select" ON public.venue_cos_monthly_targets
  FOR SELECT TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'margins', 'view', venue_id));

DROP POLICY IF EXISTS "venue_cos_monthly_targets_insert" ON public.venue_cos_monthly_targets;
CREATE POLICY "venue_cos_monthly_targets_insert" ON public.venue_cos_monthly_targets
  FOR INSERT TO authenticated
  WITH CHECK (public.has_feature_permission(auth.uid(), 'gp_cos', 'settings', 'edit', venue_id));

DROP POLICY IF EXISTS "venue_cos_monthly_targets_update" ON public.venue_cos_monthly_targets;
CREATE POLICY "venue_cos_monthly_targets_update" ON public.venue_cos_monthly_targets
  FOR UPDATE TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'settings', 'edit', venue_id))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'gp_cos', 'settings', 'edit', venue_id));

DROP POLICY IF EXISTS "venue_cos_monthly_targets_delete" ON public.venue_cos_monthly_targets;
CREATE POLICY "venue_cos_monthly_targets_delete" ON public.venue_cos_monthly_targets
  FOR DELETE TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'gp_cos', 'settings', 'edit', venue_id));
