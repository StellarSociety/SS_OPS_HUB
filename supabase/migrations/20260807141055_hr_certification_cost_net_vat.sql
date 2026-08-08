-- Net and VAT breakdown for certification cost per application.
-- cost_value remains the gross (inclusive) amount.

ALTER TABLE public.certification_types
  ADD COLUMN IF NOT EXISTS cost_net NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_vat NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Backfill: treat existing gross as net with 0 VAT when net is still empty.
UPDATE public.certification_types
SET cost_net = cost_value
WHERE cost_value > 0
  AND cost_net = 0
  AND cost_vat = 0;
