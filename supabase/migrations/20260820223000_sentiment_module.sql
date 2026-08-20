-- Sentiment module: guest review sources + imported reviews.
-- Unlock the app globally and enable it for every venue-scoped venue.

UPDATE public.app_module_states
SET state = 'live',
    updated_at = now()
WHERE module_key = 'sentiment';

INSERT INTO public.app_module_states (module_key, state)
VALUES ('sentiment', 'live')
ON CONFLICT (module_key) DO UPDATE
SET state = 'live',
    updated_at = now();

INSERT INTO public.venue_modules (venue_id, module_key, enabled)
SELECT v.id, 'sentiment', true
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id, module_key) DO UPDATE SET enabled = true;

CREATE TABLE IF NOT EXISTS public.sentiment_review_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('google', 'tripadvisor')),
  label TEXT NOT NULL DEFAULT 'Google',
  external_account_id TEXT,
  external_location_id TEXT,
  place_id TEXT,
  location_name TEXT,
  location_url TEXT,
  account_email TEXT,
  refresh_token_encrypted TEXT,
  access_token_encrypted TEXT,
  access_token_expires_at TIMESTAMPTZ,
  connected_via_oauth BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'pending', 'connected', 'error')),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  rating_average NUMERIC(3, 2),
  review_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sentiment_review_sources_venue_channel_unique UNIQUE (venue_id, channel)
);

CREATE INDEX IF NOT EXISTS sentiment_review_sources_venue_idx
  ON public.sentiment_review_sources (venue_id);

CREATE TABLE IF NOT EXISTS public.sentiment_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sentiment_review_sources (id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('google', 'tripadvisor')),
  external_id TEXT NOT NULL,
  author_name TEXT,
  author_photo_url TEXT,
  rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  comment TEXT,
  reviewed_at TIMESTAMPTZ,
  language TEXT,
  reply_text TEXT,
  reply_at TIMESTAMPTZ,
  review_url TEXT,
  raw JSONB,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'replied', 'ignored')),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sentiment_reviews_source_external_unique UNIQUE (source_id, external_id)
);

CREATE INDEX IF NOT EXISTS sentiment_reviews_venue_reviewed_idx
  ON public.sentiment_reviews (venue_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS sentiment_reviews_channel_idx
  ON public.sentiment_reviews (venue_id, channel);

CREATE TRIGGER sentiment_review_sources_set_updated_at
  BEFORE UPDATE ON public.sentiment_review_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER sentiment_reviews_set_updated_at
  BEFORE UPDATE ON public.sentiment_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sentiment_review_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentiment_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sentiment_review_sources_select"
  ON public.sentiment_review_sources FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'reviews', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'settings', 'view', venue_id)
  );

CREATE POLICY "sentiment_reviews_select"
  ON public.sentiment_reviews FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'reviews', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'settings', 'view', venue_id)
  );

GRANT SELECT (
  id,
  venue_id,
  channel,
  label,
  external_account_id,
  external_location_id,
  place_id,
  location_name,
  location_url,
  account_email,
  connected_via_oauth,
  status,
  last_synced_at,
  last_error,
  rating_average,
  review_count,
  created_at,
  updated_at
) ON public.sentiment_review_sources TO authenticated;

GRANT SELECT ON public.sentiment_reviews TO authenticated;
