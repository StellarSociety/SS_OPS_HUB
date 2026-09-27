-- Add OPEX general suppliers between COS (F&B) and OPEX contractors.

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_kind_check;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_kind_check
  CHECK (kind IN ('cos', 'opex_general', 'opex'));
