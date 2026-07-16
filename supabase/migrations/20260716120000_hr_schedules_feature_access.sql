-- Decouple Schedules from Staff directory.
-- Grantable feature key `hr` / `schedules` must unlock schedule tables, roster
-- staff SELECT (names/ids only needed for roster), and related lookups —
-- without requiring `hr` / `staff` (Staff directory / Staff Details).

-- ---------------------------------------------------------------------------
-- Staff roster read for schedules users (no write path via schedules)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_select" ON public.staff;
CREATE POLICY "staff_select"
  ON public.staff FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', home_venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', home_venue_id)
    OR (
      public.has_feature_submit_grant(auth.uid(), 'hr', 'staff', home_venue_id)
      AND created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Lookups needed to render the roster (dept / position / status labels)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "employment_statuses_select" ON public.employment_statuses;
CREATE POLICY "employment_statuses_select"
  ON public.employment_statuses FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_access(auth.uid(), 'hr', 'staff', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'schedules', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

DROP POLICY IF EXISTS "nationalities_select" ON public.nationalities;
CREATE POLICY "nationalities_select"
  ON public.nationalities FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_access(auth.uid(), 'hr', 'staff', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'schedules', NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

DROP POLICY IF EXISTS "departments_select" ON public.departments;
CREATE POLICY "departments_select"
  ON public.departments FOR SELECT TO authenticated
  USING (
    public.has_feature_access(auth.uid(), 'hr', 'staff', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'schedules', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
  );

DROP POLICY IF EXISTS "positions_select" ON public.positions;
CREATE POLICY "positions_select"
  ON public.positions FOR SELECT TO authenticated
  USING (
    public.has_feature_access(auth.uid(), 'hr', 'staff', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'schedules', venue_id)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', venue_id)
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
        AND up.feature_key IN ('staff', 'schedules', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
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
        AND up.feature_key IN ('staff', 'schedules', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

DROP POLICY IF EXISTS "hr_shift_templates_select" ON public.hr_shift_templates;
CREATE POLICY "hr_shift_templates_select"
  ON public.hr_shift_templates FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Schedule tables: staff OR schedules
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hr_schedule_days_select" ON public.hr_schedule_days;
CREATE POLICY "hr_schedule_days_select"
  ON public.hr_schedule_days FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_days_insert" ON public.hr_schedule_days;
CREATE POLICY "hr_schedule_days_insert"
  ON public.hr_schedule_days FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_days_update" ON public.hr_schedule_days;
CREATE POLICY "hr_schedule_days_update"
  ON public.hr_schedule_days FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_days_delete" ON public.hr_schedule_days;
CREATE POLICY "hr_schedule_days_delete"
  ON public.hr_schedule_days FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_week_sections_select" ON public.hr_schedule_week_sections;
CREATE POLICY "hr_schedule_week_sections_select"
  ON public.hr_schedule_week_sections FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_week_sections_insert" ON public.hr_schedule_week_sections;
CREATE POLICY "hr_schedule_week_sections_insert"
  ON public.hr_schedule_week_sections FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_week_sections_update" ON public.hr_schedule_week_sections;
CREATE POLICY "hr_schedule_week_sections_update"
  ON public.hr_schedule_week_sections FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_week_sections_delete" ON public.hr_schedule_week_sections;
CREATE POLICY "hr_schedule_week_sections_delete"
  ON public.hr_schedule_week_sections FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_section_assignments_select" ON public.hr_schedule_section_assignments;
CREATE POLICY "hr_schedule_section_assignments_select"
  ON public.hr_schedule_section_assignments FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_section_assignments_insert" ON public.hr_schedule_section_assignments;
CREATE POLICY "hr_schedule_section_assignments_insert"
  ON public.hr_schedule_section_assignments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_section_assignments_update" ON public.hr_schedule_section_assignments;
CREATE POLICY "hr_schedule_section_assignments_update"
  ON public.hr_schedule_section_assignments FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_section_assignments_delete" ON public.hr_schedule_section_assignments;
CREATE POLICY "hr_schedule_section_assignments_delete"
  ON public.hr_schedule_section_assignments FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
  );

-- Legacy draft table (may already be dropped); keep policies in sync if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff_schedule_days'
  ) THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "staff_schedule_days_select" ON public.staff_schedule_days;
      CREATE POLICY "staff_schedule_days_select"
        ON public.staff_schedule_days FOR SELECT TO authenticated
        USING (
          public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
          OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
        );
      DROP POLICY IF EXISTS "staff_schedule_days_insert" ON public.staff_schedule_days;
      CREATE POLICY "staff_schedule_days_insert"
        ON public.staff_schedule_days FOR INSERT TO authenticated
        WITH CHECK (
          public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
          OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
        );
      DROP POLICY IF EXISTS "staff_schedule_days_update" ON public.staff_schedule_days;
      CREATE POLICY "staff_schedule_days_update"
        ON public.staff_schedule_days FOR UPDATE TO authenticated
        USING (
          public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
          OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
        )
        WITH CHECK (
          public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
          OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
        );
      DROP POLICY IF EXISTS "staff_schedule_days_delete" ON public.staff_schedule_days;
      CREATE POLICY "staff_schedule_days_delete"
        ON public.staff_schedule_days FOR DELETE TO authenticated
        USING (
          public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
          OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'edit', venue_id)
        );
    $p$;
  END IF;
END $$;

-- Venue settings (e.g. attendance timezone for punch overlay)
DROP POLICY IF EXISTS "hr_venue_settings_select" ON public.hr_venue_settings;
CREATE POLICY "hr_venue_settings_select"
  ON public.hr_venue_settings FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Read-only punch overlay on the schedules grid
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hr_attendance_punches_select" ON public.hr_attendance_punches;
CREATE POLICY "hr_attendance_punches_select"
  ON public.hr_attendance_punches FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_days_select" ON public.hr_attendance_days;
CREATE POLICY "hr_attendance_days_select"
  ON public.hr_attendance_days FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
  );
