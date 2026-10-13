-- Daily sales: complimentary covers per service.
-- Guests served on tables given away for free. They are part of the service's
-- Total Covers (lunch_covers / dinner_covers) but left out of ASPH, matching
-- waiter sales (venue_waiter_daily_sales.complimentary_covers), and they are
-- reconciled against the waiters' complimentary covers.
ALTER TABLE public.venue_daily_sales
  ADD COLUMN IF NOT EXISTS lunch_complimentary_covers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dinner_complimentary_covers integer NOT NULL DEFAULT 0;

ALTER TABLE public.venue_daily_sales
  DROP CONSTRAINT IF EXISTS venue_daily_sales_lunch_complimentary_covers_check,
  DROP CONSTRAINT IF EXISTS venue_daily_sales_dinner_complimentary_covers_check;
ALTER TABLE public.venue_daily_sales
  ADD CONSTRAINT venue_daily_sales_lunch_complimentary_covers_check
    CHECK (lunch_complimentary_covers >= 0 AND lunch_complimentary_covers <= lunch_covers),
  ADD CONSTRAINT venue_daily_sales_dinner_complimentary_covers_check
    CHECK (dinner_complimentary_covers >= 0 AND dinner_complimentary_covers <= dinner_covers);

COMMENT ON COLUMN public.venue_daily_sales.lunch_complimentary_covers IS
  'Lunch covers on complimentary (free) tables; included in lunch_covers, excluded from ASPH.';
COMMENT ON COLUMN public.venue_daily_sales.dinner_complimentary_covers IS
  'Dinner covers on complimentary (free) tables; included in dinner_covers, excluded from ASPH.';

NOTIFY pgrst, 'reload schema';
