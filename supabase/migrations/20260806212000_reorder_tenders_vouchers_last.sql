-- Reorder tenders: Deposit / On Accounts / Zomato after Cash;
-- Voucher Issue and Voucher Redeem always last (Issue before Redeem).

DO $$
DECLARE
  venue_record RECORD;
  tender_record RECORD;
  next_order INT;
  cash_order INT;
BEGIN
  FOR venue_record IN
    SELECT id
    FROM public.venues
    WHERE NOT is_global
  LOOP
    -- Place Deposit / On Accounts / Zomato immediately after Cash when present.
    SELECT sort_order
    INTO cash_order
    FROM public.venue_tenders
    WHERE venue_id = venue_record.id
      AND lower(trim(name)) = 'cash'
    LIMIT 1;

    IF cash_order IS NOT NULL THEN
      UPDATE public.venue_tenders
      SET sort_order = cash_order + 1
      WHERE venue_id = venue_record.id
        AND lower(trim(name)) = 'deposit';

      UPDATE public.venue_tenders
      SET sort_order = cash_order + 2
      WHERE venue_id = venue_record.id
        AND lower(trim(name)) = 'on accounts';

      UPDATE public.venue_tenders
      SET sort_order = cash_order + 3
      WHERE venue_id = venue_record.id
        AND lower(trim(name)) = 'zomato';
    END IF;

    -- Normalize all sort_order values with vouchers forced to the end.
    next_order := 0;

    FOR tender_record IN
      SELECT id, name
      FROM public.venue_tenders
      WHERE venue_id = venue_record.id
        AND lower(trim(name)) NOT IN (
          'voucher issue',
          'voucher',
          'voucher redeem',
          'redeemed voucher'
        )
      ORDER BY sort_order, name
    LOOP
      UPDATE public.venue_tenders
      SET sort_order = next_order
      WHERE id = tender_record.id;
      next_order := next_order + 1;
    END LOOP;

    FOR tender_record IN
      SELECT id
      FROM public.venue_tenders
      WHERE venue_id = venue_record.id
        AND lower(trim(name)) IN ('voucher issue', 'voucher')
      ORDER BY sort_order, name
    LOOP
      UPDATE public.venue_tenders
      SET sort_order = next_order
      WHERE id = tender_record.id;
      next_order := next_order + 1;
    END LOOP;

    FOR tender_record IN
      SELECT id
      FROM public.venue_tenders
      WHERE venue_id = venue_record.id
        AND lower(trim(name)) IN ('voucher redeem', 'redeemed voucher')
      ORDER BY sort_order, name
    LOOP
      UPDATE public.venue_tenders
      SET sort_order = next_order
      WHERE id = tender_record.id;
      next_order := next_order + 1;
    END LOOP;

    cash_order := NULL;
  END LOOP;
END
$$;
