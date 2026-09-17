-- Web Push subscriptions for installed PWA device notifications (iOS + Android + desktop).

CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  platform TEXT NOT NULL DEFAULT 'desktop'
    CHECK (platform IN ('ios', 'android', 'desktop')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

COMMENT ON TABLE public.push_subscriptions IS
  'Per-device Web Push subscriptions. One row per browser endpoint; reassigned on login.';

CREATE INDEX push_subscriptions_user_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

CREATE POLICY "push_subscriptions_select_own"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "push_subscriptions_insert_own"
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions_update_own"
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_subscriptions_delete_own"
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.notifications.push_sent_at IS
  'When a Web Push was delivered for this row. Existing rows are backfilled so they are not blasted to phones.';

-- Do not send historical in-app/email notices as device notifications.
UPDATE public.notifications
SET push_sent_at = COALESCE(email_sent_at, created_at)
WHERE push_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_push_pending_idx
  ON public.notifications (push_sent_at)
  WHERE push_sent_at IS NULL;
