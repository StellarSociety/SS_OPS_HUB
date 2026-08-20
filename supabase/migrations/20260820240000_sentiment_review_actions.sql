-- Internal follow-up / incident actions on guest reviews.

CREATE TABLE IF NOT EXISTS public.sentiment_review_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  review_id UUID NOT NULL REFERENCES public.sentiment_reviews (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'not_required')),
  what_happened TEXT,
  action_plan TEXT,
  recovery_tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sentiment_review_actions_review_unique UNIQUE (review_id)
);

CREATE INDEX IF NOT EXISTS sentiment_review_actions_venue_status_idx
  ON public.sentiment_review_actions (venue_id, status);

CREATE TRIGGER sentiment_review_actions_set_updated_at
  BEFORE UPDATE ON public.sentiment_review_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sentiment_review_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sentiment_review_actions_select"
  ON public.sentiment_review_actions FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'reviews', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'actions', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'settings', 'view', venue_id)
  );

GRANT SELECT ON public.sentiment_review_actions TO authenticated;
