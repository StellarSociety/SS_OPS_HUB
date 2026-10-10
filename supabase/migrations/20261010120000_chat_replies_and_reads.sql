-- Message replies and per-message read times ("Read by" in the message menu).

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID
    REFERENCES public.chat_messages(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_message_reads_conversation_idx
  ON public.chat_message_reads (conversation_id, user_id);

ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_message_reads_select" ON public.chat_message_reads;
CREATE POLICY "chat_message_reads_select"
  ON public.chat_message_reads FOR SELECT TO authenticated
  USING (public.chat_is_member(conversation_id));
