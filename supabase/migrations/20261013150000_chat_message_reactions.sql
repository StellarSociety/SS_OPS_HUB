-- Emoji reactions on Connect chat messages: one reaction per person per message
-- (picking another emoji replaces it). Writes go through server actions
-- (service role); members can read so the client can subscribe to realtime.

CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL
    CHECK (reaction IN ('like', 'love', 'laugh', 'wow', 'sad', 'star', 'pray', 'fire')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_message_reactions_conversation_idx
  ON public.chat_message_reactions (conversation_id);

-- Realtime DELETE events carry only the replica identity; FULL keeps
-- conversation_id in them so the per-chat filter still matches.
ALTER TABLE public.chat_message_reactions REPLICA IDENTITY FULL;

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_message_reactions_select" ON public.chat_message_reactions;
CREATE POLICY "chat_message_reactions_select" ON public.chat_message_reactions
  FOR SELECT TO authenticated
  USING (public.chat_is_member(conversation_id));

GRANT SELECT ON public.chat_message_reactions TO authenticated;
GRANT ALL ON public.chat_message_reactions TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
