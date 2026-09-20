-- Hub Terms & Conditions acknowledgements for web and mobile app users.
-- One row per user / venue / terms version. Users insert their own acceptance;
-- Communications (or Staff view) can read venue records.

CREATE TABLE IF NOT EXISTS public.hub_terms_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  client TEXT NOT NULL DEFAULT 'web'
    CHECK (client IN ('web', 'mobile')),
  user_email TEXT NOT NULL DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hub_terms_acknowledgements_user_venue_version_idx
  ON public.hub_terms_acknowledgements (user_id, venue_id, terms_version);

CREATE INDEX IF NOT EXISTS hub_terms_acknowledgements_venue_version_idx
  ON public.hub_terms_acknowledgements (venue_id, terms_version, accepted_at DESC);

ALTER TABLE public.hub_terms_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hub_terms_acknowledgements_select" ON public.hub_terms_acknowledgements;
CREATE POLICY "hub_terms_acknowledgements_select"
  ON public.hub_terms_acknowledgements FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'communications', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hub_terms_acknowledgements_insert" ON public.hub_terms_acknowledgements;
CREATE POLICY "hub_terms_acknowledgements_insert"
  ON public.hub_terms_acknowledgements FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.hub_terms_acknowledgements IS
  'Read-and-understood acknowledgements of SS Ops Hub Terms & Conditions. Required before using web or mobile.';

GRANT SELECT, INSERT ON public.hub_terms_acknowledgements TO authenticated;
GRANT ALL ON public.hub_terms_acknowledgements TO service_role;
