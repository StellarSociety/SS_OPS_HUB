-- Connecteam Chats: real-time 1:1 and group conversations.
-- Writes go through server actions (service role); members read their own
-- conversations through RLS, which also gates Supabase Realtime delivery.

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
  -- Sorted "<userA>:<userB>" so a pair only ever has one direct chat.
  direct_key TEXT,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#818a40',
  -- Access options (group chats).
  only_admins_can_post BOOLEAN NOT NULL DEFAULT false,
  members_can_add BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_direct_key_idx
  ON public.chat_conversations (venue_id, direct_key)
  WHERE direct_key IS NOT NULL;

DROP TRIGGER IF EXISTS chat_conversations_set_updated_at ON public.chat_conversations;
CREATE TRIGGER chat_conversations_set_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.chat_members (
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_members_user_idx ON public.chat_members (user_id, venue_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  attachment_url TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  attachment_size BIGINT,
  -- 'system' rows record joins / leaves / renames.
  kind TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'system')),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
  ON public.chat_messages (conversation_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_is_member(
  check_conversation_id uuid,
  check_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members m
    WHERE m.conversation_id = check_conversation_id AND m.user_id = check_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.chat_is_member(uuid, uuid) TO authenticated;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversations_select" ON public.chat_conversations;
CREATE POLICY "chat_conversations_select" ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (public.chat_is_member(id));

DROP POLICY IF EXISTS "chat_members_select" ON public.chat_members;
CREATE POLICY "chat_members_select" ON public.chat_members
  FOR SELECT TO authenticated
  USING (public.chat_is_member(conversation_id));

DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
CREATE POLICY "chat_messages_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.chat_is_member(conversation_id));

GRANT SELECT ON public.chat_conversations TO authenticated;
GRANT SELECT ON public.chat_members TO authenticated;
GRANT SELECT ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_conversations TO service_role;
GRANT ALL ON public.chat_members TO service_role;
GRANT ALL ON public.chat_messages TO service_role;

-- Live delivery of new / edited messages to members.
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

NOTIFY pgrst, 'reload schema';
