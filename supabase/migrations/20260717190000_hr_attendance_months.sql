-- Monthly attendance index for cheap coverage + month-scoped UI/fetches.
-- Source of truth remains hr_attendance_days / hr_attendance_punches.

-- ---------------------------------------------------------------------------
-- Import batch date spans (avoid paging all day rows for the import list)
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_attendance_import_batches
  ADD COLUMN IF NOT EXISTS min_work_date DATE,
  ADD COLUMN IF NOT EXISTS max_work_date DATE,
  ADD COLUMN IF NOT EXISTS distinct_day_count INT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Monthly index
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_attendance_months (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL
    CHECK (month_key ~ '^\d{4}-\d{2}$'),
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  employee_day_count INT NOT NULL DEFAULT 0,
  punch_count INT NOT NULL DEFAULT 0,
  distinct_emp_count INT NOT NULL DEFAULT 0,
  distinct_day_count INT NOT NULL DEFAULT 0,
  complete_count INT NOT NULL DEFAULT 0,
  missing_clock_in_count INT NOT NULL DEFAULT 0,
  missing_clock_out_count INT NOT NULL DEFAULT 0,
  incomplete_count INT NOT NULL DEFAULT 0,
  no_punches_count INT NOT NULL DEFAULT 0,
  pending_count INT NOT NULL DEFAULT 0,
  approved_count INT NOT NULL DEFAULT 0,
  rejected_count INT NOT NULL DEFAULT 0,
  flagged_count INT NOT NULL DEFAULT 0,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, month_key)
);

CREATE INDEX IF NOT EXISTS hr_attendance_months_venue_month_idx
  ON public.hr_attendance_months (venue_id, month_key DESC);

ALTER TABLE public.hr_attendance_months ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_attendance_months_select" ON public.hr_attendance_months;
CREATE POLICY "hr_attendance_months_select"
  ON public.hr_attendance_months FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_months_insert" ON public.hr_attendance_months;
CREATE POLICY "hr_attendance_months_insert"
  ON public.hr_attendance_months FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_months_update" ON public.hr_attendance_months;
CREATE POLICY "hr_attendance_months_update"
  ON public.hr_attendance_months FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_attendance_months_delete" ON public.hr_attendance_months;
CREATE POLICY "hr_attendance_months_delete"
  ON public.hr_attendance_months FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

COMMENT ON TABLE public.hr_attendance_months IS
  'Per-venue monthly rollup of attendance days/punches for fast coverage and month pickers.';

-- ---------------------------------------------------------------------------
-- Refresh one month from source tables
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_hr_attendance_month(
  p_venue_id UUID,
  p_month_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from DATE;
  v_to DATE;
  v_day RECORD;
  v_punch_count INT;
BEGIN
  IF p_month_key IS NULL OR p_month_key !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'month_key must be YYYY-MM';
  END IF;

  v_from := (p_month_key || '-01')::DATE;
  v_to := (v_from + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  SELECT
    COUNT(*)::INT AS employee_day_count,
    COUNT(DISTINCT emp_no)::INT AS distinct_emp_count,
    COUNT(DISTINCT work_date)::INT AS distinct_day_count,
    COUNT(*) FILTER (WHERE status = 'complete')::INT AS complete_count,
    COUNT(*) FILTER (WHERE status = 'missing_clock_in')::INT AS missing_clock_in_count,
    COUNT(*) FILTER (WHERE status = 'missing_clock_out')::INT AS missing_clock_out_count,
    COUNT(*) FILTER (WHERE status = 'incomplete')::INT AS incomplete_count,
    COUNT(*) FILTER (WHERE status = 'no_punches')::INT AS no_punches_count,
    COUNT(*) FILTER (WHERE approval_status = 'pending')::INT AS pending_count,
    COUNT(*) FILTER (WHERE approval_status = 'approved')::INT AS approved_count,
    COUNT(*) FILTER (WHERE approval_status = 'rejected')::INT AS rejected_count,
    COUNT(*) FILTER (WHERE approval_status = 'flagged')::INT AS flagged_count,
    MIN(work_date) AS min_work_date,
    MAX(work_date) AS max_work_date
  INTO v_day
  FROM public.hr_attendance_days
  WHERE venue_id = p_venue_id
    AND work_date >= v_from
    AND work_date <= v_to;

  IF COALESCE(v_day.employee_day_count, 0) = 0 THEN
    DELETE FROM public.hr_attendance_months
    WHERE venue_id = p_venue_id
      AND month_key = p_month_key;
    RETURN;
  END IF;

  SELECT COUNT(*)::INT
  INTO v_punch_count
  FROM public.hr_attendance_punches
  WHERE venue_id = p_venue_id
    AND work_date >= v_from
    AND work_date <= v_to;

  INSERT INTO public.hr_attendance_months (
    venue_id,
    month_key,
    from_date,
    to_date,
    employee_day_count,
    punch_count,
    distinct_emp_count,
    distinct_day_count,
    complete_count,
    missing_clock_in_count,
    missing_clock_out_count,
    incomplete_count,
    no_punches_count,
    pending_count,
    approved_count,
    rejected_count,
    flagged_count,
    refreshed_at
  )
  VALUES (
    p_venue_id,
    p_month_key,
    COALESCE(v_day.min_work_date, v_from),
    COALESCE(v_day.max_work_date, v_to),
    v_day.employee_day_count,
    COALESCE(v_punch_count, 0),
    v_day.distinct_emp_count,
    v_day.distinct_day_count,
    v_day.complete_count,
    v_day.missing_clock_in_count,
    v_day.missing_clock_out_count,
    v_day.incomplete_count,
    v_day.no_punches_count,
    v_day.pending_count,
    v_day.approved_count,
    v_day.rejected_count,
    v_day.flagged_count,
    now()
  )
  ON CONFLICT (venue_id, month_key) DO UPDATE SET
    from_date = EXCLUDED.from_date,
    to_date = EXCLUDED.to_date,
    employee_day_count = EXCLUDED.employee_day_count,
    punch_count = EXCLUDED.punch_count,
    distinct_emp_count = EXCLUDED.distinct_emp_count,
    distinct_day_count = EXCLUDED.distinct_day_count,
    complete_count = EXCLUDED.complete_count,
    missing_clock_in_count = EXCLUDED.missing_clock_in_count,
    missing_clock_out_count = EXCLUDED.missing_clock_out_count,
    incomplete_count = EXCLUDED.incomplete_count,
    no_punches_count = EXCLUDED.no_punches_count,
    pending_count = EXCLUDED.pending_count,
    approved_count = EXCLUDED.approved_count,
    rejected_count = EXCLUDED.rejected_count,
    flagged_count = EXCLUDED.flagged_count,
    refreshed_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_hr_attendance_month(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_hr_attendance_month(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_hr_attendance_month(UUID, TEXT) TO authenticated;

-- Refresh many months for a venue
CREATE OR REPLACE FUNCTION public.refresh_hr_attendance_months(
  p_venue_id UUID,
  p_month_keys TEXT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k TEXT;
BEGIN
  IF p_month_keys IS NULL THEN
    RETURN;
  END IF;
  FOREACH k IN ARRAY p_month_keys LOOP
    PERFORM public.refresh_hr_attendance_month(p_venue_id, k);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_hr_attendance_months(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_hr_attendance_months(UUID, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_hr_attendance_months(UUID, TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill batch date spans
-- ---------------------------------------------------------------------------
WITH batch_stats AS (
  SELECT
    import_batch_id,
    MIN(work_date) AS min_work_date,
    MAX(work_date) AS max_work_date,
    COUNT(DISTINCT work_date)::INT AS distinct_day_count
  FROM public.hr_attendance_days
  WHERE import_batch_id IS NOT NULL
  GROUP BY import_batch_id
)
UPDATE public.hr_attendance_import_batches b
SET
  min_work_date = s.min_work_date,
  max_work_date = s.max_work_date,
  distinct_day_count = s.distinct_day_count
FROM batch_stats s
WHERE b.id = s.import_batch_id;

-- ---------------------------------------------------------------------------
-- Backfill monthly index for all venues that have attendance
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT
      venue_id,
      to_char(work_date, 'YYYY-MM') AS month_key
    FROM public.hr_attendance_days
  LOOP
    PERFORM public.refresh_hr_attendance_month(r.venue_id, r.month_key);
  END LOOP;
END $$;
