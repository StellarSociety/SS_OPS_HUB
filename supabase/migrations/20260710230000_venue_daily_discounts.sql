-- SS Ops Hub — Venue daily discounts (one row per venue per date)

CREATE TABLE public.venue_daily_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  lunch_food_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lunch_beverages_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lunch_wine_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lunch_shisha_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lunch_others_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  dinner_food_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  dinner_beverages_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  dinner_wine_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  dinner_shisha_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  dinner_others_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, sale_date)
);

CREATE INDEX venue_daily_discounts_venue_date_idx
  ON public.venue_daily_discounts (venue_id, sale_date DESC);

CREATE TRIGGER venue_daily_discounts_set_updated_at
  BEFORE UPDATE ON public.venue_daily_discounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_daily_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_daily_discounts_select"
  ON public.venue_daily_discounts FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_drawer', 'view', venue_id
    )
  );

CREATE POLICY "venue_daily_discounts_insert"
  ON public.venue_daily_discounts FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_drawer', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_discounts_update"
  ON public.venue_daily_discounts FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_drawer', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_drawer', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_discounts_delete"
  ON public.venue_daily_discounts FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_drawer', 'edit', venue_id
    )
  );
