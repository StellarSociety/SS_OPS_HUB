-- AP documents: invoice (default), delivery note or credit note.
-- Credit notes store their line and header amounts as negatives.

ALTER TABLE public.ap_invoices
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'invoice';

ALTER TABLE public.ap_invoices
  DROP CONSTRAINT IF EXISTS ap_invoices_document_type_check;
ALTER TABLE public.ap_invoices
  ADD CONSTRAINT ap_invoices_document_type_check
  CHECK (document_type IN ('invoice', 'delivery_note', 'credit_note'));

-- A supplier's credit note can reuse a number from its invoice series, so
-- uniqueness is per document type.
ALTER TABLE public.ap_invoices
  DROP CONSTRAINT IF EXISTS ap_invoices_supplier_invoice_unique;
ALTER TABLE public.ap_invoices
  ADD CONSTRAINT ap_invoices_supplier_invoice_unique
  UNIQUE (entity_id, supplier_id, document_type, supplier_invoice_no);
