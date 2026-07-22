-- Record how each voucher was paid for (Cash, Visa, Qlub, etc.).
-- Excludes voucher tenders themselves — those track issue/redeem totals.

ALTER TABLE public.venue_vouchers
  ADD COLUMN IF NOT EXISTS payment_form_tender_id UUID
    REFERENCES public.venue_tenders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS venue_vouchers_payment_form_tender_idx
  ON public.venue_vouchers (payment_form_tender_id)
  WHERE payment_form_tender_id IS NOT NULL;
