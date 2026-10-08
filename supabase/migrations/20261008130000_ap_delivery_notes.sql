-- Delivery notes: carry their own delivery note number and may be saved
-- before the supplier's invoice number is known (added later).

ALTER TABLE public.ap_invoices
  ADD COLUMN IF NOT EXISTS delivery_note_no TEXT;

ALTER TABLE public.ap_invoices
  ALTER COLUMN supplier_invoice_no DROP NOT NULL;

-- Store "no invoice number yet" as NULL so the per-supplier uniqueness
-- doesn't collide on empty strings.
UPDATE public.ap_invoices
  SET supplier_invoice_no = NULL
  WHERE btrim(supplier_invoice_no) = '';

ALTER TABLE public.ap_invoices
  DROP CONSTRAINT IF EXISTS ap_invoices_number_by_type_check;
ALTER TABLE public.ap_invoices
  ADD CONSTRAINT ap_invoices_number_by_type_check CHECK (
    CASE document_type
      WHEN 'delivery_note' THEN coalesce(btrim(delivery_note_no), '') <> ''
      ELSE coalesce(btrim(supplier_invoice_no), '') <> ''
    END
  );

CREATE UNIQUE INDEX IF NOT EXISTS ap_invoices_supplier_delivery_note_unique
  ON public.ap_invoices (entity_id, supplier_id, delivery_note_no)
  WHERE delivery_note_no IS NOT NULL;
