-- Leave balances per employee × leave type × calendar year, plus adjustment audit.

CREATE TABLE IF NOT EXISTS public.hr_leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_year INT NOT NULL CHECK (leave_year >= 2000 AND leave_year <= 2100),
  leave_type_code TEXT NOT NULL,
  entitled NUMERIC(8, 2) NOT NULL DEFAULT 0,
  accrued NUMERIC(8, 2) NOT NULL DEFAULT 0,
  used NUMERIC(8, 2) NOT NULL DEFAULT 0,
  scheduled NUMERIC(8, 2) NOT NULL DEFAULT 0,
  pending NUMERIC(8, 2) NOT NULL DEFAULT 0,
  carried_forward NUMERIC(8, 2) NOT NULL DEFAULT 0,
  expired NUMERIC(8, 2) NOT NULL DEFAULT 0,
  adjusted NUMERIC(8, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, staff_id, leave_year, leave_type_code)
);

CREATE INDEX IF NOT EXISTS hr_leave_balances_venue_year_idx
  ON public.hr_leave_balances (venue_id, leave_year);

CREATE INDEX IF NOT EXISTS hr_leave_balances_staff_year_idx
  ON public.hr_leave_balances (staff_id, leave_year);

ALTER TABLE public.hr_leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_leave_balances_select" ON public.hr_leave_balances;
CREATE POLICY "hr_leave_balances_select"
  ON public.hr_leave_balances FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_leave_balances_write" ON public.hr_leave_balances;
CREATE POLICY "hr_leave_balances_write"
  ON public.hr_leave_balances FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Adjustment audit history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_leave_balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  balance_id UUID NOT NULL REFERENCES public.hr_leave_balances(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  previous_value NUMERIC(8, 2) NOT NULL,
  new_value NUMERIC(8, 2) NOT NULL,
  reason TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_leave_balance_adjustments_balance_idx
  ON public.hr_leave_balance_adjustments (balance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hr_leave_balance_adjustments_venue_idx
  ON public.hr_leave_balance_adjustments (venue_id, created_at DESC);

ALTER TABLE public.hr_leave_balance_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_leave_balance_adjustments_select" ON public.hr_leave_balance_adjustments;
CREATE POLICY "hr_leave_balance_adjustments_select"
  ON public.hr_leave_balance_adjustments FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_leave_balance_adjustments_insert" ON public.hr_leave_balance_adjustments;
CREATE POLICY "hr_leave_balance_adjustments_insert"
  ON public.hr_leave_balance_adjustments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );
