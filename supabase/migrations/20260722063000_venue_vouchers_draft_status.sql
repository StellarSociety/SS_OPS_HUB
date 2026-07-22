-- Allow draft vouchers (entered before they appear on daily Voucher Issue tenders).

ALTER TABLE public.venue_vouchers
  DROP CONSTRAINT IF EXISTS venue_vouchers_status_check;

ALTER TABLE public.venue_vouchers
  ADD CONSTRAINT venue_vouchers_status_check
  CHECK (status IN ('draft', 'issued', 'redeemed', 'cancelled', 'expired'));

ALTER TABLE public.venue_vouchers
  DROP CONSTRAINT IF EXISTS venue_vouchers_redeemed_date_check;

ALTER TABLE public.venue_vouchers
  ADD CONSTRAINT venue_vouchers_redeemed_date_check CHECK (
    (status = 'redeemed' AND redeemed_date IS NOT NULL)
    OR (status <> 'redeemed' AND redeemed_date IS NULL)
  );
