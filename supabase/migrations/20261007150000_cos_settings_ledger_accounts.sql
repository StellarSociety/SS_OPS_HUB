-- GP & COS: Accounts ledger accounts whose purchases feed each cost centre.

ALTER TABLE public.venue_cos_settings
  ADD COLUMN IF NOT EXISTS ledger_account_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.venue_cos_settings.ledger_account_ids IS
  'accounts.id list; AP invoice lines on these ledgers count as this cost centre''s purchases.';
