-- Rename the default "Redeemed Voucher" tender to "Voucher" for existing venues.
-- Skip venues that already have a tender named "Voucher" to avoid unique-name conflicts.
UPDATE public.venue_tenders AS t
SET name = 'Voucher'
WHERE lower(trim(t.name)) = 'redeemed voucher'
  AND NOT EXISTS (
    SELECT 1
    FROM public.venue_tenders AS existing
    WHERE existing.venue_id = t.venue_id
      AND existing.id <> t.id
      AND lower(trim(existing.name)) = 'voucher'
  );
