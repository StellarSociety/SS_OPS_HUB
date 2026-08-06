-- Flag which tenders appear in voucher Payment Form dropdowns.

ALTER TABLE public.venue_tenders
  ADD COLUMN IF NOT EXISTS voucher_payment_form BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.venue_tenders.voucher_payment_form IS
  'When true, tender is offered as Payment Form on voucher create/edit.';

-- Voucher Issue / Redeem are never payment forms.
UPDATE public.venue_tenders
SET voucher_payment_form = false
WHERE lower(trim(name)) IN (
  'voucher',
  'voucher issue',
  'voucher redeem',
  'redeemed voucher'
);
