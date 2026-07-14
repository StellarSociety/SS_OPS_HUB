-- HR schedules: Employee ID–centric planned days for roster creation.
-- Future attendance / leave modules join on (venue_id, emp_no, work_date).
-- Also idempotently ensures working_statuses + schedule_day_labels exist.

-- ---------------------------------------------------------------------------
-- Lookups: working_statuses (+ staff FK)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.working_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.working_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "working_statuses_select" ON public.working_statuses;
CREATE POLICY "working_statuses_select"
  ON public.working_statuses FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('staff', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

DROP POLICY IF EXISTS "working_statuses_admin_write" ON public.working_statuses;
CREATE POLICY "working_statuses_admin_write"
  ON public.working_statuses FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL));

INSERT INTO public.working_statuses (name, sort_order) VALUES
  ('Active', 1),
  ('Paid Leave', 2),
  ('Unpaid Leave', 3),
  ('OFF-Boarding', 4)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS working_status_id UUID
    REFERENCES public.working_statuses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS staff_working_status_idx
  ON public.staff (working_status_id);

UPDATE public.staff s
SET working_status_id = ws.id
FROM public.working_statuses ws
WHERE ws.name = 'Active'
  AND s.working_status_id IS NULL;

-- ---------------------------------------------------------------------------
-- Lookups: schedule_day_labels
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedule_day_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL,
  name TEXT NOT NULL,
  bg_color TEXT NOT NULL DEFAULT '#e5e5e5',
  text_color TEXT NOT NULL DEFAULT '#404040',
  border_color TEXT NOT NULL DEFAULT '#d4d4d4',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_day_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_day_labels_select" ON public.schedule_day_labels;
CREATE POLICY "schedule_day_labels_select"
  ON public.schedule_day_labels FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('staff', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

DROP POLICY IF EXISTS "schedule_day_labels_admin_write" ON public.schedule_day_labels;
CREATE POLICY "schedule_day_labels_admin_write"
  ON public.schedule_day_labels FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL));

INSERT INTO public.schedule_day_labels
  (code, abbreviation, name, bg_color, text_color, border_color, sort_order)
VALUES
  ('SHIFT', 'Shift', 'Working shift', '#d1fae5', '#065f46', '#a7f3d0', 1),
  ('OFF', 'Off', 'Day off', '#e5e5e5', '#404040', '#d4d4d4', 2),
  ('AL', 'AL', 'Annual leave', '#e0f2fe', '#075985', '#bae6fd', 3),
  ('PH', 'PH', 'Public holiday', '#ede9fe', '#5b21b6', '#ddd6fe', 4),
  ('SL', 'SL', 'Sick leave', '#ffedd5', '#9a3412', '#fed7aa', 5),
  ('UPL', 'UPL', 'Unpaid leave', '#fef3c7', '#78350f', '#fde68a', 6),
  ('ABS', 'ABS', 'Absence', '#ffe4e6', '#9f1239', '#fecdd3', 7),
  ('ML', 'ML', 'Maternal leave', '#fae8ff', '#86198f', '#f5d0fe', 8),
  ('PL', 'PL', 'Parental leave', '#e0e7ff', '#3730a3', '#c7d2fe', 9),
  ('BL', 'BL', 'Bereavement leave', '#e7e5e4', '#44403c', '#d6d3d1', 10)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Planned schedule days (Employee ID–centric)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_schedule_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  emp_no TEXT NOT NULL,
  work_date DATE NOT NULL,
  label_code TEXT NOT NULL REFERENCES public.schedule_day_labels(code),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'import', 'system')),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, work_date),
  UNIQUE (venue_id, emp_no, work_date)
);

CREATE INDEX IF NOT EXISTS hr_schedule_days_venue_date_idx
  ON public.hr_schedule_days (venue_id, work_date);

CREATE INDEX IF NOT EXISTS hr_schedule_days_emp_date_idx
  ON public.hr_schedule_days (emp_no, work_date);

CREATE INDEX IF NOT EXISTS hr_schedule_days_label_idx
  ON public.hr_schedule_days (label_code);

CREATE INDEX IF NOT EXISTS hr_schedule_days_staff_date_idx
  ON public.hr_schedule_days (staff_id, work_date);

-- Keep emp_no (+ optional department snapshot) in sync with staff.
CREATE OR REPLACE FUNCTION public.hr_schedule_days_sync_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  s RECORD;
BEGIN
  SELECT id, emp_no, home_venue_id, department_id
  INTO s
  FROM public.staff
  WHERE id = NEW.staff_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'staff_id % not found', NEW.staff_id;
  END IF;

  NEW.emp_no := s.emp_no;
  NEW.venue_id := COALESCE(NEW.venue_id, s.home_venue_id);
  IF NEW.department_id IS NULL THEN
    NEW.department_id := s.department_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hr_schedule_days_sync_employee_trg ON public.hr_schedule_days;
CREATE TRIGGER hr_schedule_days_sync_employee_trg
  BEFORE INSERT OR UPDATE OF staff_id ON public.hr_schedule_days
  FOR EACH ROW
  EXECUTE FUNCTION public.hr_schedule_days_sync_employee();

ALTER TABLE public.hr_schedule_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_schedule_days_select" ON public.hr_schedule_days;
CREATE POLICY "hr_schedule_days_select"
  ON public.hr_schedule_days FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_days_insert" ON public.hr_schedule_days;
CREATE POLICY "hr_schedule_days_insert"
  ON public.hr_schedule_days FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_days_update" ON public.hr_schedule_days;
CREATE POLICY "hr_schedule_days_update"
  ON public.hr_schedule_days FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_schedule_days_delete" ON public.hr_schedule_days;
CREATE POLICY "hr_schedule_days_delete"
  ON public.hr_schedule_days FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- Migrate draft staff_schedule_days (if present) then drop it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff_schedule_days'
  ) THEN
    INSERT INTO public.hr_schedule_days (
      venue_id,
      staff_id,
      emp_no,
      work_date,
      label_code,
      department_id,
      source,
      updated_by,
      created_at,
      updated_at
    )
    SELECT
      d.venue_id,
      d.staff_id,
      s.emp_no,
      d.work_date,
      CASE WHEN d.label_code = 'LP' THEN 'AL' ELSE d.label_code END,
      s.department_id,
      'manual',
      d.updated_by,
      d.created_at,
      d.updated_at
    FROM public.staff_schedule_days d
    JOIN public.staff s ON s.id = d.staff_id
    WHERE EXISTS (
      SELECT 1 FROM public.schedule_day_labels l
      WHERE l.code = CASE WHEN d.label_code = 'LP' THEN 'AL' ELSE d.label_code END
    )
    ON CONFLICT (staff_id, work_date) DO NOTHING;

    DROP TABLE public.staff_schedule_days;
  END IF;
END $$;
