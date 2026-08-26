-- Retain kept when a tip collector is not entitled to a payout
-- (e.g. terminated). Booked alongside OS&E / activities / rounding.

ALTER TABLE public.hr_benefit_pool_collections
  ADD COLUMN IF NOT EXISTS withheld_retain_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (withheld_retain_amount >= 0);
