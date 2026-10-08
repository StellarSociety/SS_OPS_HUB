-- Cost runs: purchases_gs is the figure used for cost of sales (the Accounts
-- ledger value when ledgers are linked); the manual STO entry is kept
-- separately for the Accounts − STO check.
ALTER TABLE public.venue_cos_runs
  ADD COLUMN IF NOT EXISTS manual_purchases_gs NUMERIC(14, 3);

-- Existing runs were entered manually: keep that figure as the STO value.
UPDATE public.venue_cos_runs
  SET manual_purchases_gs = purchases_gs
  WHERE manual_purchases_gs IS NULL;
