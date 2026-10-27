-- Benefit deductions can also be taken from payroll (salary). A payroll
-- deduction is split once into per-person pending payroll charges
-- (hr_pending_payroll_deductions, source 'benefit_deduction').

ALTER TABLE public.hr_benefit_deductions
  DROP CONSTRAINT IF EXISTS hr_benefit_deductions_benefit_kind_check;

ALTER TABLE public.hr_benefit_deductions
  ADD CONSTRAINT hr_benefit_deductions_benefit_kind_check
  CHECK (benefit_kind IN ('gratuity', 'service_charge', 'payroll'));
