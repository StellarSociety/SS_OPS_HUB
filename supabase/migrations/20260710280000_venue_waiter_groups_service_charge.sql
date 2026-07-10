-- SS Ops Hub — Groups service charge settings + waiter daily field

ALTER TABLE public.venue_waiter_daily_sales
  ADD COLUMN IF NOT EXISTS groups_service_charge_gs NUMERIC(14, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.venue_waiter_sales_settings (
  venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  groups_added_service_charge_pct NUMERIC(6, 3) NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER venue_waiter_sales_settings_set_updated_at
  BEFORE UPDATE ON public.venue_waiter_sales_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_waiter_sales_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_waiter_sales_settings_select"
  ON public.venue_waiter_sales_settings FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'view', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_waiter_sales_settings_insert"
  ON public.venue_waiter_sales_settings FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_waiter_sales_settings_update"
  ON public.venue_waiter_sales_settings FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

INSERT INTO public.venue_waiter_sales_settings (venue_id)
SELECT id FROM public.venues
ON CONFLICT (venue_id) DO NOTHING;
