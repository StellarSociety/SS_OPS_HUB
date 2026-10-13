-- Internal 1:1 voice and video calls for Connect chats.
-- LiveKit carries media; these tables contain only invitation/lifecycle data.

CREATE TABLE IF NOT EXISTS public.chat_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('audio', 'video')),
  status TEXT NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'active', 'ended', 'declined', 'missed', 'cancelled')),
  livekit_room TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_calls_conversation_open_idx
  ON public.chat_calls (conversation_id)
  WHERE status IN ('ringing', 'active');

DROP TRIGGER IF EXISTS chat_calls_set_updated_at ON public.chat_calls;
CREATE TRIGGER chat_calls_set_updated_at
  BEFORE UPDATE ON public.chat_calls
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.chat_call_participants (
  call_id UUID NOT NULL REFERENCES public.chat_calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'joined', 'declined', 'left', 'missed')),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_call_participants_user_idx
  ON public.chat_call_participants (user_id, created_at DESC);

ALTER TABLE public.chat_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_call_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_calls_select" ON public.chat_calls;
CREATE POLICY "chat_calls_select" ON public.chat_calls
  FOR SELECT TO authenticated
  USING (public.chat_is_member(conversation_id));

DROP POLICY IF EXISTS "chat_call_participants_select" ON public.chat_call_participants;
CREATE POLICY "chat_call_participants_select" ON public.chat_call_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_calls c
      WHERE c.id = call_id
        AND public.chat_is_member(c.conversation_id)
    )
  );

GRANT SELECT ON public.chat_calls TO authenticated;
GRANT SELECT ON public.chat_call_participants TO authenticated;
GRANT ALL ON public.chat_calls TO service_role;
GRANT ALL ON public.chat_call_participants TO service_role;

-- Members receive call invitations and lifecycle changes immediately.
-- Keep this idempotent for environments that replay a migration manually.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_calls;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
