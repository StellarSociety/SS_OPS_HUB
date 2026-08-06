-- Staff email thread messages (outbound + inbound replies) for the communications trail.

CREATE TABLE IF NOT EXISTS public.hr_email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL,
  direction TEXT NOT NULL
    CHECK (direction IN ('outbound', 'inbound')),
  rfc_message_id TEXT NOT NULL,
  in_reply_to TEXT,
  references_header TEXT,
  subject TEXT NOT NULL DEFAULT '',
  from_email TEXT,
  to_email TEXT NOT NULL DEFAULT '',
  body_text TEXT,
  body_html TEXT,
  source_kind TEXT,
  source_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hr_email_messages_venue_rfc_unique UNIQUE (venue_id, rfc_message_id)
);

CREATE INDEX IF NOT EXISTS hr_email_messages_staff_occurred_idx
  ON public.hr_email_messages (venue_id, staff_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS hr_email_messages_thread_idx
  ON public.hr_email_messages (thread_id, occurred_at ASC);

CREATE INDEX IF NOT EXISTS hr_email_messages_source_idx
  ON public.hr_email_messages (venue_id, source_kind, source_id)
  WHERE source_kind IS NOT NULL AND source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.hr_email_sync_state (
  venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  mailbox TEXT NOT NULL DEFAULT '',
  last_uid BIGINT NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hr_email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_email_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_email_messages_select" ON public.hr_email_messages;
CREATE POLICY "hr_email_messages_select"
  ON public.hr_email_messages FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_email_messages_write" ON public.hr_email_messages;
CREATE POLICY "hr_email_messages_write"
  ON public.hr_email_messages FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_email_sync_state_select" ON public.hr_email_sync_state;
CREATE POLICY "hr_email_sync_state_select"
  ON public.hr_email_sync_state FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_email_sync_state_write" ON public.hr_email_sync_state;
CREATE POLICY "hr_email_sync_state_write"
  ON public.hr_email_sync_state FOR ALL TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());
