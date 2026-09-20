-- Per-device heartbeats from the staff PWA (`/m/...`).
-- Lets Mobile App → Users Access show who has the app, last opened, and version.

CREATE TABLE public.mobile_app_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  platform TEXT NOT NULL DEFAULT 'desktop'
    CHECK (platform IN ('ios', 'android', 'desktop')),
  standalone BOOLEAN NOT NULL DEFAULT false,
  installed BOOLEAN NOT NULL DEFAULT false,
  app_version TEXT NOT NULL,
  sw_cache TEXT,
  user_agent TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mobile_app_installs_user_device_key UNIQUE (user_id, device_id)
);

COMMENT ON TABLE public.mobile_app_installs IS
  'Last-known PWA device for each signed-in user. app_version is the JS bundle they last opened.';

CREATE INDEX mobile_app_installs_user_idx
  ON public.mobile_app_installs (user_id);

CREATE INDEX mobile_app_installs_venue_idx
  ON public.mobile_app_installs (venue_id)
  WHERE venue_id IS NOT NULL;

ALTER TABLE public.mobile_app_installs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mobile_app_installs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.mobile_app_installs TO authenticated;
GRANT ALL ON TABLE public.mobile_app_installs TO service_role;

CREATE POLICY "mobile_app_installs_select"
  ON public.mobile_app_installs
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

CREATE POLICY "mobile_app_installs_insert_own"
  ON public.mobile_app_installs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "mobile_app_installs_update_own"
  ON public.mobile_app_installs
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
