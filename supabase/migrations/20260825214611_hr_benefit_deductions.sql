-- Benefit deductions: recover a named amount from gratuity or service charge,
-- split equally across a department or selected people, over one or more months.

CREATE TABLE IF NOT EXISTS public.hr_benefit_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL
    CHECK (total_amount > 0),
  benefit_kind TEXT NOT NULL
    CHECK (benefit_kind IN ('gratuity', 'service_charge')),
  target_type TEXT NOT NULL
    CHECK (target_type IN ('department', 'people')),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  department_name TEXT,
  -- Snapshot of staff at create time: [{ "id", "empNo", "fullName" }, ...]
  staff_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(staff_snapshot) = 'array'),
  month_count INTEGER NOT NULL
    CHECK (month_count >= 1 AND month_count <= 60),
  -- Named month key (YYYY-MM-01), aligned with hr_benefit_runs.benefit_month.
  start_month DATE NOT NULL,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_benefit_deductions_department_target CHECK (
    target_type <> 'department'
    OR (
      department_name IS NOT NULL
      AND length(btrim(department_name)) > 0
    )
  ),
  CONSTRAINT hr_benefit_deductions_staff_not_empty CHECK (
    jsonb_array_length(staff_snapshot) >= 1
  )
);

CREATE INDEX IF NOT EXISTS hr_benefit_deductions_venue_month_idx
  ON public.hr_benefit_deductions (venue_id, start_month DESC);

CREATE INDEX IF NOT EXISTS hr_benefit_deductions_venue_kind_idx
  ON public.hr_benefit_deductions (venue_id, benefit_kind)
  WHERE cancelled_at IS NULL;

CREATE TRIGGER hr_benefit_deductions_set_updated_at
  BEFORE UPDATE ON public.hr_benefit_deductions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hr_benefit_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_benefit_deductions_select" ON public.hr_benefit_deductions;
CREATE POLICY "hr_benefit_deductions_select"
  ON public.hr_benefit_deductions FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'benefits', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_benefit_deductions_write" ON public.hr_benefit_deductions;
CREATE POLICY "hr_benefit_deductions_write"
  ON public.hr_benefit_deductions FOR ALL TO authenticated
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_benefit_deductions TO authenticated;
GRANT ALL ON public.hr_benefit_deductions TO service_role;
