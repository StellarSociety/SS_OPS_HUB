-- Request a staff member to write the "what happened" report on a review action.

ALTER TABLE public.sentiment_review_actions
  ADD COLUMN IF NOT EXISTS justification_requested_user_id UUID
    REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS justification_requested_name TEXT,
  ADD COLUMN IF NOT EXISTS justification_requested_by UUID
    REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS justification_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS justification_submitted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sentiment_review_actions_justification_user_idx
  ON public.sentiment_review_actions (justification_requested_user_id)
  WHERE justification_requested_user_id IS NOT NULL;

DROP POLICY IF EXISTS "sentiment_review_actions_select_assignee"
  ON public.sentiment_review_actions;

CREATE POLICY "sentiment_review_actions_select_assignee"
  ON public.sentiment_review_actions FOR SELECT TO authenticated
  USING (justification_requested_user_id = auth.uid());

DROP POLICY IF EXISTS "sentiment_reviews_select" ON public.sentiment_reviews;

CREATE POLICY "sentiment_reviews_select"
  ON public.sentiment_reviews FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'reviews', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'actions', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'sentiment', 'settings', 'view', venue_id)
    OR EXISTS (
      SELECT 1
      FROM public.sentiment_review_actions a
      WHERE a.review_id = sentiment_reviews.id
        AND a.justification_requested_user_id = auth.uid()
    )
  );
