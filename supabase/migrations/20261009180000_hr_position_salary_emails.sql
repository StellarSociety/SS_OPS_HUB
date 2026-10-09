-- Promotion / demotion / increment / decrement letters sent or scheduled from
-- Staff → Promotions, one row per email.

CREATE TABLE IF NOT EXISTS public.hr_position_salary_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  change_id UUID NOT NULL
    REFERENCES public.hr_staff_position_salary_changes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('promotion', 'demotion', 'increment', 'decrement')),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sent', 'cancelled')),
  -- 'scheduled' while waiting, 'sending' while claimed, then the provider used.
  provider TEXT NOT NULL DEFAULT 'scheduled',
  to_email TEXT NOT NULL DEFAULT '',
  from_email TEXT,
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  requires_acknowledgement BOOLEAN NOT NULL DEFAULT false,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_position_salary_emails_venue_change_idx
  ON public.hr_position_salary_emails (venue_id, change_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hr_position_salary_emails_due_idx
  ON public.hr_position_salary_emails (scheduled_at)
  WHERE status = 'scheduled';

ALTER TABLE public.hr_position_salary_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_position_salary_emails_select"
  ON public.hr_position_salary_emails;
CREATE POLICY "hr_position_salary_emails_select"
  ON public.hr_position_salary_emails FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_position_salary_emails_write"
  ON public.hr_position_salary_emails;
CREATE POLICY "hr_position_salary_emails_write"
  ON public.hr_position_salary_emails FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );
