-- Waiter daily sales: complimentary covers.
-- Guests the waiter served whose table was given away for free. They are part
-- of Total Covers (real guests, so reconciliation against the daily total is
-- unchanged) but are left out of the waiter's ASPH, so a comped table does not
-- pull the waiter's average spend per head down.
ALTER TABLE public.venue_waiter_daily_sales
  ADD COLUMN IF NOT EXISTS complimentary_covers integer NOT NULL DEFAULT 0;

ALTER TABLE public.venue_waiter_daily_sales
  DROP CONSTRAINT IF EXISTS venue_waiter_daily_sales_complimentary_covers_check;
ALTER TABLE public.venue_waiter_daily_sales
  ADD CONSTRAINT venue_waiter_daily_sales_complimentary_covers_check
  CHECK (complimentary_covers >= 0 AND complimentary_covers <= total_covers);

COMMENT ON COLUMN public.venue_waiter_daily_sales.complimentary_covers IS
  'Covers served on complimentary (free) tables; included in total_covers, excluded from ASPH.';

NOTIFY pgrst, 'reload schema';
