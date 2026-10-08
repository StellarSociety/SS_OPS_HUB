-- Supplier document numbers may legitimately repeat (e.g. two documents under
-- one reference). Duplicates are allowed and surfaced in Expenses → Alerts and
-- in a warning dialog on entry, instead of being blocked by the database.

ALTER TABLE public.ap_invoices
  DROP CONSTRAINT IF EXISTS ap_invoices_supplier_invoice_unique;
DROP INDEX IF EXISTS public.ap_invoices_supplier_delivery_note_unique;

CREATE INDEX IF NOT EXISTS ap_invoices_supplier_invoice_no_idx
  ON public.ap_invoices (entity_id, supplier_id, supplier_invoice_no);
CREATE INDEX IF NOT EXISTS ap_invoices_supplier_delivery_note_no_idx
  ON public.ap_invoices (entity_id, supplier_id, delivery_note_no)
  WHERE delivery_note_no IS NOT NULL;
