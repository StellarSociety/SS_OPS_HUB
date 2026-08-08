-- Asset replacements + staff archives (Assets → Employees, parallel to uniforms).

CREATE TABLE IF NOT EXISTS public.hr_asset_replacements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES public.hr_assets(id) ON DELETE RESTRICT,
  assignment_id UUID REFERENCES public.hr_asset_assignments(id) ON DELETE SET NULL,
  replacement_asset_id UUID REFERENCES public.hr_assets(id) ON DELETE SET NULL,
  disposition TEXT NOT NULL DEFAULT 'lost'
    CHECK (disposition IN ('returned', 'lost')),
  unit_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  charged_to_employee BOOLEAN NOT NULL DEFAULT false,
  deduction_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
  notes TEXT NOT NULL DEFAULT '',
  pending_deduction_id UUID
    REFERENCES public.hr_pending_payroll_deductions(id) ON DELETE SET NULL,
  email_sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_asset_replacements_staff_idx
  ON public.hr_asset_replacements (staff_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hr_asset_replacements_venue_idx
  ON public.hr_asset_replacements (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hr_asset_replacements_pending_deduction_idx
  ON public.hr_asset_replacements (pending_deduction_id)
  WHERE pending_deduction_id IS NOT NULL;

CREATE TRIGGER hr_asset_replacements_set_updated_at
  BEFORE UPDATE ON public.hr_asset_replacements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.hr_asset_staff_archives (
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (venue_id, staff_id)
);

CREATE INDEX IF NOT EXISTS hr_asset_staff_archives_venue_idx
  ON public.hr_asset_staff_archives (venue_id, archived_at DESC);

ALTER TABLE public.hr_asset_replacements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_asset_staff_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_asset_replacements_select"
  ON public.hr_asset_replacements FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
  );

CREATE POLICY "hr_asset_replacements_write"
  ON public.hr_asset_replacements FOR ALL TO authenticated
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

CREATE POLICY "hr_asset_staff_archives_select"
  ON public.hr_asset_staff_archives FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'view', venue_id)
  );

CREATE POLICY "hr_asset_staff_archives_write"
  ON public.hr_asset_staff_archives FOR ALL TO authenticated
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_asset_replacements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_asset_staff_archives TO authenticated;
GRANT ALL ON public.hr_asset_replacements TO service_role;
GRANT ALL ON public.hr_asset_staff_archives TO service_role;
