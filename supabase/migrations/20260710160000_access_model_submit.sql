-- Fix submit access semantics: submit is entry-capable, separate from view/edit/admin ladder.

-- Ladder rank: view < edit < admin (submit is not on this ladder).
CREATE OR REPLACE FUNCTION public.access_level_rank(level TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE level
    WHEN 'view' THEN 1
    WHEN 'edit' THEN 2
    WHEN 'admin' THEN 3
    ELSE 0
  END;
$$;

-- Entry-capable: submit OR any ladder level.
CREATE OR REPLACE FUNCTION public.has_feature_access(
  check_user_id UUID,
  p_module_key TEXT,
  p_feature_key TEXT,
  p_venue_id UUID DEFAULT NULL
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
        AND up.module_key = p_module_key
        AND up.feature_key = p_feature_key
        AND up.access_level IN ('submit', 'view', 'edit', 'admin')
        AND (
          up.venue_id IS NULL
          OR p_venue_id IS NULL
          OR up.venue_id = p_venue_id
        )
    );
$$;

-- Submit-only grant (create + read/edit own rows).
CREATE OR REPLACE FUNCTION public.has_feature_submit_grant(
  check_user_id UUID,
  p_module_key TEXT,
  p_feature_key TEXT,
  p_venue_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
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

-- Ladder check: view/edit/admin only. Submit never satisfies a min_level gate.
CREATE OR REPLACE FUNCTION public.has_feature_permission(
  check_user_id UUID,
  p_module_key TEXT,
  p_feature_key TEXT,
  p_min_level TEXT,
  p_venue_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
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
    );
$$;

-- Global lookups: entry-capable hr/staff or hr/lookups grants.
DROP POLICY IF EXISTS "employment_statuses_select" ON public.employment_statuses;
CREATE POLICY "employment_statuses_select"
  ON public.employment_statuses FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_access(auth.uid(), 'hr', 'staff', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

DROP POLICY IF EXISTS "nationalities_select" ON public.nationalities;
CREATE POLICY "nationalities_select"
  ON public.nationalities FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_access(auth.uid(), 'hr', 'staff', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

-- Venue lookups: entry-capable staff or lookups grants.
DROP POLICY IF EXISTS "departments_select" ON public.departments;
CREATE POLICY "departments_select"
  ON public.departments FOR SELECT TO authenticated
  USING (
    public.has_feature_access(auth.uid(), 'hr', 'staff', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
  );

DROP POLICY IF EXISTS "positions_select" ON public.positions;
CREATE POLICY "positions_select"
  ON public.positions FOR SELECT TO authenticated
  USING (
    public.has_feature_access(auth.uid(), 'hr', 'staff', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
  );

-- Staff: ladder grants see all rows; submit-only sees/edits own rows.
DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select"
  ON public.staff FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', home_venue_id)
    OR (
      public.has_feature_submit_grant(auth.uid(), 'hr', 'staff', home_venue_id)
      AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "staff_insert" ON public.staff;
CREATE POLICY "staff_insert"
  ON public.staff FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', home_venue_id)
    OR (
      public.has_feature_submit_grant(auth.uid(), 'hr', 'staff', home_venue_id)
      AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "staff_update" ON public.staff;
CREATE POLICY "staff_update"
  ON public.staff FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', home_venue_id)
    OR (
      public.has_feature_submit_grant(auth.uid(), 'hr', 'staff', home_venue_id)
      AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', home_venue_id)
    OR (
      public.has_feature_submit_grant(auth.uid(), 'hr', 'staff', home_venue_id)
      AND created_by = auth.uid()
    )
  );
