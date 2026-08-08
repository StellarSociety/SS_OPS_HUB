-- Insurance providers catalog, category→provider link, and position defaults.
-- Used by Staff Compliance → Insurance (employees + providers).

CREATE TABLE IF NOT EXISTS public.insurance_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  contact_person TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  lead_days INT NOT NULL DEFAULT 30,
  sort_order INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.insurance_categories
  ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES public.insurance_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS insurance_categories_provider_idx
  ON public.insurance_categories (provider_id);

CREATE TABLE IF NOT EXISTS public.insurance_category_position_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.insurance_categories(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.positions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category_id, department_id, position_id)
);

CREATE INDEX IF NOT EXISTS insurance_category_position_defaults_category_idx
  ON public.insurance_category_position_defaults (category_id);

CREATE INDEX IF NOT EXISTS insurance_category_position_defaults_dept_idx
  ON public.insurance_category_position_defaults (department_id);

ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_category_position_defaults ENABLE ROW LEVEL SECURITY;

-- Providers: same access model as certification_types / insurance_categories
CREATE POLICY "insurance_providers_select"
  ON public.insurance_providers FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "insurance_providers_write"
  ON public.insurance_providers FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  )
  WITH CHECK (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  );

CREATE POLICY "insurance_category_position_defaults_select"
  ON public.insurance_category_position_defaults FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'staff', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "insurance_category_position_defaults_write"
  ON public.insurance_category_position_defaults FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  )
  WITH CHECK (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('assets', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('edit')
    )
  );
