-- SS Ops Hub — Venue waiters (roster for waiter sales)

CREATE TYPE public.venue_waiter_status AS ENUM ('active', 'inactive');

CREATE TABLE public.venue_waiters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '',
  status public.venue_waiter_status NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_waiters_name_not_blank CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX venue_waiters_venue_name_unique_idx
  ON public.venue_waiters (venue_id, lower(trim(name)));

CREATE INDEX venue_waiters_venue_status_idx
  ON public.venue_waiters (venue_id, status);

CREATE TRIGGER venue_waiters_set_updated_at
  BEFORE UPDATE ON public.venue_waiters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_waiters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_waiters_select"
  ON public.venue_waiters FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'view', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_waiters_insert"
  ON public.venue_waiters FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_waiters_update"
  ON public.venue_waiters FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_waiters_delete"
  ON public.venue_waiters FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );
