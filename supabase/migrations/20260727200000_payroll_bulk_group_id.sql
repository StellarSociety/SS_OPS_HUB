-- Group manual adjustments that were applied in bulk so they can be
-- edited / deleted together from the payroll run Employees tab.

ALTER TABLE public.hr_payroll_adjustments
  ADD COLUMN IF NOT EXISTS bulk_group_id UUID;

CREATE INDEX IF NOT EXISTS hr_payroll_adjustments_bulk_group_idx
  ON public.hr_payroll_adjustments (run_id, bulk_group_id)
  WHERE bulk_group_id IS NOT NULL;
