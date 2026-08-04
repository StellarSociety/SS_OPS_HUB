-- Company-wide HR asset catalog and optional staff assignments.

CREATE TABLE IF NOT EXISTS public.asset_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type_id UUID NOT NULL REFERENCES public.asset_types(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  serial_no TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'assigned', 'lost', 'retired')),
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hr_asset_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.hr_assets(id) ON DELETE RESTRICT,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  assigned_at DATE NOT NULL DEFAULT CURRENT_DATE,
  returned_at DATE,
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_assets_type_idx
  ON public.hr_assets (asset_type_id);

CREATE INDEX IF NOT EXISTS hr_assets_status_idx
  ON public.hr_assets (status);

CREATE UNIQUE INDEX IF NOT EXISTS hr_asset_assignments_open_asset_uidx
  ON public.hr_asset_assignments (asset_id)
  WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS hr_asset_assignments_staff_idx
  ON public.hr_asset_assignments (staff_id, assigned_at DESC);

CREATE TRIGGER hr_assets_set_updated_at
  BEFORE UPDATE ON public.hr_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER hr_asset_assignments_set_updated_at
  BEFORE UPDATE ON public.hr_asset_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.asset_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_asset_assignments ENABLE ROW LEVEL SECURITY;

-- Global lookup: readable by HR staff / assets viewers.
CREATE POLICY "asset_types_select"
  ON public.asset_types FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "asset_types_admin_write"
  ON public.asset_types FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL));

CREATE POLICY "hr_assets_select"
  ON public.hr_assets FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "hr_assets_write"
  ON public.hr_assets FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  )
  WITH CHECK (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  );

CREATE POLICY "hr_asset_assignments_select"
  ON public.hr_asset_assignments FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "hr_asset_assignments_write"
  ON public.hr_asset_assignments FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  )
  WITH CHECK (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  );

GRANT SELECT ON public.asset_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_asset_assignments TO authenticated;
GRANT ALL ON public.asset_types TO service_role;
GRANT ALL ON public.hr_assets TO service_role;
GRANT ALL ON public.hr_asset_assignments TO service_role;

INSERT INTO public.asset_types (name, sort_order) VALUES
  ('Laptop / computer', 1),
  ('Keys', 2),
  ('Uniform', 3),
  ('ID card', 4),
  ('Phone', 5),
  ('Other', 6)
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
