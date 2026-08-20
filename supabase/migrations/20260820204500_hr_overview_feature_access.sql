-- Overview grant (`hr` / `overview`) must be able to read the staff roster and
-- lookup labels used by the HR dashboard — without requiring Staff directory.

DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select"
  ON public.staff FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', home_venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', home_venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', home_venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'overview', home_venue_id)
    OR (
      public.has_feature_submit_grant(auth.uid(), 'hr', 'staff', home_venue_id)
      AND created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "employment_statuses_select" ON public.employment_statuses;
CREATE POLICY "employment_statuses_select"
  ON public.employment_statuses FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_access(auth.uid(), 'hr', 'staff', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'schedules', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'overview', NULL)
  );

DROP POLICY IF EXISTS "nationalities_select" ON public.nationalities;
CREATE POLICY "nationalities_select"
  ON public.nationalities FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_access(auth.uid(), 'hr', 'staff', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'schedules', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'overview', NULL)
  );

DROP POLICY IF EXISTS "departments_select" ON public.departments;
CREATE POLICY "departments_select"
  ON public.departments FOR SELECT TO authenticated
  USING (
    public.has_feature_access(auth.uid(), 'hr', 'staff', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'schedules', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'overview', venue_id)
  );

DROP POLICY IF EXISTS "positions_select" ON public.positions;
CREATE POLICY "positions_select"
  ON public.positions FOR SELECT TO authenticated
  USING (
    public.has_feature_access(auth.uid(), 'hr', 'staff', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'schedules', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'overview', venue_id)
  );

DROP POLICY IF EXISTS "working_statuses_select" ON public.working_statuses;
CREATE POLICY "working_statuses_select"
  ON public.working_statuses FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('staff', 'schedules', 'lookups', 'payroll', 'overview')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );
