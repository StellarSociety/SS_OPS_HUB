-- Read Daily Sales tender totals through a permission-checked security-definer
-- function. This keeps the entry screen reliable even when table RLS evaluation
-- is affected by a request's cached auth context.

CREATE OR REPLACE FUNCTION public.list_venue_daily_tender_totals_for_venue(
  p_venue_id UUID,
  p_sale_date DATE DEFAULT NULL
)
RETURNS SETOF public.venue_daily_tender_totals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_feature_permission(
    auth.uid(), 'sales', 'venue_daily', 'view', p_venue_id
  ) THEN
    RAISE EXCEPTION 'You do not have permission to view daily sales.';
  END IF;

  RETURN QUERY
  SELECT tender.*
  FROM public.venue_daily_tender_totals AS tender
  WHERE tender.venue_id = p_venue_id
    AND (p_sale_date IS NULL OR tender.sale_date = p_sale_date)
  ORDER BY tender.sale_date ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_venue_daily_tender_totals_for_venue(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_venue_daily_tender_totals_for_venue(UUID, DATE) TO authenticated;

NOTIFY pgrst, 'reload schema';
