-- Flight ticket annual benefit: extend benefit kinds / allocation types.

ALTER TABLE public.hr_benefit_runs
  DROP CONSTRAINT IF EXISTS hr_benefit_runs_benefit_kind_check;

ALTER TABLE public.hr_benefit_runs
  ADD CONSTRAINT hr_benefit_runs_benefit_kind_check
  CHECK (benefit_kind IN ('gratuity', 'service_charge', 'flight_ticket'));

ALTER TABLE public.hr_benefit_allocations
  DROP CONSTRAINT IF EXISTS hr_benefit_allocations_benefit_type_check;

ALTER TABLE public.hr_benefit_allocations
  ADD CONSTRAINT hr_benefit_allocations_benefit_type_check
  CHECK (benefit_type IN (
    'tips',
    'service_charge',
    'compensation',
    'other',
    'flight_ticket'
  ));
