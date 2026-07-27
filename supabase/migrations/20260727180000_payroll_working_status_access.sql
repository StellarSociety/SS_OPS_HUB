-- Payroll run UI reads staff working status labels for the Status column.
-- Grant payroll view access to staff roster fields and working_statuses lookup.

DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select"
  ON public.staff FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', home_venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', home_venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', home_venue_id)
    OR (
      public.has_feature_submit_grant(auth.uid(), 'hr', 'staff', home_venue_id)
      AND created_by = auth.uid()
    )
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
        AND up.feature_key IN ('staff', 'schedules', 'lookups', 'payroll')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );
