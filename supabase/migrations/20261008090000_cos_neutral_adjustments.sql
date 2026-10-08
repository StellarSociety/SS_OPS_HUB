-- GP & COS: neutral adjustments — recorded on the cost run for reference but
-- excluded from cost of sales.

-- Adjustment kinds: allow a NEU (neutral) default side.
DO $$
DECLARE c TEXT;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'public.venue_cos_adjustment_kinds'::regclass
    AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%default_side%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.venue_cos_adjustment_kinds DROP CONSTRAINT %I', c);
  END IF;
END $$;
ALTER TABLE public.venue_cos_adjustment_kinds
  ADD CONSTRAINT venue_cos_adjustment_kinds_default_side_check
  CHECK (default_side IN ('DB', 'CR', 'NEU'));

-- Cost-run adjustments: 'neutral' rows don't count towards cost of sales.
ALTER TABLE public.venue_cos_adjustments
  DROP CONSTRAINT IF EXISTS venue_cos_adjustments_source_check;
ALTER TABLE public.venue_cos_adjustments
  ADD CONSTRAINT venue_cos_adjustments_source_check
  CHECK (source IN ('manual', 'auto_discount', 'stock', 'other', 'transfer', 'neutral'));
