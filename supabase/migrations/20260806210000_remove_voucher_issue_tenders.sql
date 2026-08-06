-- Remove Voucher Issue (and legacy "Voucher") tenders from sales entry.
-- Amounts live on the voucher ledger instead; Voucher Redeem is kept.

DELETE FROM public.venue_waiter_daily_tender_lines
WHERE tender_id IN (
  SELECT id
  FROM public.venue_tenders
  WHERE lower(trim(name)) IN ('voucher issue', 'voucher')
);

DELETE FROM public.venue_daily_tender_totals
WHERE tender_id IN (
  SELECT id
  FROM public.venue_tenders
  WHERE lower(trim(name)) IN ('voucher issue', 'voucher')
);

DELETE FROM public.venue_tenders
WHERE lower(trim(name)) IN ('voucher issue', 'voucher');
