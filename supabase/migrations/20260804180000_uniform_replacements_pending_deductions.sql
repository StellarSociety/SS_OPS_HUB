-- Uniform replacements + pending payroll deductions (auto-picked on next payroll run).

CREATE TABLE IF NOT EXISTS public.hr_pending_payroll_deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  category TEXT NOT NULL DEFAULT 'deduction'
    CHECK (category IN ('fixed', 'variable', 'deduction', 'addon')),
  code TEXT NOT NULL DEFAULT 'UNIFORM',
  label TEXT NOT NULL DEFAULT 'Uniform / equipment',
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  reason TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'uniform_replacement',
  source_id UUID,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'cancelled')),
  applied_run_id UUID REFERENCES public.hr_payroll_runs(id) ON DELETE SET NULL,
  applied_adjustment_id UUID REFERENCES public.hr_payroll_adjustments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_pending_payroll_deductions_pending_idx
  ON public.hr_pending_payroll_deductions (venue_id, status, staff_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS hr_pending_payroll_deductions_staff_idx
  ON public.hr_pending_payroll_deductions (staff_id, created_at DESC);

CREATE TRIGGER hr_pending_payroll_deductions_set_updated_at
  BEFORE UPDATE ON public.hr_pending_payroll_deductions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.hr_uniform_replacements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  piece_id UUID NOT NULL REFERENCES public.hr_uniform_pieces(id) ON DELETE RESTRICT,
  staff_item_id UUID REFERENCES public.hr_uniform_staff_items(id) ON DELETE SET NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  charged_to_employee BOOLEAN NOT NULL DEFAULT false,
  deduction_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
  notes TEXT NOT NULL DEFAULT '',
  pending_deduction_id UUID
    REFERENCES public.hr_pending_payroll_deductions(id) ON DELETE SET NULL,
  email_sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_uniform_replacements_staff_idx
  ON public.hr_uniform_replacements (staff_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hr_uniform_replacements_venue_idx
  ON public.hr_uniform_replacements (venue_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hr_uniform_replacements_pending_deduction_idx
  ON public.hr_uniform_replacements (pending_deduction_id)
  WHERE pending_deduction_id IS NOT NULL;

CREATE TRIGGER hr_uniform_replacements_set_updated_at
  BEFORE UPDATE ON public.hr_uniform_replacements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hr_pending_payroll_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_uniform_replacements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_pending_payroll_deductions_select"
  ON public.hr_pending_payroll_deductions FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'view', venue_id)
  );

CREATE POLICY "hr_pending_payroll_deductions_write"
  ON public.hr_pending_payroll_deductions FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'edit', venue_id)
  );

CREATE POLICY "hr_uniform_replacements_select"
  ON public.hr_uniform_replacements FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
  );

CREATE POLICY "hr_uniform_replacements_write"
  ON public.hr_uniform_replacements FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'edit', venue_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_pending_payroll_deductions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_uniform_replacements TO authenticated;
GRANT ALL ON public.hr_pending_payroll_deductions TO service_role;
GRANT ALL ON public.hr_uniform_replacements TO service_role;
