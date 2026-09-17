-- Venue Admin (`app` / `settings` / admin) must not bypass per-app grants.
-- Superuser remains Global Admin (`app` / `global`, plus legacy `admin`).
-- Hub-management tables still allow Venue Admin via is_hub_admin().

CREATE OR REPLACE FUNCTION public.is_app_admin(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions
    WHERE user_id = check_user_id
      AND module_key = 'app'
      AND feature_key IN ('global', 'admin')
      AND access_level = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_hub_admin(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions
    WHERE user_id = check_user_id
      AND module_key = 'app'
      AND feature_key IN ('global', 'admin', 'settings')
      AND access_level = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_hub_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS "profiles_select_app_admin" ON public.profiles;
CREATE POLICY "profiles_select_app_admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_hub_admin());

DROP POLICY IF EXISTS "user_permissions_select_app_admin" ON public.user_permissions;
CREATE POLICY "user_permissions_select_app_admin"
  ON public.user_permissions
  FOR SELECT
  TO authenticated
  USING (public.is_hub_admin());

DROP POLICY IF EXISTS "user_module_access_select_app_admin" ON public.user_module_access;
CREATE POLICY "user_module_access_select_app_admin"
  ON public.user_module_access
  FOR SELECT
  TO authenticated
  USING (public.is_hub_admin());

DROP POLICY IF EXISTS "audit_log_select_admins" ON public.audit_log;
CREATE POLICY "audit_log_select_admins"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_hub_admin());

DROP POLICY IF EXISTS "venue_modules_admin_write" ON public.venue_modules;
CREATE POLICY "venue_modules_admin_write"
  ON public.venue_modules
  FOR ALL
  TO authenticated
  USING (public.is_hub_admin())
  WITH CHECK (public.is_hub_admin());

DROP POLICY IF EXISTS "access_events_select_app_admin" ON public.access_events;
CREATE POLICY "access_events_select_app_admin"
  ON public.access_events
  FOR SELECT
  TO authenticated
  USING (public.is_hub_admin());

DROP POLICY IF EXISTS "user_online_sessions_select_app_admin" ON public.user_online_sessions;
CREATE POLICY "user_online_sessions_select_app_admin"
  ON public.user_online_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_hub_admin());
