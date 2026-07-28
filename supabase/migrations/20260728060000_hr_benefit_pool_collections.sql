-- Monthly OS&E / breakages and staff-activities collections deducted from benefits pools.

CREATE TABLE IF NOT EXISTS public.hr_benefit_pool_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  -- Named month key (YYYY-MM-01), aligned with hr_benefit_runs.benefit_month.
  benefit_month DATE NOT NULL,
  ose_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (ose_amount >= 0),
  staff_activities_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (staff_activities_amount >= 0),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, benefit_month)
);

CREATE INDEX IF NOT EXISTS hr_benefit_pool_collections_venue_month_idx
  ON public.hr_benefit_pool_collections (venue_id, benefit_month DESC);

ALTER TABLE public.hr_benefit_pool_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_benefit_pool_collections_select" ON public.hr_benefit_pool_collections;
CREATE POLICY "hr_benefit_pool_collections_select"
  ON public.hr_benefit_pool_collections FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'benefits', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_benefit_pool_collections_write" ON public.hr_benefit_pool_collections;
CREATE POLICY "hr_benefit_pool_collections_write"
  ON public.hr_benefit_pool_collections FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'benefits', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'benefits', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
  );
