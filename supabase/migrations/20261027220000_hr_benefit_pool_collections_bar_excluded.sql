-- Bar tips left out of a gratuity run's distribution (unticked on the run
-- page), booked alongside OS&E / activities / rounding / withheld retain.

ALTER TABLE public.hr_benefit_pool_collections
  ADD COLUMN IF NOT EXISTS bar_excluded_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (bar_excluded_amount >= 0);
