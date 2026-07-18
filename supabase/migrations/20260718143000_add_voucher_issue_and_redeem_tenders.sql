-- Split the legacy Voucher tender into Voucher Issue and Voucher Redeem.
-- Tender amounts are normalized rows shared by daily and waiter sales, so
-- preserving the legacy tender UUID keeps all historical amounts attached.

DO $$
DECLARE
  venue_record RECORD;
  voucher_id UUID;
  voucher_issue_id UUID;
  voucher_issue_sort_order INT;
  next_sort_order INT;
BEGIN
  FOR venue_record IN
    SELECT id
    FROM public.venues
    WHERE NOT is_global
  LOOP
    SELECT id
    INTO voucher_id
    FROM public.venue_tenders
    WHERE venue_id = venue_record.id
      AND lower(trim(name)) = 'voucher'
    LIMIT 1;

    SELECT id
    INTO voucher_issue_id
    FROM public.venue_tenders
    WHERE venue_id = venue_record.id
      AND lower(trim(name)) = 'voucher issue'
    LIMIT 1;

    IF voucher_id IS NOT NULL AND voucher_issue_id IS NULL THEN
      UPDATE public.venue_tenders
      SET name = 'Voucher Issue'
      WHERE id = voucher_id;

      voucher_issue_id := voucher_id;
    ELSIF voucher_id IS NOT NULL AND voucher_issue_id IS NOT NULL THEN
      INSERT INTO public.venue_waiter_daily_tender_lines (
        sales_id,
        tender_id,
        amount_gs
      )
      SELECT
        sales_id,
        voucher_issue_id,
        amount_gs
      FROM public.venue_waiter_daily_tender_lines
      WHERE tender_id = voucher_id
      ON CONFLICT (sales_id, tender_id) DO UPDATE
      SET amount_gs =
        public.venue_waiter_daily_tender_lines.amount_gs + EXCLUDED.amount_gs;

      DELETE FROM public.venue_waiter_daily_tender_lines
      WHERE tender_id = voucher_id;

      INSERT INTO public.venue_daily_tender_totals (
        venue_id,
        sale_date,
        tender_id,
        amount_gs,
        created_by,
        updated_by
      )
      SELECT
        venue_id,
        sale_date,
        voucher_issue_id,
        amount_gs,
        created_by,
        updated_by
      FROM public.venue_daily_tender_totals
      WHERE tender_id = voucher_id
      ON CONFLICT (venue_id, sale_date, tender_id) DO UPDATE
      SET
        amount_gs =
          public.venue_daily_tender_totals.amount_gs + EXCLUDED.amount_gs,
        updated_at = now();

      DELETE FROM public.venue_daily_tender_totals
      WHERE tender_id = voucher_id;

      DELETE FROM public.venue_tenders
      WHERE id = voucher_id;
    END IF;

    IF voucher_issue_id IS NULL THEN
      SELECT COALESCE(max(sort_order), 0) + 1
      INTO next_sort_order
      FROM public.venue_tenders
      WHERE venue_id = venue_record.id;

      INSERT INTO public.venue_tenders (venue_id, name, sort_order)
      VALUES (venue_record.id, 'Voucher Issue', next_sort_order)
      RETURNING id INTO voucher_issue_id;
    END IF;

    SELECT sort_order
    INTO voucher_issue_sort_order
    FROM public.venue_tenders
    WHERE id = voucher_issue_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.venue_tenders
      WHERE venue_id = venue_record.id
        AND lower(trim(name)) = 'voucher redeem'
    ) THEN
      UPDATE public.venue_tenders
      SET sort_order = sort_order + 1
      WHERE venue_id = venue_record.id
        AND sort_order > voucher_issue_sort_order;

      INSERT INTO public.venue_tenders (venue_id, name, sort_order)
      VALUES (
        venue_record.id,
        'Voucher Redeem',
        voucher_issue_sort_order + 1
      );
    END IF;

    voucher_id := NULL;
    voucher_issue_id := NULL;
    voucher_issue_sort_order := NULL;
    next_sort_order := NULL;
  END LOOP;
END
$$;
