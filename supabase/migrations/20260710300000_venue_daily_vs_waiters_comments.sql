-- Daily vs Waiters — per-day reconciliation comments

CREATE TABLE public.venue_daily_vs_waiters_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  comment_text TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, sale_date)
);

CREATE INDEX venue_daily_vs_waiters_comments_venue_date_idx
  ON public.venue_daily_vs_waiters_comments (venue_id, sale_date DESC);

CREATE TRIGGER venue_daily_vs_waiters_comments_set_updated_at
  BEFORE UPDATE ON public.venue_daily_vs_waiters_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_daily_vs_waiters_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_daily_vs_waiters_comments_select"
  ON public.venue_daily_vs_waiters_comments FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'view', venue_id
    )
    AND public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_daily_vs_waiters_comments_insert"
  ON public.venue_daily_vs_waiters_comments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
    AND public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_vs_waiters_comments_update"
  ON public.venue_daily_vs_waiters_comments FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
    AND public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
    AND public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_vs_waiters_comments_delete"
  ON public.venue_daily_vs_waiters_comments FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
    AND public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
  );
