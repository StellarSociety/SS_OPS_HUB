-- Practice reviews + reply posting state.

ALTER TABLE public.sentiment_reviews
  ADD COLUMN IF NOT EXISTS is_practice BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_sync_status TEXT
    CHECK (reply_sync_status IS NULL OR reply_sync_status IN ('local', 'posted', 'error')),
  ADD COLUMN IF NOT EXISTS reply_sync_error TEXT;

CREATE INDEX IF NOT EXISTS sentiment_reviews_practice_idx
  ON public.sentiment_reviews (venue_id, is_practice)
  WHERE is_practice;
