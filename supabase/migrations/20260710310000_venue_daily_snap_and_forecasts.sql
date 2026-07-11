-- Daily Snap — closing notes, discount detail lines, and monthly revenue forecasts

-- ---------------------------------------------------------------------------
-- Monthly revenue forecasts (one row per venue per month)
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_monthly_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
  forecast_revenue_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, month_key)
);

CREATE INDEX venue_monthly_forecasts_venue_month_idx
  ON public.venue_monthly_forecasts (venue_id, month_key DESC);

CREATE TRIGGER venue_monthly_forecasts_set_updated_at
  BEFORE UPDATE ON public.venue_monthly_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Daily Snap notes (86's, service comments) — one row per venue per date
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_daily_snap_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  eighty_six_lunch TEXT NOT NULL DEFAULT '',
  eighty_six_dinner TEXT NOT NULL DEFAULT '',
  service_comments TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, sale_date)
);

CREATE INDEX venue_daily_snap_notes_venue_date_idx
  ON public.venue_daily_snap_notes (venue_id, sale_date DESC);

CREATE TRIGGER venue_daily_snap_notes_set_updated_at
  BEFORE UPDATE ON public.venue_daily_snap_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Daily Snap discount / complementary detail lines
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_daily_snap_discount_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  table_number TEXT NOT NULL DEFAULT '',
  time_of_day TEXT NOT NULL DEFAULT '',
  guest_name TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  amount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX venue_daily_snap_discount_lines_venue_date_idx
  ON public.venue_daily_snap_discount_lines (venue_id, sale_date, sort_order);

CREATE TRIGGER venue_daily_snap_discount_lines_set_updated_at
  BEFORE UPDATE ON public.venue_daily_snap_discount_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — cash_up feature (Daily Snap)
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_monthly_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_daily_snap_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_daily_snap_discount_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_monthly_forecasts_select"
  ON public.venue_monthly_forecasts FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'view', venue_id
    )
  );

CREATE POLICY "venue_monthly_forecasts_insert"
  ON public.venue_monthly_forecasts FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );

CREATE POLICY "venue_monthly_forecasts_update"
  ON public.venue_monthly_forecasts FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );

CREATE POLICY "venue_monthly_forecasts_delete"
  ON public.venue_monthly_forecasts FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_snap_notes_select"
  ON public.venue_daily_snap_notes FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'view', venue_id
    )
  );

CREATE POLICY "venue_daily_snap_notes_insert"
  ON public.venue_daily_snap_notes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_snap_notes_update"
  ON public.venue_daily_snap_notes FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_snap_notes_delete"
  ON public.venue_daily_snap_notes FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_snap_discount_lines_select"
  ON public.venue_daily_snap_discount_lines FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'view', venue_id
    )
  );

CREATE POLICY "venue_daily_snap_discount_lines_insert"
  ON public.venue_daily_snap_discount_lines FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_snap_discount_lines_update"
  ON public.venue_daily_snap_discount_lines FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_snap_discount_lines_delete"
  ON public.venue_daily_snap_discount_lines FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );
