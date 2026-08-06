-- Cash journal free-text comments (shown on Table Database)
ALTER TABLE public.venue_cash_journal
  ADD COLUMN IF NOT EXISTS comments TEXT NOT NULL DEFAULT '';
