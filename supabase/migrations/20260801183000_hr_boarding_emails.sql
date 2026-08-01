-- Durable boarding / offboarding notice email records (draft + sent).

CREATE TABLE IF NOT EXISTS public.hr_boarding_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  -- Optional link to a future offboarding process row (client UUID until processes are persisted).
  process_id UUID,
  action TEXT NOT NULL
    CHECK (action IN ('resignation_confirm', 'termination_notice')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent')),
  to_email TEXT NOT NULL DEFAULT '',
  from_email TEXT,
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  template_id TEXT NOT NULL DEFAULT '',
  template_name TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'draft',
  -- When the draft was last saved, or when the email was sent.
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_boarding_emails_venue_staff_idx
  ON public.hr_boarding_emails (venue_id, staff_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS hr_boarding_emails_process_idx
  ON public.hr_boarding_emails (process_id)
  WHERE process_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hr_boarding_emails_venue_status_idx
  ON public.hr_boarding_emails (venue_id, status, recorded_at DESC);

ALTER TABLE public.hr_boarding_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_boarding_emails_select" ON public.hr_boarding_emails;
CREATE POLICY "hr_boarding_emails_select"
  ON public.hr_boarding_emails FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_boarding_emails_write" ON public.hr_boarding_emails;
CREATE POLICY "hr_boarding_emails_write"
  ON public.hr_boarding_emails FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );
