-- Schedule boarding / offboarding notice emails for automatic send.

ALTER TABLE public.hr_boarding_emails
  DROP CONSTRAINT IF EXISTS hr_boarding_emails_status_check;

ALTER TABLE public.hr_boarding_emails
  ADD CONSTRAINT hr_boarding_emails_status_check
  CHECK (status IN ('draft', 'scheduled', 'sent'));

ALTER TABLE public.hr_boarding_emails
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS hr_boarding_emails_due_scheduled_idx
  ON public.hr_boarding_emails (scheduled_at)
  WHERE status = 'scheduled' AND scheduled_at IS NOT NULL;

COMMENT ON COLUMN public.hr_boarding_emails.scheduled_at IS
  'When status=scheduled, the time the email should be sent automatically.';
