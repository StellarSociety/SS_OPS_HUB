-- Durable offboarding process records (exit through settlement).

CREATE TABLE IF NOT EXISTS public.hr_offboarding_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  employment_status_id UUID REFERENCES public.employment_statuses(id) ON DELETE SET NULL,

  emp_no TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  department_name TEXT,
  position_name TEXT,
  employment_status_name TEXT,
  joining_date DATE,

  termination_kind TEXT NOT NULL
    CHECK (termination_kind IN (
      'resignation',
      'termination_with_notice',
      'immediate_termination'
    )),
  notification_date DATE NOT NULL,
  termination_date DATE NOT NULL,
  notice_email_action TEXT
    CHECK (
      notice_email_action IS NULL
      OR notice_email_action IN ('resignation_confirm', 'termination_notice')
    ),
  hub_access_disable_date DATE,

  al_balance NUMERIC(10,3) NOT NULL DEFAULT 0,
  ph_balance NUMERIC(10,3) NOT NULL DEFAULT 0,
  leave_handling TEXT NOT NULL DEFAULT 'pay_off'
    CHECK (leave_handling IN ('use_on_last_days', 'pay_off')),

  leave_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  auto_adjustments JSONB NOT NULL DEFAULT '{}'::jsonb,
  settlement JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN (
      'draft',
      'in_progress',
      'settlement_pending',
      'completed',
      'cancelled'
    )),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT NOT NULL DEFAULT '',

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_offboarding_processes_venue_status_idx
  ON public.hr_offboarding_processes (venue_id, status);

CREATE INDEX IF NOT EXISTS hr_offboarding_processes_venue_staff_idx
  ON public.hr_offboarding_processes (venue_id, staff_id);

CREATE INDEX IF NOT EXISTS hr_offboarding_processes_venue_started_idx
  ON public.hr_offboarding_processes (venue_id, started_at DESC);

-- One active (non-terminal) process per staff member.
CREATE UNIQUE INDEX IF NOT EXISTS hr_offboarding_processes_active_staff_uidx
  ON public.hr_offboarding_processes (staff_id)
  WHERE status NOT IN ('completed', 'cancelled');

ALTER TABLE public.hr_offboarding_processes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_offboarding_processes_select" ON public.hr_offboarding_processes;
CREATE POLICY "hr_offboarding_processes_select"
  ON public.hr_offboarding_processes FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_offboarding_processes_write" ON public.hr_offboarding_processes;
CREATE POLICY "hr_offboarding_processes_write"
  ON public.hr_offboarding_processes FOR ALL TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

-- Clear session-only process_id values before adding the FK.
UPDATE public.hr_boarding_emails be
SET process_id = NULL
WHERE process_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.hr_offboarding_processes p WHERE p.id = be.process_id
  );

-- Link boarding notice emails to durable process rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hr_boarding_emails_process_id_fkey'
  ) THEN
    ALTER TABLE public.hr_boarding_emails
      ADD CONSTRAINT hr_boarding_emails_process_id_fkey
      FOREIGN KEY (process_id)
      REFERENCES public.hr_offboarding_processes(id)
      ON DELETE SET NULL;
  END IF;
END $$;
