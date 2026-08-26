-- How later months of a benefit deduction are split:
-- each_run  = whoever is on that month’s benefit run
-- first_run = only the employees who were on the first month’s run

ALTER TABLE public.hr_benefit_deductions
  ADD COLUMN IF NOT EXISTS later_split_mode TEXT NOT NULL DEFAULT 'each_run';

ALTER TABLE public.hr_benefit_deductions
  DROP CONSTRAINT IF EXISTS hr_benefit_deductions_later_split_mode_check;

ALTER TABLE public.hr_benefit_deductions
  ADD CONSTRAINT hr_benefit_deductions_later_split_mode_check
  CHECK (later_split_mode IN ('each_run', 'first_run'));
