-- Scope schedule approval requests per department (kitchen/bar/floor/office)
-- so each department can be sent for approval and approved independently.

-- Drop week-wide unique pending index before expanding rows per department.
DROP INDEX IF EXISTS public.hr_schedule_approval_requests_one_pending;
DROP INDEX IF EXISTS public.hr_schedule_approval_requests_venue_week_idx;

-- Expand legacy week-wide rows into one row per department.
CREATE TEMP TABLE _hr_schedule_approval_legacy AS
SELECT * FROM public.hr_schedule_approval_requests;

DELETE FROM public.hr_schedule_approval_requests;

ALTER TABLE public.hr_schedule_approval_requests
  ADD COLUMN IF NOT EXISTS department_key TEXT;

INSERT INTO public.hr_schedule_approval_requests (
  id,
  venue_id,
  week_start,
  department_key,
  status,
  requested_by,
  requested_at,
  approver_user_ids,
  reviewed_by,
  reviewed_at,
  note,
  created_at,
  updated_at
)
SELECT
  CASE
    WHEN d.department_key = 'kitchen' THEN l.id
    ELSE gen_random_uuid()
  END,
  l.venue_id,
  l.week_start,
  d.department_key,
  l.status,
  l.requested_by,
  l.requested_at,
  l.approver_user_ids,
  l.reviewed_by,
  l.reviewed_at,
  l.note,
  l.created_at,
  l.updated_at
FROM _hr_schedule_approval_legacy l
CROSS JOIN (
  VALUES ('kitchen'), ('bar'), ('floor'), ('office')
) AS d(department_key);

DROP TABLE _hr_schedule_approval_legacy;

ALTER TABLE public.hr_schedule_approval_requests
  ALTER COLUMN department_key SET NOT NULL;

ALTER TABLE public.hr_schedule_approval_requests
  DROP CONSTRAINT IF EXISTS hr_schedule_approval_requests_department_key_check;

ALTER TABLE public.hr_schedule_approval_requests
  ADD CONSTRAINT hr_schedule_approval_requests_department_key_check
  CHECK (department_key IN ('kitchen', 'bar', 'floor', 'office'));

CREATE UNIQUE INDEX hr_schedule_approval_requests_one_pending
  ON public.hr_schedule_approval_requests (venue_id, week_start, department_key)
  WHERE status = 'pending';

CREATE INDEX hr_schedule_approval_requests_venue_week_idx
  ON public.hr_schedule_approval_requests (venue_id, week_start DESC, department_key);

COMMENT ON TABLE public.hr_schedule_approval_requests IS
  'Department + week-scoped schedule approval requests. Pending must be approved before PDF publish for that department.';

COMMENT ON COLUMN public.hr_schedule_approval_requests.department_key IS
  'Schedule department tab key: kitchen, bar, floor, or office.';
