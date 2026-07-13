-- SS Ops Hub — Users & Access v2
-- Adds: per-app role + suspend (user_module_access), access logging (access_events),
-- profile invite/login lifecycle fields, external (non-staff) users, and suspend-aware
-- RLS helpers. Additive & backwards compatible with the existing user_permissions model.

-- ---------------------------------------------------------------------------
-- 1. Profile lifecycle + login-email source + external flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS login_email_source TEXT
    CHECK (login_email_source IN ('work', 'personal', 'custom')),
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Per-app access: Layer 1 (enabled) + Layer 2 (role) + temporary suspend
--    One row per (user, venue, module). venue_id NULL = group-wide.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('global_admin', 'venue_admin', 'app_admin', 'editor', 'viewer')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id, module_key)
);

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_module_access_select_own" ON public.user_module_access;
CREATE POLICY "user_module_access_select_own"
  ON public.user_module_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_module_access_select_app_admin" ON public.user_module_access;
CREATE POLICY "user_module_access_select_app_admin"
  ON public.user_module_access FOR SELECT TO authenticated
  USING (public.is_app_admin());

-- Writes go through the service role (server actions); no authenticated write policy.

CREATE OR REPLACE FUNCTION public.user_module_access_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_module_access_set_updated_at ON public.user_module_access;
CREATE TRIGGER user_module_access_set_updated_at
  BEFORE UPDATE ON public.user_module_access
  FOR EACH ROW EXECUTE FUNCTION public.user_module_access_touch();

-- ---------------------------------------------------------------------------
-- 3. Access events — per-user app/page access log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  module_key TEXT,
  path TEXT,
  event_type TEXT NOT NULL DEFAULT 'module_access'
    CHECK (event_type IN ('login', 'logout', 'module_access', 'page_view')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_events_user_created_idx
  ON public.access_events (user_id, created_at DESC);

ALTER TABLE public.access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access_events_select_own" ON public.access_events;
CREATE POLICY "access_events_select_own"
  ON public.access_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "access_events_select_app_admin" ON public.access_events;
CREATE POLICY "access_events_select_app_admin"
  ON public.access_events FOR SELECT TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "access_events_insert_own" ON public.access_events;
CREATE POLICY "access_events_insert_own"
  ON public.access_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Suspend-aware permission helpers
--    A suspended (user, module, venue) blocks all feature access for that app.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_module_suspended(
  check_user_id UUID,
  p_module_key TEXT,
  p_venue_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_module_access uma
    WHERE uma.user_id = check_user_id
      AND uma.module_key = p_module_key
      AND uma.suspended = true
      AND (
        uma.venue_id IS NULL
        OR p_venue_id IS NULL
        OR uma.venue_id = p_venue_id
      )
  );
$$;

-- Entry-capable: submit OR any ladder level — unless suspended.
CREATE OR REPLACE FUNCTION public.has_feature_access(
  check_user_id UUID,
  p_module_key TEXT,
  p_feature_key TEXT,
  p_venue_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    NOT public.is_module_suspended(check_user_id, p_module_key, p_venue_id)
    AND (
      public.is_app_admin(check_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.user_permissions up
        WHERE up.user_id = check_user_id
          AND up.module_key = p_module_key
          AND up.feature_key = p_feature_key
          AND up.access_level IN ('submit', 'view', 'edit', 'admin')
          AND (
            up.venue_id IS NULL
            OR p_venue_id IS NULL
            OR up.venue_id = p_venue_id
          )
      )
    );
$$;

-- Submit-only grant — unless suspended.
CREATE OR REPLACE FUNCTION public.has_feature_submit_grant(
  check_user_id UUID,
  p_module_key TEXT,
  p_feature_key TEXT,
  p_venue_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    NOT public.is_module_suspended(check_user_id, p_module_key, p_venue_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = check_user_id
        AND up.module_key = p_module_key
        AND up.feature_key = p_feature_key
        AND up.access_level = 'submit'
        AND (
          up.venue_id IS NULL
          OR p_venue_id IS NULL
          OR up.venue_id = p_venue_id
        )
    );
$$;

-- Ladder check: view/edit/admin only — unless suspended.
CREATE OR REPLACE FUNCTION public.has_feature_permission(
  check_user_id UUID,
  p_module_key TEXT,
  p_feature_key TEXT,
  p_min_level TEXT,
  p_venue_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    NOT public.is_module_suspended(check_user_id, p_module_key, p_venue_id)
    AND (
      public.is_app_admin(check_user_id)
      OR (
        p_min_level IN ('view', 'edit', 'admin')
        AND EXISTS (
          SELECT 1
          FROM public.user_permissions up
          WHERE up.user_id = check_user_id
            AND up.module_key = p_module_key
            AND up.feature_key = p_feature_key
            AND public.access_level_rank(up.access_level) >= public.access_level_rank(p_min_level)
            AND (
              up.venue_id IS NULL
              OR p_venue_id IS NULL
              OR up.venue_id = p_venue_id
            )
        )
      )
    );
$$;
