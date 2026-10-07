-- GP & COS settings: approvers per cost centre, adjustment kinds, transfers.

-- 1. Approvers ---------------------------------------------------------------
ALTER TABLE public.venue_cos_settings
  ADD COLUMN IF NOT EXISTS approver_user_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.venue_cos_settings.approver_user_ids IS
  'profiles.id list notified (and allowed) to approve this cost centre''s cost runs.';

-- 2. Adjustment kinds -------------------------------------------------------
-- default_side: 'DB' = (+) addition (raises cost of sales),
--               'CR' = (-) deduction (lowers cost of sales).
CREATE TABLE IF NOT EXISTS public.venue_cos_adjustment_kinds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  ledger_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  default_side TEXT NOT NULL DEFAULT 'CR' CHECK (default_side IN ('DB', 'CR')),
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name)
);

DROP TRIGGER IF EXISTS venue_cos_adjustment_kinds_set_updated_at
  ON public.venue_cos_adjustment_kinds;
CREATE TRIGGER venue_cos_adjustment_kinds_set_updated_at
  BEFORE UPDATE ON public.venue_cos_adjustment_kinds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Transfers between cost centres (NET purchase value) --------------------
CREATE TABLE IF NOT EXISTS public.venue_cos_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  transfer_date DATE NOT NULL,
  from_centre TEXT NOT NULL CHECK (from_centre IN ('food', 'beverage', 'wine', 'other')),
  to_centre TEXT NOT NULL CHECK (to_centre IN ('food', 'beverage', 'wine', 'other')),
  amount_net NUMERIC(14, 2) NOT NULL CHECK (amount_net > 0),
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_centre <> to_centre)
);

CREATE INDEX IF NOT EXISTS venue_cos_transfers_venue_date_idx
  ON public.venue_cos_transfers (venue_id, transfer_date);

DROP TRIGGER IF EXISTS venue_cos_transfers_set_updated_at
  ON public.venue_cos_transfers;
CREATE TRIGGER venue_cos_transfers_set_updated_at
  BEFORE UPDATE ON public.venue_cos_transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Cost-run adjustments may come from a transfer --------------------------
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.venue_cos_adjustments'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%source%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.venue_cos_adjustments DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.venue_cos_adjustments
  ADD CONSTRAINT venue_cos_adjustments_source_check
  CHECK (source IN ('manual', 'auto_discount', 'stock', 'other', 'transfer'));

-- RLS: read with margins:view, write with settings:edit (same as settings).
ALTER TABLE public.venue_cos_adjustment_kinds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_cos_transfers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['venue_cos_adjustment_kinds', 'venue_cos_transfers'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.has_feature_permission(auth.uid(), ''gp_cos'', ''margins'', ''view'', venue_id))',
      t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.has_feature_permission(auth.uid(), ''gp_cos'', ''settings'', ''edit'', venue_id))',
      t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.has_feature_permission(auth.uid(), ''gp_cos'', ''settings'', ''edit'', venue_id))
         WITH CHECK (public.has_feature_permission(auth.uid(), ''gp_cos'', ''settings'', ''edit'', venue_id))',
      t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (public.has_feature_permission(auth.uid(), ''gp_cos'', ''settings'', ''edit'', venue_id))',
      t || '_delete', t);
  END LOOP;
END $$;
