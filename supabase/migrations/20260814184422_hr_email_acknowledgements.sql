-- Durable HR email acknowledgement records (pending / acknowledged / not_acknowledged).
-- Public employee submit uses the service role (token lookup); no anon write policies.
-- Page template copy stays in hr_venue_settings key 'acknowledgement_page'.

CREATE TABLE IF NOT EXISTS public.hr_email_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  staff_name TEXT NOT NULL DEFAULT '',
  emp_no TEXT,
  recipient_email TEXT,
  email_kind TEXT NOT NULL DEFAULT 'email',
  email_kind_label TEXT NOT NULL DEFAULT 'Email',
  subject TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'acknowledged', 'not_acknowledged')),
  comments TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_email_acknowledgements_venue_sent_idx
  ON public.hr_email_acknowledgements (venue_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS hr_email_acknowledgements_venue_status_idx
  ON public.hr_email_acknowledgements (venue_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS hr_email_acknowledgements_staff_idx
  ON public.hr_email_acknowledgements (staff_id)
  WHERE staff_id IS NOT NULL;

ALTER TABLE public.hr_email_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_email_acknowledgements_select" ON public.hr_email_acknowledgements;
CREATE POLICY "hr_email_acknowledgements_select"
  ON public.hr_email_acknowledgements FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_email_acknowledgements_write" ON public.hr_email_acknowledgements;
CREATE POLICY "hr_email_acknowledgements_write"
  ON public.hr_email_acknowledgements FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

COMMENT ON TABLE public.hr_email_acknowledgements IS
  'One row per sent HR email that required acknowledgement. Token is the public /acknowledge/<token> lookup key.';

-- Move any JSON records that were temporarily stored in hr_venue_settings.
INSERT INTO public.hr_email_acknowledgements (
  token,
  venue_id,
  staff_id,
  staff_name,
  emp_no,
  recipient_email,
  email_kind,
  email_kind_label,
  subject,
  status,
  comments,
  sent_at,
  responded_at
)
SELECT
  COALESCE(
    NULLIF(btrim(s.value->>'token'), ''),
    substring(s.key FROM length('acknowledgement_record:') + 1)
  ) AS token,
  s.venue_id,
  st.id AS staff_id,
  COALESCE(NULLIF(btrim(s.value->>'staffName'), ''), 'Unknown'),
  NULLIF(btrim(s.value->>'empNo'), ''),
  NULLIF(btrim(s.value->>'recipientEmail'), ''),
  COALESCE(NULLIF(btrim(s.value->>'emailKind'), ''), 'email'),
  COALESCE(
    NULLIF(btrim(s.value->>'emailKindLabel'), ''),
    NULLIF(btrim(s.value->>'emailKind'), ''),
    'Email'
  ),
  COALESCE(NULLIF(btrim(s.value->>'subject'), ''), '(No subject)'),
  CASE
    WHEN s.value->>'status' IN ('acknowledged', 'not_acknowledged')
      THEN s.value->>'status'
    ELSE 'pending'
  END,
  COALESCE(s.value->>'comments', ''),
  COALESCE(
    CASE
      WHEN (s.value->>'sentAt') ~ '^\d{4}-\d{2}-\d{2}'
        THEN (s.value->>'sentAt')::timestamptz
      ELSE NULL
    END,
    s.updated_at,
    now()
  ),
  CASE
    WHEN (s.value->>'respondedAt') ~ '^\d{4}-\d{2}-\d{2}'
      THEN (s.value->>'respondedAt')::timestamptz
    ELSE NULL
  END
FROM public.hr_venue_settings s
LEFT JOIN public.staff st
  ON st.id = CASE
    WHEN NULLIF(btrim(s.value->>'staffId'), '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN (s.value->>'staffId')::uuid
    ELSE NULL
  END
WHERE s.key LIKE 'acknowledgement_record:%'
  AND COALESCE(
    NULLIF(btrim(s.value->>'token'), ''),
    substring(s.key FROM length('acknowledgement_record:') + 1)
  ) <> ''
ON CONFLICT (token) DO NOTHING;

DELETE FROM public.hr_venue_settings
WHERE key LIKE 'acknowledgement_record:%';
