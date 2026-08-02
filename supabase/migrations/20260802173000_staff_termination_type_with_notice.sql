-- Allow termination with notice alongside resignation / immediate termination.
ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_termination_type_check;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_termination_type_check
  CHECK (
    termination_type IS NULL
    OR termination_type IN (
      'resignation',
      'termination_with_notice',
      'termination'
    )
  );

COMMENT ON COLUMN public.staff.termination_type IS
  'How employment ended when termination_date is set: resignation | termination_with_notice | termination (immediate). Used by HR benefits and offboarding.';
