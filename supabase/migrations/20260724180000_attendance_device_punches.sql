-- Device sync ingest: ZKTeco (and similar) punches posted by the restaurant PC agent.
-- Source of truth for HR UI remains hr_attendance_punches / hr_attendance_days;
-- this table is the durable device ingest log with the agent contract shape.

CREATE TABLE IF NOT EXISTS public.attendance_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT,
  "timestamp" TIMESTAMPTZ NOT NULL,
  punch_type TEXT
    CHECK (punch_type IS NULL OR punch_type IN ('check_in', 'check_out')),
  device_serial TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue, employee_id, "timestamp")
);

CREATE INDEX IF NOT EXISTS attendance_punches_venue_ts_idx
  ON public.attendance_punches (venue, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS attendance_punches_venue_emp_idx
  ON public.attendance_punches (venue, employee_id, "timestamp" DESC);

ALTER TABLE public.attendance_punches ENABLE ROW LEVEL SECURITY;

-- Authenticated HR users can read ingest rows for venues they can view staff at.
DROP POLICY IF EXISTS "attendance_punches_select" ON public.attendance_punches;
CREATE POLICY "attendance_punches_select"
  ON public.attendance_punches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.venues v
      WHERE v.slug = attendance_punches.venue
        AND public.has_feature_permission(
          auth.uid(), 'hr', 'staff', 'view', v.id
        )
    )
  );

-- Writes go through the service-role API route only (no authenticated INSERT policy).

COMMENT ON TABLE public.attendance_punches IS
  'Raw punches from the ZKTeco device sync agent. UNIQUE(venue, employee_id, timestamp) dedupes retries.';

-- Allow device sync as a day source alongside file import / manual.
ALTER TABLE public.hr_attendance_days
  DROP CONSTRAINT IF EXISTS hr_attendance_days_source_check;

ALTER TABLE public.hr_attendance_days
  ADD CONSTRAINT hr_attendance_days_source_check
  CHECK (source IN ('manual', 'import', 'system', 'sync'));
