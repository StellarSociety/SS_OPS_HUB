-- Assigned HR pages may SELECT staff identity (and the lookups those pages
-- need) without the Staff directory grant. `hr` / `staff` only opens the
-- directory pages; Validation / Leave / Schedules / Payroll / etc. still
-- join `staff` for names, emp numbers, and departments.

CREATE OR REPLACE FUNCTION public.has_hr_staff_row_access(
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
        AND up.module_key = 'hr'
        AND up.feature_key = ANY (ARRAY[
          'staff',
          'schedules',
          'payroll',
          'payslips',
          'benefits',
          'expenses',
          'overview',
          'leave',
          'attendance_validation',
          'attendance_validator',
          'attendance',
          'attendance_insights',
          'onboarding',
          'offboarding',
          'communications',
          'staff_compliance',
          'uniform',
          'assets',
          'insurance',
          'certifications',
          'visa'
        ]::text[])
        AND up.access_level IN ('view', 'edit', 'admin')
        AND (
          up.venue_id IS NULL
          OR p_venue_id IS NULL
          OR up.venue_id = p_venue_id
        )
    );
$$;

DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select"
  ON public.staff FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), home_venue_id)
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
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

DROP POLICY IF EXISTS "nationalities_select" ON public.nationalities;
CREATE POLICY "nationalities_select"
  ON public.nationalities FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

DROP POLICY IF EXISTS "departments_select" ON public.departments;
CREATE POLICY "departments_select"
  ON public.departments FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
  );

DROP POLICY IF EXISTS "positions_select" ON public.positions;
CREATE POLICY "positions_select"
  ON public.positions FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
  );

DROP POLICY IF EXISTS "working_statuses_select" ON public.working_statuses;
CREATE POLICY "working_statuses_select"
  ON public.working_statuses FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

DROP POLICY IF EXISTS "hr_venue_settings_select" ON public.hr_venue_settings;
CREATE POLICY "hr_venue_settings_select"
  ON public.hr_venue_settings FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_days_select" ON public.hr_schedule_days;
CREATE POLICY "hr_schedule_days_select"
  ON public.hr_schedule_days FOR SELECT TO authenticated
  USING (public.has_hr_staff_row_access(auth.uid(), venue_id));

DROP POLICY IF EXISTS "schedule_day_labels_select" ON public.schedule_day_labels;
CREATE POLICY "schedule_day_labels_select"
  ON public.schedule_day_labels FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

DROP POLICY IF EXISTS "hr_public_holidays_select" ON public.hr_public_holidays;
CREATE POLICY "hr_public_holidays_select"
  ON public.hr_public_holidays FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_days_select" ON public.hr_attendance_days;
CREATE POLICY "hr_attendance_days_select"
  ON public.hr_attendance_days FOR SELECT TO authenticated
  USING (public.has_hr_staff_row_access(auth.uid(), venue_id));

DROP POLICY IF EXISTS "hr_attendance_months_select" ON public.hr_attendance_months;
CREATE POLICY "hr_attendance_months_select"
  ON public.hr_attendance_months FOR SELECT TO authenticated
  USING (public.has_hr_staff_row_access(auth.uid(), venue_id));

DROP POLICY IF EXISTS "hr_shift_templates_select" ON public.hr_shift_templates;
CREATE POLICY "hr_shift_templates_select"
  ON public.hr_shift_templates FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_leave_balances_select" ON public.hr_leave_balances;
CREATE POLICY "hr_leave_balances_select"
  ON public.hr_leave_balances FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
  );
