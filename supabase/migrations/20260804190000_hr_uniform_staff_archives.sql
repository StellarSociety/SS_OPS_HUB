-- Soft-hide employees on Uniform → Employees without removing assignments.

CREATE TABLE IF NOT EXISTS public.hr_uniform_staff_archives (
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (venue_id, staff_id)
);

CREATE INDEX IF NOT EXISTS hr_uniform_staff_archives_venue_idx
  ON public.hr_uniform_staff_archives (venue_id, archived_at DESC);

ALTER TABLE public.hr_uniform_staff_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_uniform_staff_archives_select"
  ON public.hr_uniform_staff_archives FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'view', venue_id)
  );

CREATE POLICY "hr_uniform_staff_archives_write"
  ON public.hr_uniform_staff_archives FOR ALL TO authenticated
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_uniform_staff_archives TO authenticated;
GRANT ALL ON public.hr_uniform_staff_archives TO service_role;
