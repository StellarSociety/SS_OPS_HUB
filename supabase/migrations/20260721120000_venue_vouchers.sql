-- Venue voucher ledger — track individual issued / redeemed gift vouchers.
-- Tender totals (Voucher Issue / Voucher Redeem) remain the POS source of truth
-- for daily amounts; this table holds the per-voucher detail and outstanding liability.

CREATE TABLE public.venue_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  voucher_number TEXT NOT NULL,
  voucher_name TEXT NOT NULL DEFAULT '',
  face_value_gs NUMERIC(14, 2) NOT NULL DEFAULT 0
    CHECK (face_value_gs >= 0),
  status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'redeemed', 'cancelled', 'expired')),
  issued_date DATE NOT NULL,
  redeemed_date DATE,
  expires_date DATE,
  purchaser_name TEXT NOT NULL DEFAULT '',
  recipient_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'waiter_comment', 'import')),
  source_waiter_sales_id UUID
    REFERENCES public.venue_waiter_daily_sales(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, voucher_number),
  CONSTRAINT venue_vouchers_redeemed_date_check CHECK (
    (status = 'redeemed' AND redeemed_date IS NOT NULL)
    OR (status <> 'redeemed' AND redeemed_date IS NULL)
  )
);

CREATE INDEX venue_vouchers_venue_status_idx
  ON public.venue_vouchers (venue_id, status);

CREATE INDEX venue_vouchers_venue_issued_idx
  ON public.venue_vouchers (venue_id, issued_date DESC);

CREATE INDEX venue_vouchers_venue_redeemed_idx
  ON public.venue_vouchers (venue_id, redeemed_date DESC NULLS LAST);

CREATE TRIGGER venue_vouchers_set_updated_at
  BEFORE UPDATE ON public.venue_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venue_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_vouchers_select"
  ON public.venue_vouchers FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'vouchers', 'view', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'view', venue_id
    )
  );

CREATE POLICY "venue_vouchers_insert"
  ON public.venue_vouchers FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'vouchers', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_vouchers_update"
  ON public.venue_vouchers FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'vouchers', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  )
  WITH CHECK (
    public.has_feature_permission(
      auth.uid(), 'sales', 'vouchers', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );

CREATE POLICY "venue_vouchers_delete"
  ON public.venue_vouchers FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(
      auth.uid(), 'sales', 'vouchers', 'edit', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'sales', 'venue_daily', 'edit', venue_id
    )
  );
