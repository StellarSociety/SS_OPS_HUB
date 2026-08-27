-- Live Display: public iPad screen for the restaurant floor, plus a shareable link.

CREATE TABLE IF NOT EXISTS public.live_display_settings (
  venue_id UUID PRIMARY KEY REFERENCES public.venues (id) ON DELETE CASCADE,
  public_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS live_display_settings_public_code_lower_idx
  ON public.live_display_settings (lower(public_code));

DROP TRIGGER IF EXISTS live_display_settings_set_updated_at ON public.live_display_settings;
CREATE TRIGGER live_display_settings_set_updated_at
  BEFORE UPDATE ON public.live_display_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.live_display_settings (venue_id, public_code)
SELECT
  v.id,
  upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6))
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id) DO NOTHING;

INSERT INTO public.user_permissions (
  user_id, venue_id, module_key, feature_key, access_level
)
SELECT DISTINCT ON (up.user_id, up.venue_id)
  up.user_id,
  up.venue_id,
  'sentiment',
  'live_display',
  up.access_level
FROM public.user_permissions up
WHERE up.module_key = 'sentiment'
  AND up.feature_key IN ('overview', 'reviews', 'guest_feedback', 'actions')
ORDER BY
  up.user_id,
  up.venue_id,
  CASE up.access_level
    WHEN 'admin' THEN 1
    WHEN 'edit' THEN 2
    WHEN 'view' THEN 3
    ELSE 4
  END
ON CONFLICT (user_id, venue_id, module_key, feature_key) DO NOTHING;

ALTER TABLE public.live_display_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_display_settings_select" ON public.live_display_settings;
CREATE POLICY "live_display_settings_select"
  ON public.live_display_settings FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'live_display', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'reviews', 'view', venue_id)
  );

GRANT SELECT ON public.live_display_settings TO authenticated;
GRANT ALL ON public.live_display_settings TO service_role;
