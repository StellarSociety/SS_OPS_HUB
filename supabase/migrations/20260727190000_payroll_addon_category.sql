-- Allow Add-Ons category on payroll adjustments and generated pay lines.

ALTER TABLE public.hr_payroll_adjustments
  DROP CONSTRAINT IF EXISTS hr_payroll_adjustments_category_check;

ALTER TABLE public.hr_payroll_adjustments
  ADD CONSTRAINT hr_payroll_adjustments_category_check
  CHECK (category IN ('fixed', 'variable', 'deduction', 'addon'));

ALTER TABLE public.hr_payroll_lines
  DROP CONSTRAINT IF EXISTS hr_payroll_lines_category_check;

ALTER TABLE public.hr_payroll_lines
  ADD CONSTRAINT hr_payroll_lines_category_check
  CHECK (category IN ('fixed', 'variable', 'deduction', 'addon'));
