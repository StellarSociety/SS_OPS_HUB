-- Per-staff certification flags (e.g. employee-provided → exclude from company expenses).

CREATE TABLE IF NOT EXISTS public.hr_staff_certification_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  staff_field TEXT NOT NULL,
  employee_provided BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_staff_certification_flags_staff_field_chk CHECK (
    staff_field IN (
      'ohc_date',
      'pic_date',
      'basic_food_safety_date',
      'fire_safety_date',
      'first_aid_date'
    )
  ),
  CONSTRAINT hr_staff_certification_flags_staff_field_uidx UNIQUE (staff_id, staff_field)
);

CREATE INDEX IF NOT EXISTS hr_staff_certification_flags_venue_staff_idx
  ON public.hr_staff_certification_flags (venue_id, staff_id);

ALTER TABLE public.hr_staff_certification_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_staff_certification_flags_select"
  ON public.hr_staff_certification_flags;
CREATE POLICY "hr_staff_certification_flags_select"
  ON public.hr_staff_certification_flags FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_certification_flags_insert"
  ON public.hr_staff_certification_flags;
CREATE POLICY "hr_staff_certification_flags_insert"
  ON public.hr_staff_certification_flags FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_certification_flags_update"
  ON public.hr_staff_certification_flags;
CREATE POLICY "hr_staff_certification_flags_update"
  ON public.hr_staff_certification_flags FOR UPDATE TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_certification_flags_delete"
  ON public.hr_staff_certification_flags;
CREATE POLICY "hr_staff_certification_flags_delete"
  ON public.hr_staff_certification_flags FOR DELETE TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'edit', venue_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_staff_certification_flags TO authenticated;
GRANT ALL ON public.hr_staff_certification_flags TO service_role;

NOTIFY pgrst, 'reload schema';
