-- Split AP suppliers into COS (F&B) and OPEX (contractors).
-- Existing rows stay COS: that is the historical purchase-invoice list.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'cos';

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_kind_check;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_kind_check CHECK (kind IN ('cos', 'opex'));

CREATE INDEX IF NOT EXISTS suppliers_venue_kind_name_idx
  ON public.suppliers (venue_id, kind, name);
