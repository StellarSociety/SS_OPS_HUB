-- Organisation-level branding for the Stellar Society Group logo (login + global settings).

CREATE TABLE IF NOT EXISTS public.group_branding (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  logo_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

COMMENT ON TABLE public.group_branding IS
  'Singleton organisation branding. Logo is shown on sign-in and can be replaced from Global settings.';

ALTER TABLE public.group_branding ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.group_branding FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.group_branding TO authenticated;
GRANT ALL ON TABLE public.group_branding TO service_role;

DROP POLICY IF EXISTS "group_branding_select_authenticated" ON public.group_branding;
CREATE POLICY "group_branding_select_authenticated"
  ON public.group_branding
  FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.group_branding (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
