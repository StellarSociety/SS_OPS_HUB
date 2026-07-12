-- Additional HR lookups (civil status, gender, insurance categories,
-- certification types) plus a venue-scoped key/value settings table used by the
-- Expiry & Reminders, Salary Defaults, and Notifications HR settings sections.

-- ---------------------------------------------------------------------------
-- Global lookups (company-wide, not venue scoped) — mirror employment_statuses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.civil_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.genders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insurance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  default_medical_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.certification_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  renewal_months INT NOT NULL DEFAULT 12,
  lead_days INT NOT NULL DEFAULT 30,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Venue-scoped settings (JSON per key: 'expiry', 'salary_defaults', 'notifications')
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_venue_settings (
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (venue_id, key)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.civil_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.genders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certification_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_venue_settings ENABLE ROW LEVEL SECURITY;

-- Global lookups: readable by any hr staff/lookups viewer; writable by lookups admin.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['civil_statuses', 'genders', 'insurance_categories', 'certification_types']
  LOOP
    EXECUTE format($f$
      CREATE POLICY "%1$s_select"
        ON public.%1$I FOR SELECT TO authenticated
        USING (
          public.is_app_admin()
          OR EXISTS (
            SELECT 1 FROM public.user_permissions up
            WHERE up.user_id = auth.uid()
              AND up.module_key = 'hr'
              AND up.feature_key IN ('staff', 'lookups')
              AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
          )
        );
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "%1$s_admin_write"
        ON public.%1$I FOR ALL TO authenticated
        USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL))
        WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL));
    $f$, t);
  END LOOP;
END $$;

CREATE POLICY "hr_venue_settings_select"
  ON public.hr_venue_settings FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
  );

CREATE POLICY "hr_venue_settings_write"
  ON public.hr_venue_settings FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id));

-- ---------------------------------------------------------------------------
-- Seeds
-- ---------------------------------------------------------------------------
INSERT INTO public.civil_statuses (name, sort_order) VALUES
  ('Single', 1),
  ('Married', 2),
  ('Divorced', 3),
  ('Widowed', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.genders (name, sort_order) VALUES
  ('Male', 1),
  ('Female', 2)
ON CONFLICT (name) DO NOTHING;

-- Certification types mirror the previously hardcoded staff training fields.
INSERT INTO public.certification_types (name, renewal_months, lead_days, sort_order) VALUES
  ('OHC training', 12, 30, 1),
  ('PIC training', 12, 30, 2),
  ('Food safety', 12, 30, 3),
  ('Fire safety', 12, 30, 4),
  ('First aid', 24, 30, 5)
ON CONFLICT (name) DO NOTHING;
