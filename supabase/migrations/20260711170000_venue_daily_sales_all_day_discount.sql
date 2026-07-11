-- Daily sales — single all-day discount amount (gross) per day.

ALTER TABLE public.venue_daily_sales
  ADD COLUMN IF NOT EXISTS all_day_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0;
