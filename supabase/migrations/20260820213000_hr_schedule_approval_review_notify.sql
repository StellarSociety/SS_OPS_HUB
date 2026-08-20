-- Snapshot the roster at request time so the requester can be told which
-- cells changed, and allow an explicit rejected outcome (not just cancel).

ALTER TABLE public.hr_schedule_approval_requests
  ADD COLUMN IF NOT EXISTS submitted_roster JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.hr_schedule_approval_requests
  DROP CONSTRAINT IF EXISTS hr_schedule_approval_requests_status_check;

ALTER TABLE public.hr_schedule_approval_requests
  ADD CONSTRAINT hr_schedule_approval_requests_status_check
  CHECK (status IN ('pending', 'approved', 'cancelled', 'rejected'));
