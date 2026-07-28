-- HR Benefits: monthly gratuity & service-charge settlement runs.
-- Allocations (per staff) already exist in hr_benefit_allocations; this adds
-- the run header (history) similar to hr_payroll_runs.

CREATE TABLE IF NOT EXISTS public.hr_benefit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  benefit_kind TEXT NOT NULL
    CHECK (benefit_kind IN ('gratuity', 'service_charge')),
  -- Named month key (YYYY-MM-01), same convention as payroll_month.
  benefit_month DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  distribution_date DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'calculated',
      'review',
      'finalized',
      'applied_to_payroll',
      'cancelled'
    )),
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Snapshot of venue benefits settings at create / last recalculate time.
  settings_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, benefit_kind, benefit_month)
);

CREATE INDEX IF NOT EXISTS hr_benefit_runs_venue_kind_month_idx
  ON public.hr_benefit_runs (venue_id, benefit_kind, benefit_month DESC);

CREATE INDEX IF NOT EXISTS hr_benefit_runs_venue_status_idx
  ON public.hr_benefit_runs (venue_id, status);

ALTER TABLE public.hr_benefit_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_benefit_runs_select" ON public.hr_benefit_runs;
CREATE POLICY "hr_benefit_runs_select"
  ON public.hr_benefit_runs FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'benefits', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_benefit_runs_write" ON public.hr_benefit_runs;
CREATE POLICY "hr_benefit_runs_write"
  ON public.hr_benefit_runs FOR ALL TO authenticated
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

-- Link per-staff allocations to a run (nullable for legacy rows).
ALTER TABLE public.hr_benefit_allocations
  ADD COLUMN IF NOT EXISTS run_id UUID
    REFERENCES public.hr_benefit_runs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS hr_benefit_allocations_run_idx
  ON public.hr_benefit_allocations (run_id);

-- Run audit trail (create / status transitions / recalculate).
CREATE TABLE IF NOT EXISTS public.hr_benefit_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_benefit_runs(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_benefit_run_events_run_idx
  ON public.hr_benefit_run_events (run_id, created_at DESC);

ALTER TABLE public.hr_benefit_run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_benefit_run_events_select" ON public.hr_benefit_run_events;
CREATE POLICY "hr_benefit_run_events_select"
  ON public.hr_benefit_run_events FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'benefits', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_benefit_run_events_insert" ON public.hr_benefit_run_events;
CREATE POLICY "hr_benefit_run_events_insert"
  ON public.hr_benefit_run_events FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'benefits', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
  );
