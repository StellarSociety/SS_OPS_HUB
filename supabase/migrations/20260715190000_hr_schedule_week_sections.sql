-- Weekly station/section boards per schedule department (kitchen|bar|floor).
-- Section names and staff placements are week-scoped; new weeks copy the prior week.

CREATE TABLE IF NOT EXISTS public.hr_schedule_week_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  department_key TEXT NOT NULL
    CHECK (department_key IN ('kitchen', 'bar', 'floor')),
  week_start DATE NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, department_key, week_start, name)
);

CREATE INDEX IF NOT EXISTS hr_schedule_week_sections_lookup_idx
  ON public.hr_schedule_week_sections (venue_id, department_key, week_start, sort_order);

ALTER TABLE public.hr_schedule_week_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_schedule_week_sections_select" ON public.hr_schedule_week_sections;
CREATE POLICY "hr_schedule_week_sections_select"
  ON public.hr_schedule_week_sections FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_week_sections_insert" ON public.hr_schedule_week_sections;
CREATE POLICY "hr_schedule_week_sections_insert"
  ON public.hr_schedule_week_sections FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_week_sections_update" ON public.hr_schedule_week_sections;
CREATE POLICY "hr_schedule_week_sections_update"
  ON public.hr_schedule_week_sections FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_week_sections_delete" ON public.hr_schedule_week_sections;
CREATE POLICY "hr_schedule_week_sections_delete"
  ON public.hr_schedule_week_sections FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

CREATE TABLE IF NOT EXISTS public.hr_schedule_section_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  department_key TEXT NOT NULL
    CHECK (department_key IN ('kitchen', 'bar', 'floor')),
  week_start DATE NOT NULL,
  section_id UUID NOT NULL
    REFERENCES public.hr_schedule_week_sections(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, department_key, week_start, staff_id)
);

CREATE INDEX IF NOT EXISTS hr_schedule_section_assignments_section_idx
  ON public.hr_schedule_section_assignments (section_id);

CREATE INDEX IF NOT EXISTS hr_schedule_section_assignments_lookup_idx
  ON public.hr_schedule_section_assignments (venue_id, department_key, week_start);

ALTER TABLE public.hr_schedule_section_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_schedule_section_assignments_select" ON public.hr_schedule_section_assignments;
CREATE POLICY "hr_schedule_section_assignments_select"
  ON public.hr_schedule_section_assignments FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_section_assignments_insert" ON public.hr_schedule_section_assignments;
CREATE POLICY "hr_schedule_section_assignments_insert"
  ON public.hr_schedule_section_assignments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_section_assignments_update" ON public.hr_schedule_section_assignments;
CREATE POLICY "hr_schedule_section_assignments_update"
  ON public.hr_schedule_section_assignments FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_section_assignments_delete" ON public.hr_schedule_section_assignments;
CREATE POLICY "hr_schedule_section_assignments_delete"
  ON public.hr_schedule_section_assignments FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );
