-- Store the Google Places API key on the venue Google source (encrypted).
-- Authenticated clients only see a boolean flag, never the secret.

ALTER TABLE public.sentiment_review_sources
  ADD COLUMN IF NOT EXISTS places_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS has_places_api_key BOOLEAN NOT NULL DEFAULT false;

GRANT SELECT (has_places_api_key) ON public.sentiment_review_sources TO authenticated;
