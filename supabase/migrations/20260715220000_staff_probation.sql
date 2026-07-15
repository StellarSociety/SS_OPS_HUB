-- Contractual probation duration and outcome status on staff.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS probation_duration_value INTEGER,
  ADD COLUMN IF NOT EXISTS probation_duration_unit TEXT,
  ADD COLUMN IF NOT EXISTS probation_status TEXT;

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_probation_duration_unit_check;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_probation_duration_unit_check
  CHECK (
    probation_duration_unit IS NULL
    OR probation_duration_unit IN ('days', 'months')
  );

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_probation_status_check;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_probation_status_check
  CHECK (
    probation_status IS NULL
    OR probation_status IN ('Pending', 'Confirmed', 'Terminated', 'Expired')
  );

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_probation_duration_value_check;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_probation_duration_value_check
  CHECK (
    probation_duration_value IS NULL
    OR probation_duration_value > 0
  );
