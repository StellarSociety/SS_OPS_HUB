-- Expand boarding / offboarding email actions for later checklist stages.

ALTER TABLE public.hr_boarding_emails
  DROP CONSTRAINT IF EXISTS hr_boarding_emails_action_check;

ALTER TABLE public.hr_boarding_emails
  ADD CONSTRAINT hr_boarding_emails_action_check
  CHECK (
    action IN (
      'resignation_confirm',
      'termination_notice',
      'handover',
      'accommodation_employee',
      'accommodation_management',
      'cancel_visa',
      'cancel_insurance',
      'accounts_payment',
      'goodbye'
    )
  );
