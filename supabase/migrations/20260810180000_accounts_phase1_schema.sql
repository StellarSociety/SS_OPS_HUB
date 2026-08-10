-- Accounts Phase 1 — Settings foundation
-- legal_entities, venue_entities, fiscal_periods, accounts (COA), dimensions,
-- system_default_accounts, sequences. Seeded from restaurant-bookkeeping baseline
-- + provisional §A defaults (editable in Accounting Settings; fill real TRNs there).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.acc_vat_filing_frequency AS ENUM ('monthly', 'quarterly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.acc_fiscal_period_status AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.acc_account_type AS ENUM (
    'asset', 'liability', 'equity', 'revenue', 'cost_of_sales', 'expense', 'other', 'depr_tax'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.acc_node_type AS ENUM ('header', 'group', 'ledger', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.acc_normal_balance AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.acc_dimension_status AS ENUM ('off', 'optional', 'required');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.acc_sequence_reset AS ENUM ('never', 'yearly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.acc_emirate AS ENUM (
    'abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- legal_entities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  trn TEXT,
  trade_licence_no TEXT,
  licensing_authority TEXT,
  emirate public.acc_emirate NOT NULL DEFAULT 'dubai',
  functional_currency TEXT NOT NULL DEFAULT 'AED',
  vat_filing_frequency public.acc_vat_filing_frequency NOT NULL DEFAULT 'monthly',
  first_open_period DATE NOT NULL,
  fiscal_year_start_month INT NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT legal_entities_trn_digits CHECK (trn IS NULL OR trn ~ '^[0-9]{15}$'),
  CONSTRAINT legal_entities_first_open_period_bom CHECK (
    date_trunc('month', first_open_period::timestamp)::date = first_open_period
  )
);

CREATE INDEX IF NOT EXISTS legal_entities_code_idx ON public.legal_entities (entity_code);

-- ---------------------------------------------------------------------------
-- venue_entities (venue ↔ entity ↔ emirate of supply)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES public.legal_entities (id) ON DELETE RESTRICT,
  emirate_of_supply public.acc_emirate NOT NULL DEFAULT 'dubai',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT venue_entities_venue_unique UNIQUE (venue_id)
);

CREATE INDEX IF NOT EXISTS venue_entities_entity_idx ON public.venue_entities (entity_id);

-- ---------------------------------------------------------------------------
-- fiscal_periods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.legal_entities (id) ON DELETE CASCADE,
  period DATE NOT NULL,
  status public.acc_fiscal_period_status NOT NULL DEFAULT 'open',
  closed_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_periods_bom CHECK (
    date_trunc('month', period::timestamp)::date = period
  ),
  CONSTRAINT fiscal_periods_entity_period_unique UNIQUE (entity_id, period)
);

CREATE INDEX IF NOT EXISTS fiscal_periods_entity_status_idx
  ON public.fiscal_periods (entity_id, status);

-- ---------------------------------------------------------------------------
-- accounts (Chart of Accounts — shared across entities)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type public.acc_account_type NOT NULL,
  node_type public.acc_node_type NOT NULL,
  parent_id UUID REFERENCES public.accounts (id) ON DELETE RESTRICT,
  normal_balance public.acc_normal_balance NOT NULL,
  is_control BOOLEAN NOT NULL DEFAULT false,
  is_postable BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounts_postable_ledger_only CHECK (
    (node_type = 'ledger' AND is_postable = true)
    OR (node_type <> 'ledger' AND is_postable = false)
  )
);

CREATE INDEX IF NOT EXISTS accounts_parent_idx ON public.accounts (parent_id);
CREATE INDEX IF NOT EXISTS accounts_type_idx ON public.accounts (account_type);
CREATE INDEX IF NOT EXISTS accounts_active_postable_idx
  ON public.accounts (active, is_postable) WHERE active AND is_postable;

-- ---------------------------------------------------------------------------
-- dimensions + requirements + values
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  status public.acc_dimension_status NOT NULL DEFAULT 'off',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dimension_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_id UUID NOT NULL REFERENCES public.dimensions (id) ON DELETE CASCADE,
  account_range_from TEXT NOT NULL,
  account_range_to TEXT NOT NULL,
  CONSTRAINT dimension_requirements_range CHECK (account_range_from <= account_range_to),
  CONSTRAINT dimension_requirements_unique UNIQUE (dimension_id, account_range_from, account_range_to)
);

CREATE TABLE IF NOT EXISTS public.dimension_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_id UUID NOT NULL REFERENCES public.dimensions (id) ON DELETE CASCADE,
  value_code TEXT NOT NULL,
  label TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dimension_values_unique UNIQUE (dimension_id, value_code)
);

CREATE INDEX IF NOT EXISTS dimension_values_dimension_idx
  ON public.dimension_values (dimension_id);

-- ---------------------------------------------------------------------------
-- system_default_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_default_accounts (
  key TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  label TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- sequences (document numbers per entity)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.legal_entities (id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  prefix TEXT NOT NULL,
  padding INT NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12),
  reset_rule public.acc_sequence_reset NOT NULL DEFAULT 'yearly',
  current_value INT NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  last_reset_period TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sequences_entity_doc_unique UNIQUE (entity_id, doc_type)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dimension_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dimension_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_default_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;

-- Master data: authenticated can read if they have any accounting access;
-- writes go through service role in server actions (no authenticated write policies).

CREATE POLICY "legal_entities_select"
  ON public.legal_entities FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'accounting', 'settings', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'overview', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'gl', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'reports', 'view', NULL)
  );

CREATE POLICY "venue_entities_select"
  ON public.venue_entities FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'accounting', 'settings', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'overview', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'gl', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'reports', 'view', venue_id)
  );

CREATE POLICY "fiscal_periods_select"
  ON public.fiscal_periods FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'accounting', 'settings', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'gl', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'reports', 'view', NULL)
  );

CREATE POLICY "accounts_select"
  ON public.accounts FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'accounting', 'settings', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'gl', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'overview', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'reports', 'view', NULL)
  );

CREATE POLICY "dimensions_select"
  ON public.dimensions FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'accounting', 'settings', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'gl', 'view', NULL)
  );

CREATE POLICY "dimension_requirements_select"
  ON public.dimension_requirements FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'accounting', 'settings', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'gl', 'view', NULL)
  );

CREATE POLICY "dimension_values_select"
  ON public.dimension_values FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'accounting', 'settings', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'gl', 'view', NULL)
  );

CREATE POLICY "system_default_accounts_select"
  ON public.system_default_accounts FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'accounting', 'settings', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'gl', 'view', NULL)
  );

CREATE POLICY "sequences_select"
  ON public.sequences FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'accounting', 'settings', 'view', NULL)
    OR public.has_feature_permission(auth.uid(), 'accounting', 'gl', 'view', NULL)
  );

GRANT SELECT ON public.legal_entities TO authenticated;
GRANT SELECT ON public.venue_entities TO authenticated;
GRANT SELECT ON public.fiscal_periods TO authenticated;
GRANT SELECT ON public.accounts TO authenticated;
GRANT SELECT ON public.dimensions TO authenticated;
GRANT SELECT ON public.dimension_requirements TO authenticated;
GRANT SELECT ON public.dimension_values TO authenticated;
GRANT SELECT ON public.system_default_accounts TO authenticated;
GRANT SELECT ON public.sequences TO authenticated;

GRANT ALL ON public.legal_entities TO service_role;
GRANT ALL ON public.venue_entities TO service_role;
GRANT ALL ON public.fiscal_periods TO service_role;
GRANT ALL ON public.accounts TO service_role;
GRANT ALL ON public.dimensions TO service_role;
GRANT ALL ON public.dimension_requirements TO service_role;
GRANT ALL ON public.dimension_values TO service_role;
GRANT ALL ON public.system_default_accounts TO service_role;
GRANT ALL ON public.sequences TO service_role;

-- Seed baseline COA (+ 1290 Suspense, 6990 Rounding)
INSERT INTO public.accounts (code, name, account_type, node_type, normal_balance, is_control, is_postable, active)
VALUES
  ('1000', 'ASSETS', 'asset', 'header', 'debit', false, false, true),
  ('1100', 'Cash & Bank', 'asset', 'group', 'debit', false, false, true),
  ('1110', 'Operating Bank Account', 'asset', 'ledger', 'debit', false, true, true),
  ('1120', 'Cash on Hand', 'asset', 'ledger', 'debit', false, true, true),
  ('1130', 'Petty Cash', 'asset', 'ledger', 'debit', false, true, true),
  ('1200', 'Receivables', 'asset', 'group', 'debit', false, false, true),
  ('1210', 'Trade Receivables', 'asset', 'ledger', 'debit', true, true, true),
  ('1220', 'Card Settlement Receivables', 'asset', 'ledger', 'debit', false, true, true),
  ('1230', 'Payment Gateway Receivables', 'asset', 'ledger', 'debit', false, true, true),
  ('1240', 'Delivery Platform Receivables', 'asset', 'ledger', 'debit', false, true, true),
  ('1250', 'Employee / Other Receivables', 'asset', 'ledger', 'debit', false, true, true),
  ('1290', 'Suspense / Clearing', 'asset', 'ledger', 'debit', false, true, true),
  ('1300', 'Inventory', 'asset', 'group', 'debit', false, false, true),
  ('1310', 'Inventory - Food', 'asset', 'ledger', 'debit', false, true, true),
  ('1320', 'Inventory - Beverages', 'asset', 'ledger', 'debit', false, true, true),
  ('1330', 'Inventory - Wine', 'asset', 'ledger', 'debit', false, true, true),
  ('1340', 'Inventory - Tobacco', 'asset', 'ledger', 'debit', false, true, true),
  ('1350', 'Inventory - Shisha', 'asset', 'ledger', 'debit', false, true, true),
  ('1400', 'Prepayments & Deposits', 'asset', 'group', 'debit', false, false, true),
  ('1410', 'Prepaid Expenses', 'asset', 'ledger', 'debit', false, true, true),
  ('1420', 'Security / Utility Deposits', 'asset', 'ledger', 'debit', false, true, true),
  ('1500', 'Fixed Assets', 'asset', 'group', 'debit', false, false, true),
  ('1510', 'Kitchen Equipment', 'asset', 'ledger', 'debit', false, true, true),
  ('1520', 'Furniture & Fixtures / OS&E', 'asset', 'ledger', 'debit', false, true, true),
  ('1530', 'IT Equipment', 'asset', 'ledger', 'debit', false, true, true),
  ('1540', 'Leasehold Improvements', 'asset', 'ledger', 'debit', false, true, true),
  ('1550', 'Other Fixed Assets', 'asset', 'ledger', 'debit', false, true, true),
  ('1590', 'Accumulated Depreciation', 'asset', 'ledger', 'credit', false, true, true),
  ('2000', 'LIABILITIES', 'liability', 'header', 'credit', false, false, true),
  ('2100', 'Accounts Payable', 'liability', 'group', 'credit', false, false, true),
  ('2110', 'Trade Creditors / Suppliers', 'liability', 'ledger', 'credit', true, true, true),
  ('2200', 'Payroll Liabilities', 'liability', 'group', 'credit', false, false, true),
  ('2210', 'Salaries Payable', 'liability', 'ledger', 'credit', false, true, true),
  ('2220', 'Tips Payable', 'liability', 'ledger', 'credit', false, true, true),
  ('2230', 'Service Charge Payable', 'liability', 'ledger', 'credit', false, true, true),
  ('2240', 'EOSB Provision', 'liability', 'ledger', 'credit', false, true, true),
  ('2250', 'Leave Provision', 'liability', 'ledger', 'credit', false, true, true),
  ('2300', 'Tax Control', 'liability', 'group', 'credit', false, false, true),
  ('2310', 'Output VAT', 'liability', 'ledger', 'credit', true, true, true),
  ('2320', 'Input VAT', 'liability', 'ledger', 'debit', true, true, true),
  ('2330', 'VAT Payable / Settlement', 'liability', 'ledger', 'credit', true, true, true),
  ('2340', 'Corporate Tax Payable', 'liability', 'ledger', 'credit', false, true, true),
  ('2400', 'Accruals', 'liability', 'group', 'credit', false, false, true),
  ('2410', 'Accrued Expenses', 'liability', 'ledger', 'credit', false, true, true),
  ('2500', 'Customer Deposits', 'liability', 'group', 'credit', false, false, true),
  ('2510', 'Customer Deposits / Unearned Revenue', 'liability', 'ledger', 'credit', false, true, true),
  ('2600', 'Financing', 'liability', 'group', 'credit', false, false, true),
  ('2610', 'Loans Payable', 'liability', 'ledger', 'credit', false, true, true),
  ('2620', 'Credit Cards Payable', 'liability', 'ledger', 'credit', false, true, true),
  ('2630', 'Lease Liabilities', 'liability', 'ledger', 'credit', false, true, true),
  ('3000', 'EQUITY', 'equity', 'header', 'credit', false, false, true),
  ('3100', 'Share Capital', 'equity', 'ledger', 'credit', false, true, true),
  ('3200', 'Shareholder Contributions / Current Account', 'equity', 'ledger', 'credit', false, true, true),
  ('3300', 'Retained Earnings', 'equity', 'ledger', 'credit', false, true, true),
  ('3400', 'Current Year Profit / Loss', 'equity', 'system', 'credit', false, false, true),
  ('4000', 'REVENUE', 'revenue', 'header', 'credit', false, false, true),
  ('4100', 'Food Revenue', 'revenue', 'ledger', 'credit', false, true, true),
  ('4200', 'Beverage Revenue', 'revenue', 'ledger', 'credit', false, true, true),
  ('4300', 'Wine Revenue', 'revenue', 'ledger', 'credit', false, true, true),
  ('4400', 'Tobacco Revenue', 'revenue', 'ledger', 'credit', false, true, true),
  ('4500', 'Shisha Revenue', 'revenue', 'ledger', 'credit', false, true, true),
  ('4600', 'Other Operating Revenue', 'revenue', 'ledger', 'credit', false, true, true),
  ('4900', 'Sales Discounts / Contra Revenue', 'revenue', 'ledger', 'debit', false, true, true),
  ('5000', 'COST OF SALES', 'cost_of_sales', 'header', 'debit', false, false, true),
  ('5100', 'Food Cost', 'cost_of_sales', 'group', 'debit', false, false, true),
  ('5110', 'Food Purchases / COGS', 'cost_of_sales', 'ledger', 'debit', false, true, true),
  ('5120', 'Food Inventory Adjustment / Variance', 'cost_of_sales', 'ledger', 'debit', false, true, true),
  ('5200', 'Beverage Cost', 'cost_of_sales', 'group', 'debit', false, false, true),
  ('5210', 'Beverage Purchases / COGS', 'cost_of_sales', 'ledger', 'debit', false, true, true),
  ('5220', 'Beverage Inventory Adjustment / Variance', 'cost_of_sales', 'ledger', 'debit', false, true, true),
  ('5300', 'Wine Cost', 'cost_of_sales', 'group', 'debit', false, false, true),
  ('5310', 'Wine Purchases / COGS', 'cost_of_sales', 'ledger', 'debit', false, true, true),
  ('5320', 'Wine Inventory Adjustment / Variance', 'cost_of_sales', 'ledger', 'debit', false, true, true),
  ('5400', 'Tobacco Cost', 'cost_of_sales', 'ledger', 'debit', false, true, true),
  ('5500', 'Shisha Cost', 'cost_of_sales', 'ledger', 'debit', false, true, true),
  ('5600', 'Wastage / Spoilage', 'cost_of_sales', 'ledger', 'debit', false, true, true),
  ('6000', 'OPERATING EXPENSES', 'expense', 'header', 'debit', false, false, true),
  ('6100', 'Staff Costs', 'expense', 'group', 'debit', false, false, true),
  ('6110', 'Wages - Management', 'expense', 'ledger', 'debit', false, true, true),
  ('6120', 'Wages - Kitchen', 'expense', 'ledger', 'debit', false, true, true),
  ('6130', 'Wages - Floor', 'expense', 'ledger', 'debit', false, true, true),
  ('6140', 'Wages - Bar', 'expense', 'ledger', 'debit', false, true, true),
  ('6150', 'Wages - Reception', 'expense', 'ledger', 'debit', false, true, true),
  ('6160', 'Wages - Marketing / Office', 'expense', 'ledger', 'debit', false, true, true),
  ('6170', 'Staff Accommodation', 'expense', 'ledger', 'debit', false, true, true),
  ('6180', 'Staff Transportation', 'expense', 'ledger', 'debit', false, true, true),
  ('6190', 'Other Staff Costs', 'expense', 'ledger', 'debit', false, true, true),
  ('6200', 'Marketing & Promotional', 'expense', 'group', 'debit', false, false, true),
  ('6210', 'Advertising & Marketing', 'expense', 'ledger', 'debit', false, true, true),
  ('6220', 'PR & Influencers', 'expense', 'ledger', 'debit', false, true, true),
  ('6230', 'Content Creation', 'expense', 'ledger', 'debit', false, true, true),
  ('6240', 'Entertainment & DJ', 'expense', 'ledger', 'debit', false, true, true),
  ('6250', 'Complimentary / Promotional Cost', 'expense', 'ledger', 'debit', false, true, true),
  ('6300', 'Consumables', 'expense', 'group', 'debit', false, false, true),
  ('6310', 'Kitchen Supplies', 'expense', 'ledger', 'debit', false, true, true),
  ('6320', 'Restaurant Supplies', 'expense', 'ledger', 'debit', false, true, true),
  ('6330', 'Bar Supplies', 'expense', 'ledger', 'debit', false, true, true),
  ('6400', 'OS&E', 'expense', 'group', 'debit', false, false, true),
  ('6410', 'OS&E - Kitchen', 'expense', 'ledger', 'debit', false, true, true),
  ('6420', 'OS&E - Bar', 'expense', 'ledger', 'debit', false, true, true),
  ('6430', 'OS&E - Service', 'expense', 'ledger', 'debit', false, true, true),
  ('6500', 'Maintenance & Contractors', 'expense', 'group', 'debit', false, false, true),
  ('6510', 'Repairs & Maintenance', 'expense', 'ledger', 'debit', false, true, true),
  ('6520', 'Cleaning', 'expense', 'ledger', 'debit', false, true, true),
  ('6530', 'Pest Control', 'expense', 'ledger', 'debit', false, true, true),
  ('6540', 'HVAC & Extraction', 'expense', 'ledger', 'debit', false, true, true),
  ('6550', 'Fire & Safety', 'expense', 'ledger', 'debit', false, true, true),
  ('6560', 'Linen & Laundry', 'expense', 'ledger', 'debit', false, true, true),
  ('6570', 'Valet & Security', 'expense', 'ledger', 'debit', false, true, true),
  ('6580', 'Laboratory / Sampling / Water', 'expense', 'ledger', 'debit', false, true, true),
  ('6600', 'Premises & Utilities', 'expense', 'group', 'debit', false, false, true),
  ('6610', 'Restaurant Rent', 'expense', 'ledger', 'debit', false, true, true),
  ('6620', 'Electricity', 'expense', 'ledger', 'debit', false, true, true),
  ('6630', 'Water', 'expense', 'ledger', 'debit', false, true, true),
  ('6640', 'Gas & Charcoal', 'expense', 'ledger', 'debit', false, true, true),
  ('6650', 'Telephone & Internet', 'expense', 'ledger', 'debit', false, true, true),
  ('6660', 'Other Utilities / Premises Costs', 'expense', 'ledger', 'debit', false, true, true),
  ('6700', 'IT & Software', 'expense', 'group', 'debit', false, false, true),
  ('6710', 'Software & Subscriptions', 'expense', 'ledger', 'debit', false, true, true),
  ('6800', 'Licenses & Insurance', 'expense', 'group', 'debit', false, false, true),
  ('6810', 'Trade & Operating Licenses', 'expense', 'ledger', 'debit', false, true, true),
  ('6820', 'Insurance', 'expense', 'ledger', 'debit', false, true, true),
  ('6830', 'Permits & Government Fees', 'expense', 'ledger', 'debit', false, true, true),
  ('6900', 'Finance & Administration', 'expense', 'group', 'debit', false, false, true),
  ('6910', 'Merchant / Credit Card Charges', 'expense', 'ledger', 'debit', false, true, true),
  ('6920', 'Bank Charges', 'expense', 'ledger', 'debit', false, true, true),
  ('6930', 'Professional Fees', 'expense', 'ledger', 'debit', false, true, true),
  ('6940', 'Bookkeeping & Accounting', 'expense', 'ledger', 'debit', false, true, true),
  ('6950', 'Stationery / Printing / Courier', 'expense', 'ledger', 'debit', false, true, true),
  ('6960', 'Local Conveyance / Taxi', 'expense', 'ledger', 'debit', false, true, true),
  ('6990', 'Rounding Differences', 'expense', 'ledger', 'debit', false, true, true),
  ('7000', 'OTHER / BELOW EBITDA', 'other', 'header', 'debit', false, false, true),
  ('7100', 'Pre-Opening Costs', 'other', 'ledger', 'debit', false, true, true),
  ('7200', 'Property / Non-operating Expenses', 'other', 'ledger', 'debit', false, true, true),
  ('7300', 'Head Office Allocations', 'other', 'ledger', 'debit', false, true, true),
  ('7400', 'Management Fees', 'other', 'ledger', 'debit', false, true, true),
  ('7500', 'Exceptional / Non-operating Expenses', 'other', 'ledger', 'debit', false, true, true),
  ('7600', 'Foreign Exchange Gain / Loss', 'other', 'ledger', 'debit', false, true, true),
  ('7700', 'Finance Costs / Interest', 'other', 'ledger', 'debit', false, true, true),
  ('8000', 'DEPRECIATION & TAX', 'depr_tax', 'header', 'debit', false, false, true),
  ('8100', 'Depreciation Expense', 'depr_tax', 'ledger', 'debit', false, true, true),
  ('8200', 'Amortisation Expense', 'depr_tax', 'ledger', 'debit', false, true, true),
  ('8300', 'Corporate Income Tax Expense', 'depr_tax', 'ledger', 'debit', false, true, true)
ON CONFLICT (code) DO NOTHING;

-- Wire parent_id from parent codes
UPDATE public.accounts child
SET parent_id = parent.id
FROM (VALUES
  ('1100', '1000'),
  ('1110', '1100'),
  ('1120', '1100'),
  ('1130', '1100'),
  ('1200', '1000'),
  ('1210', '1200'),
  ('1220', '1200'),
  ('1230', '1200'),
  ('1240', '1200'),
  ('1250', '1200'),
  ('1290', '1200'),
  ('1300', '1000'),
  ('1310', '1300'),
  ('1320', '1300'),
  ('1330', '1300'),
  ('1340', '1300'),
  ('1350', '1300'),
  ('1400', '1000'),
  ('1410', '1400'),
  ('1420', '1400'),
  ('1500', '1000'),
  ('1510', '1500'),
  ('1520', '1500'),
  ('1530', '1500'),
  ('1540', '1500'),
  ('1550', '1500'),
  ('1590', '1500'),
  ('2100', '2000'),
  ('2110', '2100'),
  ('2200', '2000'),
  ('2210', '2200'),
  ('2220', '2200'),
  ('2230', '2200'),
  ('2240', '2200'),
  ('2250', '2200'),
  ('2300', '2000'),
  ('2310', '2300'),
  ('2320', '2300'),
  ('2330', '2300'),
  ('2340', '2300'),
  ('2400', '2000'),
  ('2410', '2400'),
  ('2500', '2000'),
  ('2510', '2500'),
  ('2600', '2000'),
  ('2610', '2600'),
  ('2620', '2600'),
  ('2630', '2600'),
  ('3100', '3000'),
  ('3200', '3000'),
  ('3300', '3000'),
  ('3400', '3000'),
  ('4100', '4000'),
  ('4200', '4000'),
  ('4300', '4000'),
  ('4400', '4000'),
  ('4500', '4000'),
  ('4600', '4000'),
  ('4900', '4000'),
  ('5100', '5000'),
  ('5110', '5100'),
  ('5120', '5100'),
  ('5200', '5000'),
  ('5210', '5200'),
  ('5220', '5200'),
  ('5300', '5000'),
  ('5310', '5300'),
  ('5320', '5300'),
  ('5400', '5000'),
  ('5500', '5000'),
  ('5600', '5000'),
  ('6100', '6000'),
  ('6110', '6100'),
  ('6120', '6100'),
  ('6130', '6100'),
  ('6140', '6100'),
  ('6150', '6100'),
  ('6160', '6100'),
  ('6170', '6100'),
  ('6180', '6100'),
  ('6190', '6100'),
  ('6200', '6000'),
  ('6210', '6200'),
  ('6220', '6200'),
  ('6230', '6200'),
  ('6240', '6200'),
  ('6250', '6200'),
  ('6300', '6000'),
  ('6310', '6300'),
  ('6320', '6300'),
  ('6330', '6300'),
  ('6400', '6000'),
  ('6410', '6400'),
  ('6420', '6400'),
  ('6430', '6400'),
  ('6500', '6000'),
  ('6510', '6500'),
  ('6520', '6500'),
  ('6530', '6500'),
  ('6540', '6500'),
  ('6550', '6500'),
  ('6560', '6500'),
  ('6570', '6500'),
  ('6580', '6500'),
  ('6600', '6000'),
  ('6610', '6600'),
  ('6620', '6600'),
  ('6630', '6600'),
  ('6640', '6600'),
  ('6650', '6600'),
  ('6660', '6600'),
  ('6700', '6000'),
  ('6710', '6700'),
  ('6800', '6000'),
  ('6810', '6800'),
  ('6820', '6800'),
  ('6830', '6800'),
  ('6900', '6000'),
  ('6910', '6900'),
  ('6920', '6900'),
  ('6930', '6900'),
  ('6940', '6900'),
  ('6950', '6900'),
  ('6960', '6900'),
  ('6990', '6900'),
  ('7100', '7000'),
  ('7200', '7000'),
  ('7300', '7000'),
  ('7400', '7000'),
  ('7500', '7000'),
  ('7600', '7000'),
  ('7700', '7000'),
  ('8100', '8000'),
  ('8200', '8000'),
  ('8300', '8000')
) AS map(child_code, parent_code)
JOIN public.accounts parent ON parent.code = map.parent_code
WHERE child.code = map.child_code;
-- ---------------------------------------------------------------------------
-- Dimensions (A6 provisional defaults — edit in Settings)
-- ---------------------------------------------------------------------------
INSERT INTO public.dimensions (key, label, status, sort_order) VALUES
  ('legal_entity', 'Legal Entity', 'required', 10),
  ('venue', 'Venue', 'required', 20),
  ('emirate', 'Emirate', 'required', 30),
  ('department', 'Department', 'optional', 40),
  ('cost_centre', 'Cost Centre', 'off', 50),
  ('revenue_centre', 'Revenue Centre', 'optional', 60),
  ('supplier', 'Supplier / Vendor', 'optional', 70),
  ('customer', 'Customer', 'optional', 80),
  ('employee', 'Employee', 'optional', 90),
  ('project', 'Project / Event', 'off', 100),
  ('payment_method', 'Payment Method', 'optional', 110),
  ('sales_channel', 'Sales Channel', 'optional', 120)
ON CONFLICT (key) DO NOTHING;

-- Emirate required on revenue 4000-4999
INSERT INTO public.dimension_requirements (dimension_id, account_range_from, account_range_to)
SELECT d.id, '4000', '4999'
FROM public.dimensions d
WHERE d.key = 'emirate'
ON CONFLICT DO NOTHING;

-- Department optional but recommended on wages 6100-6199 when status=required later
INSERT INTO public.dimension_requirements (dimension_id, account_range_from, account_range_to)
SELECT d.id, '6100', '6199'
FROM public.dimensions d
WHERE d.key = 'department'
ON CONFLICT DO NOTHING;

INSERT INTO public.dimension_requirements (dimension_id, account_range_from, account_range_to)
SELECT d.id, '4000', '4999'
FROM public.dimensions d
WHERE d.key = 'revenue_centre'
ON CONFLICT DO NOTHING;

INSERT INTO public.dimension_requirements (dimension_id, account_range_from, account_range_to)
SELECT d.id, '4000', '4999'
FROM public.dimensions d
WHERE d.key = 'sales_channel'
ON CONFLICT DO NOTHING;

-- Emirate dimension values (UAE)
INSERT INTO public.dimension_values (dimension_id, value_code, label, sort_order)
SELECT d.id, v.code, v.label, v.sort_order
FROM public.dimensions d
CROSS JOIN (VALUES
  ('abu_dhabi', 'Abu Dhabi', 1),
  ('dubai', 'Dubai', 2),
  ('sharjah', 'Sharjah', 3),
  ('ajman', 'Ajman', 4),
  ('umm_al_quwain', 'Umm Al Quwain', 5),
  ('ras_al_khaimah', 'Ras Al Khaimah', 6),
  ('fujairah', 'Fujairah', 7)
) AS v(code, label, sort_order)
WHERE d.key = 'emirate'
ON CONFLICT (dimension_id, value_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- System default accounts (A8)
-- ---------------------------------------------------------------------------
INSERT INTO public.system_default_accounts (key, account_id, label)
SELECT m.key, a.id, m.label
FROM (VALUES
  ('retained_earnings', '3300', 'Retained earnings'),
  ('current_year_pl', '3400', 'Current-year P&L'),
  ('suspense', '1290', 'Suspense / clearing'),
  ('rounding', '6990', 'Rounding'),
  ('fx_gain_loss', '7600', 'FX gain/loss'),
  ('merchant_fees', '6910', 'Bank / merchant fees'),
  ('bank_charges', '6920', 'Bank charges'),
  ('output_vat', '2310', 'Output VAT'),
  ('input_vat', '2320', 'Input VAT'),
  ('vat_payable', '2330', 'VAT payable/settlement'),
  ('ap_control', '2110', 'AP control'),
  ('ar_control', '1210', 'AR control')
) AS m(key, code, label)
JOIN public.accounts a ON a.code = m.code
ON CONFLICT (key) DO UPDATE
SET account_id = EXCLUDED.account_id,
    label = EXCLUDED.label,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Provisional legal entity for Orilla (A1/A2 — fill TRN & licence in Settings)
-- first_open_period = 2026-01-01; VAT monthly; Dubai
-- ---------------------------------------------------------------------------
INSERT INTO public.legal_entities (
  entity_code, name, trn, trade_licence_no, licensing_authority,
  emirate, functional_currency, vat_filing_frequency, first_open_period, fiscal_year_start_month
)
VALUES (
  'ENT01',
  'Orilla Restaurant LLC',
  NULL,
  NULL,
  NULL,
  'dubai',
  'AED',
  'monthly',
  '2026-01-01',
  1
)
ON CONFLICT (entity_code) DO NOTHING;

INSERT INTO public.venue_entities (venue_id, entity_id, emirate_of_supply, notes)
SELECT v.id, e.id, 'dubai', 'Provisional mapping — confirm TRN & licence in Accounting Settings'
FROM public.venues v
CROSS JOIN public.legal_entities e
WHERE v.slug = 'orilla'
  AND e.entity_code = 'ENT01'
  AND NOT EXISTS (
    SELECT 1 FROM public.venue_entities ve WHERE ve.venue_id = v.id
  );

-- Venue dimension value for Orilla
INSERT INTO public.dimension_values (dimension_id, value_code, label, meta, sort_order)
SELECT d.id, v.slug, v.name, jsonb_build_object('venue_id', v.id), 1
FROM public.dimensions d
CROSS JOIN public.venues v
WHERE d.key = 'venue' AND v.slug = 'orilla'
ON CONFLICT (dimension_id, value_code) DO NOTHING;

-- Legal entity dimension value
INSERT INTO public.dimension_values (dimension_id, value_code, label, meta, sort_order)
SELECT d.id, e.entity_code, e.name, jsonb_build_object('entity_id', e.id), 1
FROM public.dimensions d
CROSS JOIN public.legal_entities e
WHERE d.key = 'legal_entity' AND e.entity_code = 'ENT01'
ON CONFLICT (dimension_id, value_code) DO NOTHING;

-- Fiscal periods: from first_open_period through Dec 2026
INSERT INTO public.fiscal_periods (entity_id, period, status)
SELECT e.id, gs::date, 'open'
FROM public.legal_entities e
CROSS JOIN generate_series(
  e.first_open_period,
  (date_trunc('year', e.first_open_period) + INTERVAL '1 year' - INTERVAL '1 day')::date,
  INTERVAL '1 month'
) AS gs
WHERE e.entity_code = 'ENT01'
ON CONFLICT (entity_id, period) DO NOTHING;

-- Document sequences (A9 provisional)
INSERT INTO public.sequences (entity_id, doc_type, prefix, padding, reset_rule, current_value)
SELECT e.id, s.doc_type, s.prefix, s.padding, s.reset_rule::public.acc_sequence_reset, 0
FROM public.legal_entities e
CROSS JOIN (VALUES
  ('journal', 'JV-', 6, 'yearly'),
  ('sales_invoice', 'INV-', 6, 'yearly'),
  ('payment', 'PAY-', 6, 'yearly'),
  ('credit_note', 'CN-', 6, 'yearly')
) AS s(doc_type, prefix, padding, reset_rule)
WHERE e.entity_code = 'ENT01'
ON CONFLICT (entity_id, doc_type) DO NOTHING;

