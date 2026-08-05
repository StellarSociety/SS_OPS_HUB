-- Partial payroll deduction applications (carry remaining balance across months).

ALTER TABLE public.hr_pending_payroll_deductions
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(12, 2);

UPDATE public.hr_pending_payroll_deductions
SET
  original_amount = COALESCE(original_amount, amount),
  remaining_amount = COALESCE(
    remaining_amount,
    CASE
      WHEN status = 'applied' THEN 0
      WHEN status = 'cancelled' THEN 0
      ELSE amount
    END
  )
WHERE original_amount IS NULL OR remaining_amount IS NULL;

ALTER TABLE public.hr_pending_payroll_deductions
  ALTER COLUMN original_amount SET DEFAULT 0,
  ALTER COLUMN remaining_amount SET DEFAULT 0;

ALTER TABLE public.hr_pending_payroll_deductions
  ALTER COLUMN original_amount SET NOT NULL,
  ALTER COLUMN remaining_amount SET NOT NULL;

ALTER TABLE public.hr_pending_payroll_deductions
  DROP CONSTRAINT IF EXISTS hr_pending_payroll_deductions_original_amount_check;

ALTER TABLE public.hr_pending_payroll_deductions
  ADD CONSTRAINT hr_pending_payroll_deductions_original_amount_check
  CHECK (original_amount >= 0);

ALTER TABLE public.hr_pending_payroll_deductions
  DROP CONSTRAINT IF EXISTS hr_pending_payroll_deductions_remaining_amount_check;

ALTER TABLE public.hr_pending_payroll_deductions
  ADD CONSTRAINT hr_pending_payroll_deductions_remaining_amount_check
  CHECK (remaining_amount >= 0);

-- Allow cleared (fully recovered) alongside legacy applied.
ALTER TABLE public.hr_pending_payroll_deductions
  DROP CONSTRAINT IF EXISTS hr_pending_payroll_deductions_status_check;

ALTER TABLE public.hr_pending_payroll_deductions
  ADD CONSTRAINT hr_pending_payroll_deductions_status_check
  CHECK (status IN ('pending', 'applied', 'cleared', 'cancelled'));

UPDATE public.hr_pending_payroll_deductions
SET status = 'cleared'
WHERE status = 'applied' AND remaining_amount = 0;

CREATE TABLE IF NOT EXISTS public.hr_payroll_deduction_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  pending_deduction_id UUID NOT NULL
    REFERENCES public.hr_pending_payroll_deductions(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  adjustment_id UUID REFERENCES public.hr_payroll_adjustments(id) ON DELETE SET NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pending_deduction_id, run_id)
);

CREATE INDEX IF NOT EXISTS hr_payroll_deduction_applications_run_idx
  ON public.hr_payroll_deduction_applications (run_id, pending_deduction_id);

CREATE INDEX IF NOT EXISTS hr_payroll_deduction_applications_pending_idx
  ON public.hr_payroll_deduction_applications (pending_deduction_id, created_at DESC);

CREATE TRIGGER hr_payroll_deduction_applications_set_updated_at
  BEFORE UPDATE ON public.hr_payroll_deduction_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Backfill one application row for legacy fully-applied deductions.
INSERT INTO public.hr_payroll_deduction_applications (
  venue_id,
  pending_deduction_id,
  run_id,
  adjustment_id,
  amount,
  created_by,
  created_at
)
SELECT
  d.venue_id,
  d.id,
  d.applied_run_id,
  d.applied_adjustment_id,
  GREATEST(d.original_amount, 0.01),
  d.created_by,
  d.updated_at
FROM public.hr_pending_payroll_deductions d
WHERE d.applied_run_id IS NOT NULL
  AND d.status IN ('applied', 'cleared')
ON CONFLICT (pending_deduction_id, run_id) DO NOTHING;

ALTER TABLE public.hr_payroll_deduction_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_payroll_deduction_applications_select"
  ON public.hr_payroll_deduction_applications FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'assets', 'view', venue_id)
  );

CREATE POLICY "hr_payroll_deduction_applications_write"
  ON public.hr_payroll_deduction_applications FOR ALL TO authenticated
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_deduction_applications TO authenticated;
GRANT ALL ON public.hr_payroll_deduction_applications TO service_role;

CREATE INDEX IF NOT EXISTS hr_pending_payroll_deductions_remaining_idx
  ON public.hr_pending_payroll_deductions (venue_id, remaining_amount)
  WHERE remaining_amount > 0 AND status = 'pending';
