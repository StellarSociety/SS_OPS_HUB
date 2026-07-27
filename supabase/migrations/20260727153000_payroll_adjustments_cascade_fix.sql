-- Adjustments must survive payroll recalculation (run employees are deleted/re-inserted).
ALTER TABLE public.hr_payroll_adjustments
  DROP CONSTRAINT IF EXISTS hr_payroll_adjustments_run_employee_id_fkey;

ALTER TABLE public.hr_payroll_adjustments
  ADD CONSTRAINT hr_payroll_adjustments_run_employee_id_fkey
  FOREIGN KEY (run_employee_id)
  REFERENCES public.hr_payroll_run_employees(id)
  ON DELETE SET NULL;

-- Recover manual adjustment rows for lines left without staging records after CASCADE deletes.
INSERT INTO public.hr_payroll_adjustments (
  venue_id,
  run_id,
  run_employee_id,
  staff_id,
  category,
  code,
  label,
  amount,
  reason,
  source
)
SELECT
  l.venue_id,
  l.run_id,
  l.run_employee_id,
  re.staff_id,
  l.category,
  l.code,
  l.label,
  l.amount,
  'Recovered from payroll line',
  'manual'
FROM public.hr_payroll_lines l
JOIN public.hr_payroll_run_employees re ON re.id = l.run_employee_id
WHERE l.source IN ('adjustment', 'manual')
  AND NOT EXISTS (
    SELECT 1
    FROM public.hr_payroll_adjustments a
    WHERE a.run_id = l.run_id
      AND a.staff_id = re.staff_id
      AND a.category = l.category
      AND a.code = l.code
      AND abs(a.amount - l.amount) < 0.01
  );
