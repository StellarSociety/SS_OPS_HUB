-- HR Payroll: runs, lines, adjustments, settlements, payments, payslips, GL, benefits stub.
-- Also adds staff.wps_employee_id for WPS file generation.

-- ---------------------------------------------------------------------------
-- Staff: WPS employee identifier
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS wps_employee_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS staff_venue_wps_employee_id_uidx
  ON public.staff (home_venue_id, wps_employee_id)
  WHERE wps_employee_id IS NOT NULL AND btrim(wps_employee_id) <> '';

COMMENT ON COLUMN public.staff.wps_employee_id IS
  'UAE WPS / MOL employee identifier used in salary transfer files.';

-- ---------------------------------------------------------------------------
-- Payroll runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  payroll_month DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_date DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'attendance_validated',
      'hr_review',
      'finance_review',
      'final_approval',
      'payment_processing',
      'paid',
      'locked'
    )),
  locked_at TIMESTAMPTZ,
  budget_amount NUMERIC(14, 2),
  revenue_amount NUMERIC(14, 2),
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, payroll_month)
);

CREATE INDEX IF NOT EXISTS hr_payroll_runs_venue_status_idx
  ON public.hr_payroll_runs (venue_id, status);

CREATE INDEX IF NOT EXISTS hr_payroll_runs_venue_month_idx
  ON public.hr_payroll_runs (venue_id, payroll_month DESC);

ALTER TABLE public.hr_payroll_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_runs_select" ON public.hr_payroll_runs;
CREATE POLICY "hr_payroll_runs_select"
  ON public.hr_payroll_runs FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_payroll_runs_write" ON public.hr_payroll_runs;
CREATE POLICY "hr_payroll_runs_write"
  ON public.hr_payroll_runs FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Run employees (snapshot + totals)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_run_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  emp_no TEXT NOT NULL,
  full_name TEXT NOT NULL,
  department_id UUID,
  department_name TEXT,
  position_id UUID,
  position_name TEXT,
  included BOOLEAN NOT NULL DEFAULT true,
  exclude_reason TEXT,
  is_new_joiner BOOLEAN NOT NULL DEFAULT false,
  is_leaver BOOLEAN NOT NULL DEFAULT false,
  employment_status TEXT,
  wps_employee_id TEXT,
  iban TEXT,
  bank_name TEXT,
  swift_code TEXT,
  wage_package NUMERIC(12, 2),
  basic_salary NUMERIC(12, 2),
  accom_allowance NUMERIC(12, 2),
  transp_allowance NUMERIC(12, 2),
  salary_to_pay NUMERIC(12, 2),
  company_accommodation BOOLEAN NOT NULL DEFAULT false,
  daily_rate NUMERIC(12, 6),
  calendar_days INT NOT NULL DEFAULT 0,
  paid_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
  unpaid_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
  half_pay_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
  fixed_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  variable_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gross_earnings NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, staff_id)
);

CREATE INDEX IF NOT EXISTS hr_payroll_run_employees_run_idx
  ON public.hr_payroll_run_employees (run_id, included);

CREATE INDEX IF NOT EXISTS hr_payroll_run_employees_venue_idx
  ON public.hr_payroll_run_employees (venue_id, emp_no);

ALTER TABLE public.hr_payroll_run_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_run_employees_select" ON public.hr_payroll_run_employees;
CREATE POLICY "hr_payroll_run_employees_select"
  ON public.hr_payroll_run_employees FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_payroll_run_employees_write" ON public.hr_payroll_run_employees;
CREATE POLICY "hr_payroll_run_employees_write"
  ON public.hr_payroll_run_employees FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Earnings / deduction lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  run_employee_id UUID NOT NULL REFERENCES public.hr_payroll_run_employees(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('fixed', 'variable', 'deduction')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  quantity NUMERIC(10, 4),
  rate NUMERIC(12, 6),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'system'
    CHECK (source IN ('system', 'adjustment', 'benefits', 'retro', 'settlement', 'manual')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_payroll_lines_run_emp_idx
  ON public.hr_payroll_lines (run_employee_id, category, sort_order);

CREATE INDEX IF NOT EXISTS hr_payroll_lines_run_idx
  ON public.hr_payroll_lines (run_id, code);

ALTER TABLE public.hr_payroll_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_lines_select" ON public.hr_payroll_lines;
CREATE POLICY "hr_payroll_lines_select"
  ON public.hr_payroll_lines FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_payroll_lines_write" ON public.hr_payroll_lines;
CREATE POLICY "hr_payroll_lines_write"
  ON public.hr_payroll_lines FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Adjustments (staging / audit before applied as lines)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  run_employee_id UUID REFERENCES public.hr_payroll_run_employees(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('fixed', 'variable', 'deduction')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  percent_of_daily_rate NUMERIC(8, 4),
  days_applied NUMERIC(8, 2),
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'retro', 'benefits', 'settlement')),
  applied_line_id UUID REFERENCES public.hr_payroll_lines(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_payroll_adjustments_run_idx
  ON public.hr_payroll_adjustments (run_id, created_at DESC);

ALTER TABLE public.hr_payroll_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_adjustments_select" ON public.hr_payroll_adjustments;
CREATE POLICY "hr_payroll_adjustments_select"
  ON public.hr_payroll_adjustments FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_payroll_adjustments_write" ON public.hr_payroll_adjustments;
CREATE POLICY "hr_payroll_adjustments_write"
  ON public.hr_payroll_adjustments FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Exceptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  emp_no TEXT,
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'blocking')),
  exception_type TEXT NOT NULL,
  message TEXT NOT NULL,
  work_date DATE,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  waived BOOLEAN NOT NULL DEFAULT false,
  waived_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  waived_at TIMESTAMPTZ,
  waive_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_payroll_exceptions_run_idx
  ON public.hr_payroll_exceptions (run_id, severity, waived);

ALTER TABLE public.hr_payroll_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_exceptions_select" ON public.hr_payroll_exceptions;
CREATE POLICY "hr_payroll_exceptions_select"
  ON public.hr_payroll_exceptions FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_payroll_exceptions_write" ON public.hr_payroll_exceptions;
CREATE POLICY "hr_payroll_exceptions_write"
  ON public.hr_payroll_exceptions FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Final settlements (leavers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  run_employee_id UUID NOT NULL REFERENCES public.hr_payroll_run_employees(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  termination_date DATE,
  leave_encashment NUMERIC(12, 2) NOT NULL DEFAULT 0,
  outstanding_advances NUMERIC(12, 2) NOT NULL DEFAULT 0,
  eosb_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  other_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_settlement NUMERIC(12, 2) NOT NULL DEFAULT 0,
  include_in_run BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, staff_id)
);

ALTER TABLE public.hr_payroll_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_settlements_select" ON public.hr_payroll_settlements;
CREATE POLICY "hr_payroll_settlements_select"
  ON public.hr_payroll_settlements FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_payroll_settlements_write" ON public.hr_payroll_settlements;
CREATE POLICY "hr_payroll_settlements_write"
  ON public.hr_payroll_settlements FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Workflow / audit events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  comment TEXT,
  rejected_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  changes_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_payroll_run_events_run_idx
  ON public.hr_payroll_run_events (run_id, created_at DESC);

ALTER TABLE public.hr_payroll_run_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_run_events_select" ON public.hr_payroll_run_events;
CREATE POLICY "hr_payroll_run_events_select"
  ON public.hr_payroll_run_events FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_payroll_run_events_insert" ON public.hr_payroll_run_events;
CREATE POLICY "hr_payroll_run_events_insert"
  ON public.hr_payroll_run_events FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Payments & WPS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  run_employee_id UUID NOT NULL REFERENCES public.hr_payroll_run_employees(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  wps_employee_id TEXT,
  iban TEXT,
  bank_name TEXT,
  fixed_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
  variable_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
  days_paid NUMERIC(8, 2) NOT NULL DEFAULT 0,
  leave_days NUMERIC(8, 2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'wps'
    CHECK (payment_method IN ('wps', 'bank_transfer', 'cash', 'cheque', 'other')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'file_generated',
      'submitted',
      'accepted',
      'rejected',
      'resubmitted',
      'paid'
    )),
  file_generated_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  rejection_reason TEXT,
  resubmission_status TEXT,
  bank_payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, run_employee_id)
);

CREATE INDEX IF NOT EXISTS hr_payroll_payments_run_idx
  ON public.hr_payroll_payments (run_id, status);

ALTER TABLE public.hr_payroll_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_payments_select" ON public.hr_payroll_payments;
CREATE POLICY "hr_payroll_payments_select"
  ON public.hr_payroll_payments FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_payroll_payments_write" ON public.hr_payroll_payments;
CREATE POLICY "hr_payroll_payments_write"
  ON public.hr_payroll_payments FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Payslips
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  run_employee_id UUID NOT NULL REFERENCES public.hr_payroll_run_employees(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  version INT NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  pdf_path TEXT,
  email_status TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (email_status IN ('not_sent', 'queued', 'sent', 'failed', 'bounced')),
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_employee_id, version)
);

CREATE INDEX IF NOT EXISTS hr_payslips_run_idx
  ON public.hr_payslips (run_id, staff_id);

CREATE INDEX IF NOT EXISTS hr_payslips_staff_idx
  ON public.hr_payslips (venue_id, staff_id, created_at DESC);

ALTER TABLE public.hr_payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payslips_select" ON public.hr_payslips;
CREATE POLICY "hr_payslips_select"
  ON public.hr_payslips FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payslips', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_payslips_write" ON public.hr_payslips;
CREATE POLICY "hr_payslips_write"
  ON public.hr_payslips FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payslips', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payslips', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Accounting / GL export lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_payroll_gl_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  gl_account TEXT NOT NULL,
  cost_centre TEXT,
  department_name TEXT,
  debit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  accrual_month DATE NOT NULL,
  payment_month DATE,
  description TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_payroll_gl_lines_run_idx
  ON public.hr_payroll_gl_lines (run_id);

ALTER TABLE public.hr_payroll_gl_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_gl_lines_select" ON public.hr_payroll_gl_lines;
CREATE POLICY "hr_payroll_gl_lines_select"
  ON public.hr_payroll_gl_lines FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_payroll_gl_lines_write" ON public.hr_payroll_gl_lines;
CREATE POLICY "hr_payroll_gl_lines_write"
  ON public.hr_payroll_gl_lines FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- ---------------------------------------------------------------------------
-- Benefits allocations (scaffold for Tips / Service Charge later)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_benefit_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  benefit_type TEXT NOT NULL
    CHECK (benefit_type IN (
      'tips',
      'service_charge',
      'compensation',
      'other'
    )),
  points NUMERIC(12, 4),
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  worked_days NUMERIC(8, 2),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'finalized', 'applied_to_payroll')),
  payroll_line_id UUID REFERENCES public.hr_payroll_lines(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_benefit_allocations_venue_period_idx
  ON public.hr_benefit_allocations (venue_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS hr_benefit_allocations_staff_idx
  ON public.hr_benefit_allocations (staff_id, benefit_type);

ALTER TABLE public.hr_benefit_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_benefit_allocations_select" ON public.hr_benefit_allocations;
CREATE POLICY "hr_benefit_allocations_select"
  ON public.hr_benefit_allocations FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'benefits', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_benefit_allocations_write" ON public.hr_benefit_allocations;
CREATE POLICY "hr_benefit_allocations_write"
  ON public.hr_benefit_allocations FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'benefits', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'benefits', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );
