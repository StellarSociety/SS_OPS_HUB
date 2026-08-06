-- Persist open/closing till on cash journal (nullable = fall back to Daily Snap).
-- Edits on Cash Journal sync back to venue_daily_snap_notes cash drawer columns.

ALTER TABLE public.venue_cash_journal
  ADD COLUMN IF NOT EXISTS open_till_gs NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS closing_till_gs NUMERIC(14, 2);
