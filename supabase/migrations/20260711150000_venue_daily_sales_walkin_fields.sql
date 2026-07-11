-- Daily sales — walk-in tables and walk-in covers (lunch / dinner)

ALTER TABLE public.venue_daily_sales
  ADD COLUMN IF NOT EXISTS lunch_walkin_tables INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lunch_walkin_covers INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dinner_walkin_tables INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dinner_walkin_covers INT NOT NULL DEFAULT 0;
