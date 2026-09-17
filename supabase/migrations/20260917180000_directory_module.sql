-- Directory module: people directory (staff contacts + celebrations).
-- Unlock the app globally and enable it for every venue-scoped venue.
-- Directory grants may SELECT staff identity/contact fields without hr/staff.

UPDATE public.app_module_states
SET state = 'live',
    updated_at = now()
WHERE module_key = 'directory';

INSERT INTO public.app_module_states (module_key, state)
VALUES ('directory', 'live')
ON CONFLICT (module_key) DO UPDATE
SET state = 'live',
    updated_at = now();

INSERT INTO public.venue_modules (venue_id, module_key, enabled)
SELECT v.id, 'directory', true
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id, module_key) DO UPDATE SET enabled = true;

CREATE OR REPLACE FUNCTION public.has_directory_staff_row_access(
  check_user_id UUID,
  p_venue_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_app_admin(check_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = check_user_id
        AND up.module_key = 'directory'
        AND up.feature_key = ANY (ARRAY['staff', 'celebrations']::text[])
        AND up.access_level IN ('view', 'edit', 'admin')
        AND (
          up.venue_id IS NULL
          OR p_venue_id IS NULL
          OR up.venue_id = p_venue_id
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_directory_staff_row_access(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select"
  ON public.staff FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), home_venue_id)
    OR public.has_directory_staff_row_access(auth.uid(), home_venue_id)
    OR (
      public.has_feature_submit_grant(auth.uid(), 'hr', 'staff', home_venue_id)
      AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "employment_statuses_select" ON public.employment_statuses;
CREATE POLICY "employment_statuses_select"
  ON public.employment_statuses FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), NULL)
    OR public.has_directory_staff_row_access(auth.uid(), NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

DROP POLICY IF EXISTS "nationalities_select" ON public.nationalities;
CREATE POLICY "nationalities_select"
  ON public.nationalities FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), NULL)
    OR public.has_directory_staff_row_access(auth.uid(), NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

DROP POLICY IF EXISTS "departments_select" ON public.departments;
CREATE POLICY "departments_select"
  ON public.departments FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), venue_id)
    OR public.has_directory_staff_row_access(auth.uid(), venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
  );

DROP POLICY IF EXISTS "positions_select" ON public.positions;
CREATE POLICY "positions_select"
  ON public.positions FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), venue_id)
    OR public.has_directory_staff_row_access(auth.uid(), venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
  );
