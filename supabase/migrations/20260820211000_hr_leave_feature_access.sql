-- Leave grant (`hr` / `leave`) must be able to read the roster, leave
-- balances, and labels used on Leave pages — without requiring Staff directory.

DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select"
  ON public.staff FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', home_venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', home_venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', home_venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'overview', home_venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'leave', home_venue_id)
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
    OR public.has_feature_access(auth.uid(), 'hr', 'leave', NULL)
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
    OR public.has_feature_access(auth.uid(), 'hr', 'leave', NULL)
  );

DROP POLICY IF EXISTS "departments_select" ON public.departments;
CREATE POLICY "departments_select"
  ON public.departments FOR SELECT TO authenticated
  USING (
    public.has_feature_access(auth.uid(), 'hr', 'staff', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'schedules', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'overview', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'leave', venue_id)
  );

DROP POLICY IF EXISTS "positions_select" ON public.positions;
CREATE POLICY "positions_select"
  ON public.positions FOR SELECT TO authenticated
  USING (
    public.has_feature_access(auth.uid(), 'hr', 'staff', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'schedules', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'overview', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'leave', venue_id)
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
        AND up.feature_key IN (
          'staff', 'schedules', 'lookups', 'payroll', 'overview', 'leave'
        )
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

DROP POLICY IF EXISTS "hr_leave_balances_select" ON public.hr_leave_balances;
CREATE POLICY "hr_leave_balances_select"
  ON public.hr_leave_balances FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'leave', venue_id)
  );

DROP POLICY IF EXISTS "hr_leave_balance_adjustments_select"
  ON public.hr_leave_balance_adjustments;
CREATE POLICY "hr_leave_balance_adjustments_select"
  ON public.hr_leave_balance_adjustments FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'leave', venue_id)
  );

DROP POLICY IF EXISTS "hr_venue_settings_select" ON public.hr_venue_settings;
CREATE POLICY "hr_venue_settings_select"
  ON public.hr_venue_settings FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'leave', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_days_select" ON public.hr_schedule_days;
CREATE POLICY "hr_schedule_days_select"
  ON public.hr_schedule_days FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'leave', venue_id)
  );

DROP POLICY IF EXISTS "schedule_day_labels_select" ON public.schedule_day_labels;
CREATE POLICY "schedule_day_labels_select"
  ON public.schedule_day_labels FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('staff', 'schedules', 'lookups', 'leave')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

DROP POLICY IF EXISTS "hr_public_holidays_select" ON public.hr_public_holidays;
CREATE POLICY "hr_public_holidays_select"
  ON public.hr_public_holidays FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'leave', venue_id)
  );
