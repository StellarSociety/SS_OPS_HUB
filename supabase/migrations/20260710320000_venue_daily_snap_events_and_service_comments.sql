-- Daily Snap — events breakdown and lunch/dinner service comments

-- ---------------------------------------------------------------------------
-- Split service comments into lunch and dinner
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_daily_snap_notes
  ADD COLUMN IF NOT EXISTS service_comments_lunch TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_comments_dinner TEXT NOT NULL DEFAULT '';

UPDATE public.venue_daily_snap_notes
SET service_comments_lunch = service_comments
WHERE service_comments IS NOT NULL
  AND service_comments <> ''
  AND service_comments_lunch = '';

ALTER TABLE public.venue_daily_snap_notes
  DROP COLUMN IF EXISTS service_comments;

-- ---------------------------------------------------------------------------
-- Daily Snap events — private parties, buyouts, etc.
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_daily_snap_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  event_name TEXT NOT NULL DEFAULT '',
  guest_count INT NOT NULL DEFAULT 0,
  package_name TEXT NOT NULL DEFAULT '',
  total_pay_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  service_comments TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX venue_daily_snap_events_venue_date_idx
  ON public.venue_daily_snap_events (venue_id, sale_date, sort_order);

CREATE TRIGGER venue_daily_snap_events_set_updated_at
  BEFORE UPDATE ON public.venue_daily_snap_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — cash_up feature (Daily Snap)
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_daily_snap_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_daily_snap_events_select"
  ON public.venue_daily_snap_events FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'view', venue_id
    )
  );

CREATE POLICY "venue_daily_snap_events_insert"
  ON public.venue_daily_snap_events FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_snap_events_update"
  ON public.venue_daily_snap_events FOR UPDATE TO authenticated
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

CREATE POLICY "venue_daily_snap_events_delete"
  ON public.venue_daily_snap_events FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
  );
