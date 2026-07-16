-- Schedule approval requests: week-scoped publish gate for PDF export.

CREATE TABLE public.hr_schedule_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'cancelled')),
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approver_user_ids UUID[] NOT NULL DEFAULT '{}',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hr_schedule_approval_requests_venue_week_idx
  ON public.hr_schedule_approval_requests (venue_id, week_start DESC);

CREATE UNIQUE INDEX hr_schedule_approval_requests_one_pending
  ON public.hr_schedule_approval_requests (venue_id, week_start)
  WHERE status = 'pending';

ALTER TABLE public.hr_schedule_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_schedule_approval_requests_select"
  ON public.hr_schedule_approval_requests FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
  );

-- Writes go through service-role server actions (no authenticated insert/update/delete).

COMMENT ON TABLE public.hr_schedule_approval_requests IS
  'Week-scoped schedule approval requests. Pending must be approved before PDF publish.';
