-- SS Ops Hub — User & Access management: venue_modules, admin RLS, staff link

-- ---------------------------------------------------------------------------
-- Per-venue module toggles
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, module_key)
);

ALTER TABLE public.venue_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_modules_select_authenticated"
  ON public.venue_modules
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "venue_modules_admin_write"
  ON public.venue_modules
  FOR ALL
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- Seed: enable HR for all non-global venues
INSERT INTO public.venue_modules (venue_id, module_key, enabled)
SELECT v.id, 'hr', true
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id, module_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- One app user per staff record
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX profiles_staff_id_unique
  ON public.profiles (staff_id)
  WHERE staff_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Admin reads for user management (service writes stay service-only)
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles_select_app_admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

CREATE POLICY "user_permissions_select_app_admin"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- Link staff on invite via auth metadata
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  v_staff_id := NULLIF(NEW.raw_user_meta_data ->> 'staff_id', '')::UUID;

  INSERT INTO public.profiles (id, email, full_name, staff_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    v_staff_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    staff_id = COALESCE(EXCLUDED.staff_id, public.profiles.staff_id);

  RETURN NEW;
END;
$$;
