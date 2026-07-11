-- SS Ops Hub — Venue tenders + waiter daily sales

CREATE TYPE public.venue_tender_status AS ENUM ('active', 'inactive');

-- ---------------------------------------------------------------------------
-- Configurable payment tenders per venue
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status public.venue_tender_status NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_tenders_name_not_blank CHECK (char_length(trim(name)) > 0)
);

CREATE UNIQUE INDEX venue_tenders_venue_name_unique_idx
  ON public.venue_tenders (venue_id, lower(trim(name)));

CREATE INDEX venue_tenders_venue_sort_idx
  ON public.venue_tenders (venue_id, sort_order, name);

CREATE TRIGGER venue_tenders_set_updated_at
  BEFORE UPDATE ON public.venue_tenders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Waiter daily sales (one row per waiter per date)
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_waiter_daily_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  waiter_id UUID NOT NULL REFERENCES public.venue_waiters(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  total_sales_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_payments_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gratuity_cc_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gratuity_cash_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_covers INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, waiter_id, sale_date)
);

CREATE INDEX venue_waiter_daily_sales_venue_date_idx
  ON public.venue_waiter_daily_sales (venue_id, sale_date DESC);

CREATE TRIGGER venue_waiter_daily_sales_set_updated_at
  BEFORE UPDATE ON public.venue_waiter_daily_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tender line amounts per waiter daily sales row
-- ---------------------------------------------------------------------------
CREATE TABLE public.venue_waiter_daily_tender_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_id UUID NOT NULL REFERENCES public.venue_waiter_daily_sales(id) ON DELETE CASCADE,
  tender_id UUID NOT NULL REFERENCES public.venue_tenders(id) ON DELETE RESTRICT,
  amount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  UNIQUE (sales_id, tender_id)
);

CREATE INDEX venue_waiter_daily_tender_lines_sales_idx
  ON public.venue_waiter_daily_tender_lines (sales_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.venue_tenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_waiter_daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_waiter_daily_tender_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_tenders_select"
  ON public.venue_tenders FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'view', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_tenders_insert"
  ON public.venue_tenders FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_tenders_update"
  ON public.venue_tenders FOR UPDATE TO authenticated
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

CREATE POLICY "venue_tenders_delete"
  ON public.venue_tenders FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_waiter_daily_sales_select"
  ON public.venue_waiter_daily_sales FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_waiter_daily_sales_insert"
  ON public.venue_waiter_daily_sales FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_waiter_daily_sales_update"
  ON public.venue_waiter_daily_sales FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_waiter_daily_sales_delete"
  ON public.venue_waiter_daily_sales FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'waiter_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_waiter_daily_tender_lines_select"
  ON public.venue_waiter_daily_tender_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_waiter_daily_sales s
      WHERE s.id = sales_id
        AND public.has_feature_permission(
          auth.uid(), 'sales', 'waiter_daily', 'view', s.venue_id
        )
    )
  );

CREATE POLICY "venue_waiter_daily_tender_lines_insert"
  ON public.venue_waiter_daily_tender_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venue_waiter_daily_sales s
      WHERE s.id = sales_id
        AND public.has_feature_permission(
          auth.uid(), 'sales', 'waiter_daily', 'edit', s.venue_id
        )
    )
  );

CREATE POLICY "venue_waiter_daily_tender_lines_update"
  ON public.venue_waiter_daily_tender_lines FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_waiter_daily_sales s
      WHERE s.id = sales_id
        AND public.has_feature_permission(
          auth.uid(), 'sales', 'waiter_daily', 'edit', s.venue_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venue_waiter_daily_sales s
      WHERE s.id = sales_id
        AND public.has_feature_permission(
          auth.uid(), 'sales', 'waiter_daily', 'edit', s.venue_id
        )
    )
  );

CREATE POLICY "venue_waiter_daily_tender_lines_delete"
  ON public.venue_waiter_daily_tender_lines FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.venue_waiter_daily_sales s
      WHERE s.id = sales_id
        AND public.has_feature_permission(
          auth.uid(), 'sales', 'waiter_daily', 'edit', s.venue_id
        )
    )
  );

-- Seed default tenders for existing venues
INSERT INTO public.venue_tenders (venue_id, name, sort_order)
SELECT v.id, d.name, d.sort_order
FROM public.venues v
CROSS JOIN (
  VALUES
    ('Visa', 1),
    ('Mastercard', 2),
    ('Amex', 3),
    ('Cash', 4),
    ('Qlab', 5),
    ('Voucher', 6),
    ('Deposit', 7),
    ('On Accounts', 8)
) AS d(name, sort_order)
WHERE NOT v.is_global
  AND NOT EXISTS (
    SELECT 1
    FROM public.venue_tenders t
    WHERE t.venue_id = v.id
      AND lower(trim(t.name)) = lower(trim(d.name))
  );
