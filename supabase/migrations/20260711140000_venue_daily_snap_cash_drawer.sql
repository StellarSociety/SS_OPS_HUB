-- Daily Snap — cash drawer opening / closing counts (per venue per date)

ALTER TABLE public.venue_daily_snap_notes
  ADD COLUMN IF NOT EXISTS cash_drawer_opening_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_drawer_closing_gs NUMERIC(14, 2) NOT NULL DEFAULT 0;
