-- Guest profile/photos on reviews + per-venue reply templates.

ALTER TABLE public.sentiment_reviews
  ADD COLUMN IF NOT EXISTS author_profile_url TEXT,
  ADD COLUMN IF NOT EXISTS author_is_local_guide BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS author_review_count INT,
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.sentiment_reply_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sentiment_reply_templates_venue_name_unique UNIQUE (venue_id, name)
);

CREATE INDEX IF NOT EXISTS sentiment_reply_templates_venue_idx
  ON public.sentiment_reply_templates (venue_id, sort_order);

CREATE TRIGGER sentiment_reply_templates_set_updated_at
  BEFORE UPDATE ON public.sentiment_reply_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sentiment_reply_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sentiment_reply_templates_select"
  ON public.sentiment_reply_templates FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'reviews', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'settings', 'view', venue_id)
  );

GRANT SELECT ON public.sentiment_reply_templates TO authenticated;
