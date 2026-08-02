-- Position / salary alteration history for Employment Path.

CREATE TABLE IF NOT EXISTS public.hr_staff_position_salary_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  change_kind TEXT NOT NULL
    CHECK (change_kind IN ('position', 'salary', 'both')),

  from_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  to_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  from_position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  to_position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,

  from_wage_package NUMERIC(14, 2),
  to_wage_package NUMERIC(14, 2),
  from_basic_salary_60 NUMERIC(14, 2),
  to_basic_salary_60 NUMERIC(14, 2),
  from_accom_all_25 NUMERIC(14, 2),
  to_accom_all_25 NUMERIC(14, 2),
  from_transp_all_15 NUMERIC(14, 2),
  to_transp_all_15 NUMERIC(14, 2),
  from_company_accommodation TEXT,
  to_company_accommodation TEXT,

  reason TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_staff_position_salary_changes_staff_date_idx
  ON public.hr_staff_position_salary_changes (staff_id, effective_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS hr_staff_position_salary_changes_venue_date_idx
  ON public.hr_staff_position_salary_changes (venue_id, effective_date DESC);

ALTER TABLE public.hr_staff_position_salary_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_staff_position_salary_changes_select"
  ON public.hr_staff_position_salary_changes;
CREATE POLICY "hr_staff_position_salary_changes_select"
  ON public.hr_staff_position_salary_changes FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_position_salary_changes_insert"
  ON public.hr_staff_position_salary_changes;
CREATE POLICY "hr_staff_position_salary_changes_insert"
  ON public.hr_staff_position_salary_changes FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_position_salary_changes_update"
  ON public.hr_staff_position_salary_changes;
CREATE POLICY "hr_staff_position_salary_changes_update"
  ON public.hr_staff_position_salary_changes FOR UPDATE TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_position_salary_changes_delete"
  ON public.hr_staff_position_salary_changes;
CREATE POLICY "hr_staff_position_salary_changes_delete"
  ON public.hr_staff_position_salary_changes FOR DELETE TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'admin', venue_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_staff_position_salary_changes TO authenticated;
GRANT ALL ON public.hr_staff_position_salary_changes TO service_role;

NOTIFY pgrst, 'reload schema';
