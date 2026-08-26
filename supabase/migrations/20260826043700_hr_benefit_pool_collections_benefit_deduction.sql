-- Benefit deductions taken from staff payouts, booked alongside OS&E /
-- activities / rounding / withheld retain.

ALTER TABLE public.hr_benefit_pool_collections
  ADD COLUMN IF NOT EXISTS benefit_deduction_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (benefit_deduction_amount >= 0);
