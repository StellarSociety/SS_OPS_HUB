-- SS Ops Hub — Venue Daily Sales + Sales tax settings

-- ---------------------------------------------------------------------------
-- Per-venue sales tax configuration
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_sales_tax_settings (
  venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  municipality_fee_pct NUMERIC(6, 3) NOT NULL DEFAULT 7,
  vat_pct NUMERIC(6, 3) NOT NULL DEFAULT 5,
  service_charge_pct NUMERIC(6, 3) NOT NULL DEFAULT 10,
  vat_on_service_charge_pct NUMERIC(6, 3) NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER venue_sales_tax_settings_set_updated_at
  BEFORE UPDATE ON public.venue_sales_tax_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Venue daily sales (one row per venue per date)
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_daily_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  lunch_food_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lunch_beverages_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lunch_wine_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lunch_shisha_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lunch_others_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lunch_covers INT NOT NULL DEFAULT 0,
  lunch_bookings INT NOT NULL DEFAULT 0,
  dinner_food_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  dinner_beverages_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  dinner_wine_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  dinner_shisha_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  dinner_others_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  dinner_covers INT NOT NULL DEFAULT 0,
  dinner_bookings INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, sale_date)
);

CREATE INDEX venue_daily_sales_venue_date_idx
  ON public.venue_daily_sales (venue_id, sale_date DESC);

CREATE TRIGGER venue_daily_sales_set_updated_at
  BEFORE UPDATE ON public.venue_daily_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_sales_tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_daily_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_sales_tax_settings_select"
  ON public.venue_sales_tax_settings FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_sales_tax_settings_insert"
  ON public.venue_sales_tax_settings FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_sales_tax_settings_update"
  ON public.venue_sales_tax_settings FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_sales_select"
  ON public.venue_daily_sales FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_daily_sales_insert"
  ON public.venue_daily_sales FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_sales_update"
  ON public.venue_daily_sales FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_sales_delete"
  ON public.venue_daily_sales FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

-- Seed default tax settings for existing venues
INSERT INTO public.venue_sales_tax_settings (venue_id)
SELECT v.id
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id) DO NOTHING;
