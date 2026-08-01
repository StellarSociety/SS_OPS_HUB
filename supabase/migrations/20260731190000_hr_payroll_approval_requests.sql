-- Payroll run approval requests (HR Review / Final Approval).

CREATE TABLE IF NOT EXISTS public.hr_payroll_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.hr_payroll_runs(id) ON DELETE CASCADE,
  step TEXT NOT NULL
    CHECK (step IN ('hr_review', 'final_approval')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'cancelled')),
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approver_user_ids UUID[] NOT NULL DEFAULT '{}',
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_payroll_approval_requests_run_idx
  ON public.hr_payroll_approval_requests (run_id, step, created_at DESC);

CREATE INDEX IF NOT EXISTS hr_payroll_approval_requests_venue_idx
  ON public.hr_payroll_approval_requests (venue_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS hr_payroll_approval_requests_one_pending
  ON public.hr_payroll_approval_requests (run_id, step)
  WHERE status = 'pending';

ALTER TABLE public.hr_payroll_approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_payroll_approval_requests_select"
  ON public.hr_payroll_approval_requests;
CREATE POLICY "hr_payroll_approval_requests_select"
  ON public.hr_payroll_approval_requests FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'payroll', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'salary', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

-- Writes go through service-role server actions.

COMMENT ON TABLE public.hr_payroll_approval_requests IS
  'Pending/approved gates for payroll HR Review and Final Approval steps.';
