-- Split cash expense line amount into Gross / VAT / Net
ALTER TABLE public.venue_cash_expense_lines
  ADD COLUMN IF NOT EXISTS gross_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_gs NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Existing amount treated as gross (cash paid); net mirrors until edited
UPDATE public.venue_cash_expense_lines
SET
  gross_gs = COALESCE(amount_gs, 0),
  vat_gs = 0,
  net_gs = COALESCE(amount_gs, 0)
WHERE gross_gs = 0 AND vat_gs = 0 AND net_gs = 0 AND COALESCE(amount_gs, 0) <> 0;

ALTER TABLE public.venue_cash_expense_lines
  DROP COLUMN IF EXISTS amount_gs;
