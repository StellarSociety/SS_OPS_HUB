-- Restore Voucher Issue tenders for Daily Sales entry / POS reconciliation.
-- Waiter Sales entry continues to hide this tender in the UI.

DO $$
DECLARE
  venue_record RECORD;
  voucher_issue_id UUID;
  voucher_redeem_id UUID;
  next_sort_order INT;
BEGIN
  FOR venue_record IN
    SELECT id
    FROM public.venues
    WHERE NOT is_global
  LOOP
    SELECT id
    INTO voucher_issue_id
    FROM public.venue_tenders
    WHERE venue_id = venue_record.id
      AND lower(trim(name)) = 'voucher issue'
    LIMIT 1;

    IF voucher_issue_id IS NULL THEN
      SELECT id
      INTO voucher_redeem_id
      FROM public.venue_tenders
      WHERE venue_id = venue_record.id
        AND lower(trim(name)) IN ('voucher redeem', 'redeemed voucher')
      ORDER BY sort_order
      LIMIT 1;

      IF voucher_redeem_id IS NOT NULL THEN
        SELECT sort_order
        INTO next_sort_order
        FROM public.venue_tenders
        WHERE id = voucher_redeem_id;

        UPDATE public.venue_tenders
        SET sort_order = sort_order + 1
        WHERE venue_id = venue_record.id
          AND sort_order >= next_sort_order;

        INSERT INTO public.venue_tenders (venue_id, name, sort_order, status)
        VALUES (venue_record.id, 'Voucher Issue', next_sort_order, 'active')
        RETURNING id INTO voucher_issue_id;
      ELSE
        SELECT COALESCE(max(sort_order), 0) + 1
        INTO next_sort_order
        FROM public.venue_tenders
        WHERE venue_id = venue_record.id;

        INSERT INTO public.venue_tenders (venue_id, name, sort_order, status)
        VALUES (venue_record.id, 'Voucher Issue', next_sort_order, 'active')
        RETURNING id INTO voucher_issue_id;
      END IF;
    ELSE
      UPDATE public.venue_tenders
      SET status = 'active'
      WHERE id = voucher_issue_id
        AND status IS DISTINCT FROM 'active';
    END IF;

    voucher_issue_id := NULL;
    voucher_redeem_id := NULL;
    next_sort_order := NULL;
  END LOOP;
END
$$;
