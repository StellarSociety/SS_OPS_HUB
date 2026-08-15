-- Count of acknowledgement reminder emails sent for a pending record.

ALTER TABLE public.hr_email_acknowledgements
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.hr_email_acknowledgements
  DROP CONSTRAINT IF EXISTS hr_email_acknowledgements_reminder_count_check;

ALTER TABLE public.hr_email_acknowledgements
  ADD CONSTRAINT hr_email_acknowledgements_reminder_count_check
  CHECK (reminder_count >= 0);

COMMENT ON COLUMN public.hr_email_acknowledgements.reminder_count IS
  'How many reminder emails have been sent while the acknowledgement is still pending.';
