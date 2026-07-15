-- Default probation period: 6 months for all staff (still editable per person).
ALTER TABLE public.staff
  ALTER COLUMN probation_duration_value SET DEFAULT 6,
  ALTER COLUMN probation_duration_unit SET DEFAULT 'months';

UPDATE public.staff
SET
  probation_duration_value = 6,
  probation_duration_unit = 'months'
WHERE probation_duration_value IS NULL
   OR probation_duration_unit IS NULL;
