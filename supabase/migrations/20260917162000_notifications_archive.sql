-- Finish the notifications layer: allow dismiss, live updates, and archive.
-- 20260722120000 (delete policy) and 20260724190000 (realtime) never reached
-- the remote DB because an earlier pending migration blocked the runner.

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own"
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.notifications.archived_at IS
  'When the recipient dismissed the notice. Kept so expiry cron cannot recreate the same dedupe_key.';

CREATE INDEX IF NOT EXISTS notifications_user_inbox_idx
  ON public.notifications (user_id, archived_at, due_date, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_archive_idx
  ON public.notifications (user_id, archived_at DESC)
  WHERE archived_at IS NOT NULL;
