-- Expenses → Suppliers Totals: the venue's shared list of supplier columns.
-- Read/written server-side (service role) after AP permission checks.
CREATE TABLE IF NOT EXISTS public.ap_supplier_totals_settings (
  venue_id UUID PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  supplier_ids UUID[] NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ap_supplier_totals_settings ENABLE ROW LEVEL SECURITY;
