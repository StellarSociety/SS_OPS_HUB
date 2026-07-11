-- SS Ops Hub — Daily total tenders (venue-level POS tender totals per day)
-- Managers enter the actual daily total collected per tender; this is
-- reconciled against the sum of the same tender across all waiter entries.

CREATE TABLE public.venue_daily_tender_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  tender_id UUID NOT NULL REFERENCES public.venue_tenders(id) ON DELETE RESTRICT,
  amount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, sale_date, tender_id)
);

CREATE INDEX venue_daily_tender_totals_venue_date_idx
  ON public.venue_daily_tender_totals (venue_id, sale_date DESC);

CREATE TRIGGER venue_daily_tender_totals_set_updated_at
  BEFORE UPDATE ON public.venue_daily_tender_totals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_daily_tender_totals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_daily_tender_totals_select"
  ON public.venue_daily_tender_totals FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_daily_tender_totals_insert"
  ON public.venue_daily_tender_totals FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_tender_totals_update"
  ON public.venue_daily_tender_totals FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_daily_tender_totals_delete"
  ON public.venue_daily_tender_totals FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );
