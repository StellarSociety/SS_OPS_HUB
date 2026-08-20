-- Per-login online sessions: start on sign-in, heartbeat while the app is open,
-- close on sign-out or after idle. Used by the user Activity → Online Activity tab.

CREATE TABLE IF NOT EXISTS public.user_online_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT
    CHECK (end_reason IS NULL OR end_reason IN ('logout', 'idle', 'replaced')),
  started_by TEXT NOT NULL DEFAULT 'heartbeat'
    CHECK (started_by IN ('login', 'heartbeat')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_online_sessions_ended_after_start
    CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT user_online_sessions_last_seen_after_start
    CHECK (last_seen_at >= started_at)
);

COMMENT ON TABLE public.user_online_sessions IS
  'Contiguous periods a user was online in the app. One open row per user.';

CREATE UNIQUE INDEX IF NOT EXISTS user_online_sessions_one_open_idx
  ON public.user_online_sessions (user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS user_online_sessions_user_started_idx
  ON public.user_online_sessions (user_id, started_at DESC);

ALTER TABLE public.user_online_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_online_sessions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_online_sessions TO authenticated;
GRANT ALL ON TABLE public.user_online_sessions TO service_role;

DROP POLICY IF EXISTS "user_online_sessions_select_own" ON public.user_online_sessions;
CREATE POLICY "user_online_sessions_select_own"
  ON public.user_online_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_online_sessions_select_app_admin" ON public.user_online_sessions;
CREATE POLICY "user_online_sessions_select_app_admin"
  ON public.user_online_sessions FOR SELECT TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "user_online_sessions_insert_own" ON public.user_online_sessions;
CREATE POLICY "user_online_sessions_insert_own"
  ON public.user_online_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_online_sessions_update_own" ON public.user_online_sessions;
CREATE POLICY "user_online_sessions_update_own"
  ON public.user_online_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Heartbeat: continue the open session, or close it as idle and start a new one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ping_online_session()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  idle INTERVAL := INTERVAL '5 minutes';
  rec public.user_online_sessions;
  new_id UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO rec
  FROM public.user_online_sessions
  WHERE user_id = uid AND ended_at IS NULL
  FOR UPDATE;

  IF FOUND THEN
    IF now() - rec.last_seen_at <= idle THEN
      UPDATE public.user_online_sessions
      SET last_seen_at = now()
      WHERE id = rec.id;
      RETURN rec.id;
    END IF;

    UPDATE public.user_online_sessions
    SET ended_at = rec.last_seen_at,
        end_reason = 'idle'
    WHERE id = rec.id;
  END IF;

  INSERT INTO public.user_online_sessions (user_id, started_by)
  VALUES (uid, 'heartbeat')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Always start a fresh session on sign-in (closes any leftover open row).
CREATE OR REPLACE FUNCTION public.start_login_session()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  new_id UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.user_online_sessions
  SET ended_at = last_seen_at,
      end_reason = 'replaced'
  WHERE user_id = uid AND ended_at IS NULL;

  INSERT INTO public.user_online_sessions (user_id, started_by)
  VALUES (uid, 'login')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Close the open session on sign-out.
CREATE OR REPLACE FUNCTION public.end_online_session()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.user_online_sessions
  SET last_seen_at = now(),
      ended_at = now(),
      end_reason = 'logout'
  WHERE user_id = uid AND ended_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ping_online_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ping_online_session() TO authenticated;

REVOKE ALL ON FUNCTION public.start_login_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_login_session() TO authenticated;

REVOKE ALL ON FUNCTION public.end_online_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_online_session() TO authenticated;

-- Historical rows from existing login / logout access events (first apply only).
INSERT INTO public.user_online_sessions (
  user_id,
  started_at,
  last_seen_at,
  ended_at,
  end_reason,
  started_by
)
SELECT
  b.user_id,
  b.started_at,
  GREATEST(b.started_at, COALESCE(b.last_event_at, b.logout_at, b.started_at)),
  CASE
    WHEN b.logout_at IS NOT NULL THEN b.logout_at
    WHEN b.next_login_at IS NOT NULL THEN GREATEST(b.started_at, COALESCE(b.last_event_at, b.started_at))
    ELSE NULL
  END,
  CASE
    WHEN b.logout_at IS NOT NULL THEN 'logout'
    WHEN b.next_login_at IS NOT NULL THEN 'idle'
    ELSE NULL
  END,
  'login'
FROM (
  SELECT
    l.user_id,
    l.created_at AS started_at,
    l.next_login_at,
    (
      SELECT MIN(e.created_at)
      FROM public.access_events e
      WHERE e.user_id = l.user_id
        AND e.event_type = 'logout'
        AND e.created_at > l.created_at
        AND (l.next_login_at IS NULL OR e.created_at < l.next_login_at)
    ) AS logout_at,
    (
      SELECT MAX(e.created_at)
      FROM public.access_events e
      WHERE e.user_id = l.user_id
        AND e.created_at >= l.created_at
        AND e.created_at <= COALESCE(
          (
            SELECT MIN(x.created_at)
            FROM public.access_events x
            WHERE x.user_id = l.user_id
              AND x.event_type = 'logout'
              AND x.created_at > l.created_at
              AND (l.next_login_at IS NULL OR x.created_at < l.next_login_at)
          ),
          l.next_login_at,
          now()
        )
    ) AS last_event_at
  FROM (
    SELECT
      user_id,
      created_at,
      LEAD(created_at) OVER (PARTITION BY user_id ORDER BY created_at) AS next_login_at
    FROM public.access_events
    WHERE event_type = 'login'
  ) l
) b
WHERE NOT EXISTS (SELECT 1 FROM public.user_online_sessions LIMIT 1);
