-- Accounts Phase 2/3/5 slice: tax layer, journal posting engine tables,
-- suppliers + AP invoices (Accounts Payable). Writes via service role;
-- authenticated SELECT gated by accounting/ap feature access.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.acc_tax_treatment AS ENUM ('output', 'input', 'both', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.acc_journal_status AS ENUM (
    'draft', 'submitted', 'approved', 'posted', 'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.acc_journal_source AS ENUM (
    'manual', 'sales', 'ap', 'ar', 'payroll', 'inventory', 'fa', 'bank', 'fx', 'accrual'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.acc_ap_invoice_status AS ENUM (
    'draft', 'submitted', 'approved', 'posted', 'reversed', 'void'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Tax codes & rates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  treatment public.acc_tax_treatment NOT NULL DEFAULT 'none',
  input_recoverable BOOLEAN NOT NULL DEFAULT false,
  output_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  input_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  vat201_box TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_code_id UUID NOT NULL REFERENCES public.tax_codes(id) ON DELETE CASCADE,
  rate NUMERIC(10, 6) NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  CONSTRAINT tax_rates_range CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS tax_rates_lookup_idx
  ON public.tax_rates (tax_code_id, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS public.vat_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'filed')),
  box_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ,
  filed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vat_returns_period_unique UNIQUE (entity_id, period_from, period_to)
);

-- ---------------------------------------------------------------------------
-- Journal (posting engine)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  entry_no TEXT NOT NULL,
  entry_date DATE NOT NULL,
  period_id UUID NOT NULL REFERENCES public.fiscal_periods(id),
  memo TEXT,
  status public.acc_journal_status NOT NULL DEFAULT 'draft',
  source_type public.acc_journal_source NOT NULL DEFAULT 'manual',
  source_ref UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  reversal_of UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  reversed_by UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT journal_entries_entity_entry_no_unique UNIQUE (entity_id, entry_no)
);

CREATE INDEX IF NOT EXISTS journal_entries_venue_date_idx
  ON public.journal_entries (venue_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_entries_source_idx
  ON public.journal_entries (source_type, source_ref);
CREATE INDEX IF NOT EXISTS journal_entries_status_idx
  ON public.journal_entries (status);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  debit NUMERIC(14, 3) NOT NULL DEFAULT 0,
  credit NUMERIC(14, 3) NOT NULL DEFAULT 0,
  tax_code_id UUID REFERENCES public.tax_codes(id) ON DELETE SET NULL,
  description TEXT,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT journal_lines_entry_line_unique UNIQUE (journal_entry_id, line_no),
  CONSTRAINT journal_lines_amount_check CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

CREATE INDEX IF NOT EXISTS journal_lines_account_idx
  ON public.journal_lines (account_id);

CREATE TABLE IF NOT EXISTS public.journal_line_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_line_id UUID NOT NULL REFERENCES public.journal_lines(id) ON DELETE CASCADE,
  dimension_id UUID NOT NULL REFERENCES public.dimensions(id) ON DELETE CASCADE,
  dimension_value_id UUID NOT NULL REFERENCES public.dimension_values(id),
  CONSTRAINT journal_line_dimensions_unique UNIQUE (journal_line_id, dimension_id)
);

-- Balance enforcement when entry is posted
CREATE OR REPLACE FUNCTION public.enforce_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  total_debit NUMERIC(14, 3);
  total_credit NUMERIC(14, 3);
BEGIN
  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO total_debit, total_credit
    FROM public.journal_lines
    WHERE journal_entry_id = NEW.id;

    IF total_debit <> total_credit THEN
      RAISE EXCEPTION 'Journal entry % is unbalanced: debit % != credit %',
        NEW.id, total_debit, total_credit;
    END IF;
    IF total_debit = 0 THEN
      RAISE EXCEPTION 'Journal entry % has no lines', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_enforce_balance ON public.journal_entries;
CREATE TRIGGER journal_entries_enforce_balance
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_balance();

-- Posted journals are immutable (except linking reversed_by / status→reversed)
CREATE OR REPLACE FUNCTION public.enforce_journal_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    IF NEW.status = 'reversed'
       AND NEW.reversed_by IS NOT NULL
       AND NEW.entry_no = OLD.entry_no
       AND NEW.entry_date = OLD.entry_date
       AND NEW.memo IS NOT DISTINCT FROM OLD.memo
       AND NEW.source_type = OLD.source_type
       AND NEW.source_ref IS NOT DISTINCT FROM OLD.source_ref
       AND NEW.entity_id = OLD.entity_id
       AND NEW.venue_id = OLD.venue_id
       AND NEW.period_id = OLD.period_id
       AND NEW.posted_by IS NOT DISTINCT FROM OLD.posted_by
       AND NEW.posted_at IS NOT DISTINCT FROM OLD.posted_at
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Posted journal entries are immutable; reverse instead';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_immutability ON public.journal_entries;
CREATE TRIGGER journal_entries_immutability
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_immutability();

CREATE OR REPLACE FUNCTION public.enforce_journal_line_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  entry_status public.acc_journal_status;
BEGIN
  SELECT status INTO entry_status
  FROM public.journal_entries
  WHERE id = COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

  IF entry_status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'Cannot modify lines on a posted/reversed journal';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_lines_immutability ON public.journal_lines;
CREATE TRIGGER journal_lines_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_line_immutability();

CREATE OR REPLACE FUNCTION public.enforce_journal_account_postable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  ok BOOLEAN;
BEGIN
  SELECT a.is_postable AND a.active INTO ok
  FROM public.accounts a
  WHERE a.id = NEW.account_id;

  IF NOT COALESCE(ok, false) THEN
    RAISE EXCEPTION 'Account % is not a postable ledger account', NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_lines_postable_account ON public.journal_lines;
CREATE TRIGGER journal_lines_postable_account
  BEFORE INSERT OR UPDATE OF account_id ON public.journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_account_postable();

-- ---------------------------------------------------------------------------
-- Approval limits (A10)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_approval_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL DEFAULT 'ap',
  max_amount NUMERIC(14, 3), -- NULL = unlimited
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounting_approval_limits_unique UNIQUE (user_id, venue_id, feature_key)
);

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  name TEXT NOT NULL,
  trn TEXT,
  default_expense_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  payment_terms_days INT NOT NULL DEFAULT 30,
  default_tax_code_id UUID REFERENCES public.tax_codes(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_trn_digits CHECK (trn IS NULL OR trn ~ '^\d{15}$')
);

CREATE INDEX IF NOT EXISTS suppliers_venue_name_idx
  ON public.suppliers (venue_id, name);
CREATE INDEX IF NOT EXISTS suppliers_entity_idx
  ON public.suppliers (entity_id);

-- ---------------------------------------------------------------------------
-- AP invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ap_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.legal_entities(id),
  venue_id UUID NOT NULL REFERENCES public.venues(id),
  invoice_no TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  supplier_invoice_no TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  fx_rate NUMERIC(18, 8) NOT NULL DEFAULT 1,
  memo TEXT,
  status public.acc_ap_invoice_status NOT NULL DEFAULT 'draft',
  subtotal_net NUMERIC(14, 3) NOT NULL DEFAULT 0,
  tax_total NUMERIC(14, 3) NOT NULL DEFAULT 0,
  total_gross NUMERIC(14, 3) NOT NULL DEFAULT 0,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  attachment_url TEXT,
  rejection_reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ap_invoices_entity_invoice_no_unique UNIQUE (entity_id, invoice_no),
  CONSTRAINT ap_invoices_supplier_invoice_unique UNIQUE (entity_id, supplier_id, supplier_invoice_no)
);

CREATE INDEX IF NOT EXISTS ap_invoices_venue_status_idx
  ON public.ap_invoices (venue_id, status, invoice_date DESC);
CREATE INDEX IF NOT EXISTS ap_invoices_supplier_idx
  ON public.ap_invoices (supplier_id);
CREATE INDEX IF NOT EXISTS ap_invoices_due_date_idx
  ON public.ap_invoices (due_date);

CREATE TABLE IF NOT EXISTS public.ap_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ap_invoice_id UUID NOT NULL REFERENCES public.ap_invoices(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14, 3) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14, 3) NOT NULL DEFAULT 0,
  tax_code_id UUID NOT NULL REFERENCES public.tax_codes(id),
  tax_amount NUMERIC(14, 3) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(14, 3) NOT NULL DEFAULT 0,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ap_invoice_lines_unique UNIQUE (ap_invoice_id, line_no)
);

CREATE INDEX IF NOT EXISTS ap_invoice_lines_account_idx
  ON public.ap_invoice_lines (account_id);

-- Posted AP invoices are immutable
CREATE OR REPLACE FUNCTION public.enforce_ap_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    IF NEW.status = 'reversed'
       AND NEW.journal_entry_id IS NOT DISTINCT FROM OLD.journal_entry_id
       AND NEW.invoice_no = OLD.invoice_no
       AND NEW.supplier_id = OLD.supplier_id
       AND NEW.supplier_invoice_no = OLD.supplier_invoice_no
       AND NEW.subtotal_net = OLD.subtotal_net
       AND NEW.tax_total = OLD.tax_total
       AND NEW.total_gross = OLD.total_gross
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Posted AP invoices are immutable; reverse instead';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_invoices_immutability ON public.ap_invoices;
CREATE TRIGGER ap_invoices_immutability
  BEFORE UPDATE ON public.ap_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ap_invoice_immutability();

CREATE OR REPLACE FUNCTION public.enforce_ap_line_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  inv_status public.acc_ap_invoice_status;
BEGIN
  SELECT status INTO inv_status
  FROM public.ap_invoices
  WHERE id = COALESCE(NEW.ap_invoice_id, OLD.ap_invoice_id);

  IF inv_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Cannot modify lines on a % AP invoice', inv_status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_invoice_lines_immutability ON public.ap_invoice_lines;
CREATE TRIGGER ap_invoice_lines_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.ap_invoice_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ap_line_immutability();

-- updated_at triggers
DO $$ BEGIN
  CREATE TRIGGER tax_codes_set_updated_at
    BEFORE UPDATE ON public.tax_codes
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER journal_entries_set_updated_at
    BEFORE UPDATE ON public.journal_entries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER suppliers_set_updated_at
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER ap_invoices_set_updated_at
    BEFORE UPDATE ON public.ap_invoices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER accounting_approval_limits_set_updated_at
    BEFORE UPDATE ON public.accounting_approval_limits
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Seed tax codes (A7) + rates (A7b)
-- ---------------------------------------------------------------------------
INSERT INTO public.tax_codes (
  code, label, treatment, input_recoverable, output_account_id, input_account_id, vat201_box
)
SELECT v.code, v.label, v.treatment::public.acc_tax_treatment, v.recoverable,
  out_a.id, in_a.id, v.box
FROM (VALUES
  ('SR', 'Standard-rated 5% (output)', 'output', false, '2310', NULL, '1a'),
  ('ZR', 'Zero-rated (output)', 'output', false, NULL, NULL, '4'),
  ('EX', 'Exempt (output)', 'output', false, NULL, NULL, '5'),
  ('OS', 'Out of scope', 'none', false, NULL, NULL, NULL),
  ('RC', 'Reverse charge (imports)', 'both', true, '2310', '2320', '3+10'),
  ('BL', 'Blocked input (entertainment)', 'input', false, NULL, NULL, NULL),
  ('ZP', 'Zero-rated purchases', 'input', true, NULL, '2320', '9'),
  ('SP', 'Standard purchases 5%', 'input', true, NULL, '2320', '9')
) AS v(code, label, treatment, recoverable, out_code, in_code, box)
LEFT JOIN public.accounts out_a ON out_a.code = v.out_code
LEFT JOIN public.accounts in_a ON in_a.code = v.in_code
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label,
    treatment = EXCLUDED.treatment,
    input_recoverable = EXCLUDED.input_recoverable,
    output_account_id = EXCLUDED.output_account_id,
    input_account_id = EXCLUDED.input_account_id,
    vat201_box = EXCLUDED.vat201_box,
    updated_at = now();

INSERT INTO public.tax_rates (tax_code_id, rate, valid_from, valid_to)
SELECT tc.id, r.rate, r.valid_from::date, NULL
FROM public.tax_codes tc
JOIN (VALUES
  ('SR', 0.05, '2018-01-01'),
  ('SP', 0.05, '2018-01-01'),
  ('RC', 0.05, '2018-01-01'),
  ('ZR', 0, '2018-01-01'),
  ('ZP', 0, '2018-01-01'),
  ('EX', 0, '2018-01-01'),
  ('OS', 0, '2018-01-01'),
  ('BL', 0.05, '2018-01-01')
) AS r(code, rate, valid_from) ON r.code = tc.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.tax_rates tr
  WHERE tr.tax_code_id = tc.id AND tr.valid_from = r.valid_from::date
);

-- AP document sequence per entity
INSERT INTO public.sequences (entity_id, doc_type, prefix, padding, reset_rule, current_value)
SELECT e.id, 'AP', 'AP-', 6, 'yearly', 0
FROM public.legal_entities e
ON CONFLICT (entity_id, doc_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.tax_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vat_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_line_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_approval_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_accounting_ap_access(p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'accounting'
        AND up.feature_key = 'ap'
        AND up.access_level IN ('submit', 'view', 'edit', 'admin')
        AND (up.venue_id IS NULL OR up.venue_id = p_venue_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.has_accounting_gl_access(p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'accounting'
        AND up.feature_key IN ('gl', 'ap', 'ar', 'reports', 'tax')
        AND up.access_level IN ('submit', 'view', 'edit', 'admin')
        AND (up.venue_id IS NULL OR up.venue_id = p_venue_id)
    );
$$;

DROP POLICY IF EXISTS "tax_codes_select" ON public.tax_codes;
CREATE POLICY "tax_codes_select"
  ON public.tax_codes FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'accounting'
        AND up.access_level IN ('submit', 'view', 'edit', 'admin')
    )
  );

DROP POLICY IF EXISTS "tax_rates_select" ON public.tax_rates;
CREATE POLICY "tax_rates_select"
  ON public.tax_rates FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'accounting'
        AND up.access_level IN ('submit', 'view', 'edit', 'admin')
    )
  );

DROP POLICY IF EXISTS "vat_returns_select" ON public.vat_returns;
CREATE POLICY "vat_returns_select"
  ON public.vat_returns FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'accounting', 'tax', 'view', NULL)
  );

DROP POLICY IF EXISTS "journal_entries_select" ON public.journal_entries;
CREATE POLICY "journal_entries_select"
  ON public.journal_entries FOR SELECT TO authenticated
  USING (public.has_accounting_gl_access(venue_id));

DROP POLICY IF EXISTS "journal_lines_select" ON public.journal_lines;
CREATE POLICY "journal_lines_select"
  ON public.journal_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id
        AND public.has_accounting_gl_access(je.venue_id)
    )
  );

DROP POLICY IF EXISTS "journal_line_dimensions_select" ON public.journal_line_dimensions;
CREATE POLICY "journal_line_dimensions_select"
  ON public.journal_line_dimensions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.id = journal_line_id
        AND public.has_accounting_gl_access(je.venue_id)
    )
  );

DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
CREATE POLICY "suppliers_select"
  ON public.suppliers FOR SELECT TO authenticated
  USING (public.has_accounting_ap_access(venue_id));

DROP POLICY IF EXISTS "ap_invoices_select" ON public.ap_invoices;
CREATE POLICY "ap_invoices_select"
  ON public.ap_invoices FOR SELECT TO authenticated
  USING (public.has_accounting_ap_access(venue_id));

DROP POLICY IF EXISTS "ap_invoice_lines_select" ON public.ap_invoice_lines;
CREATE POLICY "ap_invoice_lines_select"
  ON public.ap_invoice_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ap_invoices inv
      WHERE inv.id = ap_invoice_id
        AND public.has_accounting_ap_access(inv.venue_id)
    )
  );

DROP POLICY IF EXISTS "accounting_approval_limits_select" ON public.accounting_approval_limits;
CREATE POLICY "accounting_approval_limits_select"
  ON public.accounting_approval_limits FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR user_id = auth.uid()
  );

GRANT SELECT ON public.tax_codes TO authenticated;
GRANT SELECT ON public.tax_rates TO authenticated;
GRANT SELECT ON public.vat_returns TO authenticated;
GRANT SELECT ON public.journal_entries TO authenticated;
GRANT SELECT ON public.journal_lines TO authenticated;
GRANT SELECT ON public.journal_line_dimensions TO authenticated;
GRANT SELECT ON public.suppliers TO authenticated;
GRANT SELECT ON public.ap_invoices TO authenticated;
GRANT SELECT ON public.ap_invoice_lines TO authenticated;
GRANT SELECT ON public.accounting_approval_limits TO authenticated;

GRANT ALL ON public.tax_codes TO service_role;
GRANT ALL ON public.tax_rates TO service_role;
GRANT ALL ON public.vat_returns TO service_role;
GRANT ALL ON public.journal_entries TO service_role;
GRANT ALL ON public.journal_lines TO service_role;
GRANT ALL ON public.journal_line_dimensions TO service_role;
GRANT ALL ON public.suppliers TO service_role;
GRANT ALL ON public.ap_invoices TO service_role;
GRANT ALL ON public.ap_invoice_lines TO service_role;
GRANT ALL ON public.accounting_approval_limits TO service_role;

-- Storage bucket for AP bill attachments (PDF + WebP images)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ap-invoice-attachments',
  'ap-invoice-attachments',
  true,
  15728640,
  ARRAY[
    'application/pdf',
    'image/webp',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ap_invoice_attachments_public_read" ON storage.objects;
CREATE POLICY "ap_invoice_attachments_public_read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'ap-invoice-attachments');

DROP POLICY IF EXISTS "ap_invoice_attachments_service_write" ON storage.objects;
CREATE POLICY "ap_invoice_attachments_service_write"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'ap-invoice-attachments'
    AND public.is_app_admin()
  )
  WITH CHECK (
    bucket_id = 'ap-invoice-attachments'
    AND public.is_app_admin()
  );

NOTIFY pgrst, 'reload schema';
