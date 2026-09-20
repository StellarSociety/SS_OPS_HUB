-- Screen views and in-app edits from the staff PWA (`/m/...`).
-- Powers Mobile App → App Insights.

CREATE TABLE public.mobile_app_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('view', 'edit')),
  page_key TEXT NOT NULL,
  path TEXT NOT NULL,
  platform TEXT
    CHECK (platform IS NULL OR platform IN ('ios', 'android', 'desktop')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mobile_app_usage_events IS
  'Staff PWA screen views and form edits. page_key matches mobile app screens (directory, leave, …).';

CREATE INDEX mobile_app_usage_events_venue_occurred_idx
  ON public.mobile_app_usage_events (venue_id, occurred_at DESC)
  WHERE venue_id IS NOT NULL;

CREATE INDEX mobile_app_usage_events_venue_type_idx
  ON public.mobile_app_usage_events (venue_id, event_type, occurred_at DESC)
  WHERE venue_id IS NOT NULL;

CREATE INDEX mobile_app_usage_events_user_occurred_idx
  ON public.mobile_app_usage_events (user_id, occurred_at DESC);

ALTER TABLE public.mobile_app_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mobile_app_usage_events FROM PUBLIC, anon;
GRANT SELECT, INSERT ON TABLE public.mobile_app_usage_events TO authenticated;
GRANT ALL ON TABLE public.mobile_app_usage_events TO service_role;

CREATE POLICY "mobile_app_usage_events_select"
  ON public.mobile_app_usage_events
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_app_admin()
    OR (
      venue_id IS NOT NULL
      AND (
        public.has_feature_permission(
          auth.uid(), 'mobile_app', 'app', 'view', venue_id
        )
        OR public.has_feature_permission(
          auth.uid(), 'mobile_app', 'settings', 'view', venue_id
        )
      )
    )
  );

CREATE POLICY "mobile_app_usage_events_insert_own"
  ON public.mobile_app_usage_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
