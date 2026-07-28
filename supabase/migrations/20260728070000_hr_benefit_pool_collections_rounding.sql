-- Record rounding leftovers (floor-to-AED-5 remainders) alongside OS&E / activities.

ALTER TABLE public.hr_benefit_pool_collections
  ADD COLUMN IF NOT EXISTS rounding_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (rounding_amount >= 0);
