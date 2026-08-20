-- Store a 0–100 sentiment score, label, and topic tags on each imported review.

ALTER TABLE public.sentiment_reviews
  ADD COLUMN IF NOT EXISTS sentiment_label TEXT
    CHECK (sentiment_label IS NULL OR sentiment_label IN ('positive', 'neutral', 'mixed', 'negative')),
  ADD COLUMN IF NOT EXISTS sentiment_score SMALLINT
    CHECK (sentiment_score IS NULL OR sentiment_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS sentiment_topics TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sentiment_analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sentiment_reviews_venue_label_idx
  ON public.sentiment_reviews (venue_id, sentiment_label);
