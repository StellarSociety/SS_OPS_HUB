-- Save a Daily Sales entry and its POS tender totals as a single unit.
-- The prior client flow updated daily sales first, then deleted and reinserted
-- tender totals in a separate request. If request two failed, the day was left
-- partly saved. PostgreSQL functions run in one transaction, so any error here
-- rolls back both the daily figures and the tender replacement.

CREATE OR REPLACE FUNCTION public.save_venue_daily_sales_with_tenders(
  p_venue_id UUID,
  p_user_id UUID,
  p_daily JSONB,
  p_tenders JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_daily public.venue_daily_sales;
  v_sale_date DATE;
  v_tender_totals JSONB;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'The current user does not match the requested editor.';
  END IF;

  IF NOT public.has_feature_permission(
    auth.uid(), 'sales', 'venue_daily', 'edit', p_venue_id
  ) THEN
    RAISE EXCEPTION 'You do not have permission to edit daily sales.';
  END IF;

  v_sale_date := (p_daily->>'sale_date')::DATE;
  IF v_sale_date IS NULL THEN
    RAISE EXCEPTION 'A valid sale date is required.';
  END IF;

  IF jsonb_typeof(p_tenders) <> 'array' THEN
    RAISE EXCEPTION 'Tender totals must be an array.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_tenders) AS input(tender_id UUID, amount_gs NUMERIC)
    LEFT JOIN public.venue_tenders tender
      ON tender.id = input.tender_id
      AND tender.venue_id = p_venue_id
    WHERE input.tender_id IS NULL
      OR input.amount_gs IS NULL
      OR input.amount_gs < 0
      OR tender.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more tender totals are invalid for this venue.';
  END IF;

  INSERT INTO public.venue_daily_sales (
    venue_id,
    sale_date,
    lunch_food_gs,
    lunch_beverages_gs,
    lunch_wine_gs,
    lunch_shisha_gs,
    lunch_tobacco_gs,
    lunch_others_gs,
    lunch_service_fees_gs,
    lunch_covers,
    lunch_complimentary_covers,
    lunch_bookings,
    lunch_walkin_tables,
    lunch_walkin_covers,
    dinner_food_gs,
    dinner_beverages_gs,
    dinner_wine_gs,
    dinner_shisha_gs,
    dinner_tobacco_gs,
    dinner_others_gs,
    dinner_service_fees_gs,
    dinner_covers,
    dinner_complimentary_covers,
    dinner_bookings,
    dinner_walkin_tables,
    dinner_walkin_covers,
    all_day_discount_gs,
    vat_collected_gs,
    municipality_fee_collected_gs,
    service_charge_collected_gs,
    created_by,
    updated_by
  ) VALUES (
    p_venue_id,
    v_sale_date,
    COALESCE((p_daily->>'lunch_food_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'lunch_beverages_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'lunch_wine_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'lunch_shisha_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'lunch_tobacco_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'lunch_others_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'lunch_service_fees_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'lunch_covers')::INTEGER, 0),
    COALESCE((p_daily->>'lunch_complimentary_covers')::INTEGER, 0),
    COALESCE((p_daily->>'lunch_bookings')::INTEGER, 0),
    COALESCE((p_daily->>'lunch_walkin_tables')::INTEGER, 0),
    COALESCE((p_daily->>'lunch_walkin_covers')::INTEGER, 0),
    COALESCE((p_daily->>'dinner_food_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'dinner_beverages_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'dinner_wine_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'dinner_shisha_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'dinner_tobacco_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'dinner_others_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'dinner_service_fees_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'dinner_covers')::INTEGER, 0),
    COALESCE((p_daily->>'dinner_complimentary_covers')::INTEGER, 0),
    COALESCE((p_daily->>'dinner_bookings')::INTEGER, 0),
    COALESCE((p_daily->>'dinner_walkin_tables')::INTEGER, 0),
    COALESCE((p_daily->>'dinner_walkin_covers')::INTEGER, 0),
    COALESCE((p_daily->>'all_day_discount_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'vat_collected_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'municipality_fee_collected_gs')::NUMERIC, 0),
    COALESCE((p_daily->>'service_charge_collected_gs')::NUMERIC, 0),
    p_user_id,
    p_user_id
  )
  ON CONFLICT (venue_id, sale_date) DO UPDATE SET
    lunch_food_gs = EXCLUDED.lunch_food_gs,
    lunch_beverages_gs = EXCLUDED.lunch_beverages_gs,
    lunch_wine_gs = EXCLUDED.lunch_wine_gs,
    lunch_shisha_gs = EXCLUDED.lunch_shisha_gs,
    lunch_tobacco_gs = EXCLUDED.lunch_tobacco_gs,
    lunch_others_gs = EXCLUDED.lunch_others_gs,
    lunch_service_fees_gs = EXCLUDED.lunch_service_fees_gs,
    lunch_covers = EXCLUDED.lunch_covers,
    lunch_complimentary_covers = EXCLUDED.lunch_complimentary_covers,
    lunch_bookings = EXCLUDED.lunch_bookings,
    lunch_walkin_tables = EXCLUDED.lunch_walkin_tables,
    lunch_walkin_covers = EXCLUDED.lunch_walkin_covers,
    dinner_food_gs = EXCLUDED.dinner_food_gs,
    dinner_beverages_gs = EXCLUDED.dinner_beverages_gs,
    dinner_wine_gs = EXCLUDED.dinner_wine_gs,
    dinner_shisha_gs = EXCLUDED.dinner_shisha_gs,
    dinner_tobacco_gs = EXCLUDED.dinner_tobacco_gs,
    dinner_others_gs = EXCLUDED.dinner_others_gs,
    dinner_service_fees_gs = EXCLUDED.dinner_service_fees_gs,
    dinner_covers = EXCLUDED.dinner_covers,
    dinner_complimentary_covers = EXCLUDED.dinner_complimentary_covers,
    dinner_bookings = EXCLUDED.dinner_bookings,
    dinner_walkin_tables = EXCLUDED.dinner_walkin_tables,
    dinner_walkin_covers = EXCLUDED.dinner_walkin_covers,
    all_day_discount_gs = EXCLUDED.all_day_discount_gs,
    vat_collected_gs = EXCLUDED.vat_collected_gs,
    municipality_fee_collected_gs = EXCLUDED.municipality_fee_collected_gs,
    service_charge_collected_gs = EXCLUDED.service_charge_collected_gs,
    updated_by = p_user_id
  RETURNING * INTO v_daily;

  DELETE FROM public.venue_daily_tender_totals
  WHERE venue_id = p_venue_id
    AND sale_date = v_sale_date;

  INSERT INTO public.venue_daily_tender_totals (
    venue_id,
    sale_date,
    tender_id,
    amount_gs,
    created_by,
    updated_by
  )
  SELECT
    p_venue_id,
    v_sale_date,
    input.tender_id,
    input.amount_gs,
    p_user_id,
    p_user_id
  FROM jsonb_to_recordset(p_tenders) AS input(tender_id UUID, amount_gs NUMERIC)
  WHERE input.amount_gs > 0;

  SELECT COALESCE(jsonb_agg(to_jsonb(tender)), '[]'::JSONB)
  INTO v_tender_totals
  FROM public.venue_daily_tender_totals AS tender
  WHERE tender.venue_id = p_venue_id
    AND tender.sale_date = v_sale_date;

  RETURN jsonb_build_object(
    'record', to_jsonb(v_daily),
    'tender_totals', v_tender_totals
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_venue_daily_sales_with_tenders(UUID, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_venue_daily_sales_with_tenders(UUID, UUID, JSONB, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
