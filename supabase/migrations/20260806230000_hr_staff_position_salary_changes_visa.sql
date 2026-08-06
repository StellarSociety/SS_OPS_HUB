-- Optional visa status / expiry on employment-path alterations.

ALTER TABLE public.hr_staff_position_salary_changes
  DROP CONSTRAINT IF EXISTS hr_staff_position_salary_changes_change_kind_check;

ALTER TABLE public.hr_staff_position_salary_changes
  ADD CONSTRAINT hr_staff_position_salary_changes_change_kind_check
  CHECK (change_kind IN ('position', 'salary', 'both', 'visa'));

ALTER TABLE public.hr_staff_position_salary_changes
  ADD COLUMN IF NOT EXISTS change_visa BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS from_visa_status TEXT,
  ADD COLUMN IF NOT EXISTS to_visa_status TEXT,
  ADD COLUMN IF NOT EXISTS from_visa_expiry DATE,
  ADD COLUMN IF NOT EXISTS to_visa_expiry DATE;

NOTIFY pgrst, 'reload schema';
