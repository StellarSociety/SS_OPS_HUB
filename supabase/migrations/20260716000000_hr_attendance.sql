-- HR attendance: fingerprint punch import → daily clock in/out + hours.
-- Joins roster on (venue_id, emp_no, work_date) for approvals.

-- ---------------------------------------------------------------------------
-- Import batches (one per Excel upload)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_attendance_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  filename TEXT,
  row_count INT NOT NULL DEFAULT 0,
  day_count INT NOT NULL DEFAULT 0,
  unmatched_emp_nos TEXT[] NOT NULL DEFAULT '{}',
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS hr_attendance_import_batches_venue_idx
  ON public.hr_attendance_import_batches (venue_id, imported_at DESC);

ALTER TABLE public.hr_attendance_import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_attendance_import_batches_select" ON public.hr_attendance_import_batches;
CREATE POLICY "hr_attendance_import_batches_select"
  ON public.hr_attendance_import_batches FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_import_batches_insert" ON public.hr_attendance_import_batches;
CREATE POLICY "hr_attendance_import_batches_insert"
  ON public.hr_attendance_import_batches FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Raw punches (audit / reprocess when import rules change)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_attendance_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES public.hr_attendance_import_batches(id) ON DELETE SET NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  emp_no TEXT NOT NULL,
  punch_at TIMESTAMPTZ NOT NULL,
  work_date DATE NOT NULL,
  device_name TEXT,
  department_name TEXT,
  location_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, emp_no, punch_at)
);

CREATE INDEX IF NOT EXISTS hr_attendance_punches_venue_date_idx
  ON public.hr_attendance_punches (venue_id, work_date);

CREATE INDEX IF NOT EXISTS hr_attendance_punches_emp_date_idx
  ON public.hr_attendance_punches (venue_id, emp_no, work_date);

CREATE INDEX IF NOT EXISTS hr_attendance_punches_staff_date_idx
  ON public.hr_attendance_punches (staff_id, work_date);

ALTER TABLE public.hr_attendance_punches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_attendance_punches_select" ON public.hr_attendance_punches;
CREATE POLICY "hr_attendance_punches_select"
  ON public.hr_attendance_punches FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_punches_insert" ON public.hr_attendance_punches;
CREATE POLICY "hr_attendance_punches_insert"
  ON public.hr_attendance_punches FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_punches_delete" ON public.hr_attendance_punches;
CREATE POLICY "hr_attendance_punches_delete"
  ON public.hr_attendance_punches FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Daily attendance (one row per employee per work day)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_attendance_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  emp_no TEXT NOT NULL,
  work_date DATE NOT NULL,
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  total_hours NUMERIC(6, 2),
  punch_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'complete'
    CHECK (status IN (
      'complete',
      'missing_clock_in',
      'missing_clock_out',
      'incomplete',
      'no_punches'
    )),
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'flagged')),
  import_batch_id UUID REFERENCES public.hr_attendance_import_batches(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'import'
    CHECK (source IN ('manual', 'import', 'system')),
  notes TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, emp_no, work_date)
);

CREATE INDEX IF NOT EXISTS hr_attendance_days_venue_date_idx
  ON public.hr_attendance_days (venue_id, work_date);

CREATE INDEX IF NOT EXISTS hr_attendance_days_staff_date_idx
  ON public.hr_attendance_days (staff_id, work_date);

CREATE INDEX IF NOT EXISTS hr_attendance_days_status_idx
  ON public.hr_attendance_days (venue_id, status);

CREATE INDEX IF NOT EXISTS hr_attendance_days_approval_idx
  ON public.hr_attendance_days (venue_id, approval_status);

ALTER TABLE public.hr_attendance_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_attendance_days_select" ON public.hr_attendance_days;
CREATE POLICY "hr_attendance_days_select"
  ON public.hr_attendance_days FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_days_insert" ON public.hr_attendance_days;
CREATE POLICY "hr_attendance_days_insert"
  ON public.hr_attendance_days FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_days_update" ON public.hr_attendance_days;
CREATE POLICY "hr_attendance_days_update"
  ON public.hr_attendance_days FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_days_delete" ON public.hr_attendance_days;
CREATE POLICY "hr_attendance_days_delete"
  ON public.hr_attendance_days FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

COMMENT ON TABLE public.hr_attendance_days IS
  'Per-employee per work-day attendance from fingerprint import. Joins roster on (venue_id, emp_no, work_date).';
