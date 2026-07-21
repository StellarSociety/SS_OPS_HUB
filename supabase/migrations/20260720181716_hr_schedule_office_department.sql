-- Allow schedule section boards for the Office department tab
-- (HR, accounts, cashier, and anyone not in kitchen/bar/floor).

ALTER TABLE public.hr_schedule_week_sections
  DROP CONSTRAINT IF EXISTS hr_schedule_week_sections_department_key_check;

ALTER TABLE public.hr_schedule_week_sections
  ADD CONSTRAINT hr_schedule_week_sections_department_key_check
  CHECK (department_key IN ('kitchen', 'bar', 'floor', 'office'));

ALTER TABLE public.hr_schedule_section_assignments
  DROP CONSTRAINT IF EXISTS hr_schedule_section_assignments_department_key_check;

ALTER TABLE public.hr_schedule_section_assignments
  ADD CONSTRAINT hr_schedule_section_assignments_department_key_check
  CHECK (department_key IN ('kitchen', 'bar', 'floor', 'office'));
