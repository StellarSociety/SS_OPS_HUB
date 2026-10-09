-- Per-person chat archive. A chat stays archived for that person until a new
-- message arrives after archived_at.

ALTER TABLE public.chat_members
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_members.archived_at IS
  'When this member archived the chat; it shows again once a newer message arrives.';
