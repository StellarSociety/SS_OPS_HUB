-- SS Ops Hub — Venue cash journal (manual withdraw / expenses / deposit per day)
-- Open till, closing till, and total cash sales stay synced from Daily Snap + tender totals.

CREATE TABLE public.venue_cash_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  cash_withdraw_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cash_expenses_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cash_deposit_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, sale_date)
);

CREATE INDEX venue_cash_journal_venue_date_idx
  ON public.venue_cash_journal (venue_id, sale_date DESC);

CREATE TRIGGER venue_cash_journal_set_updated_at
  BEFORE UPDATE ON public.venue_cash_journal
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_cash_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_cash_journal_select"
  ON public.venue_cash_journal FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'view', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_cash_journal_insert"
  ON public.venue_cash_journal FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_cash_journal_update"
  ON public.venue_cash_journal FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_cash_journal_delete"
  ON public.venue_cash_journal FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'cash_up', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );
