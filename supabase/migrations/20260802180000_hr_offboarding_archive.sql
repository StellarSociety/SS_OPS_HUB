-- Soft-archive offboarding processes; free the active-staff unique slot when archived.

ALTER TABLE public.hr_offboarding_processes
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.hr_offboarding_processes.archived_at IS
  'When set, the process is archived (hidden from the default current list).';

DROP INDEX IF EXISTS public.hr_offboarding_processes_active_staff_uidx;

CREATE UNIQUE INDEX hr_offboarding_processes_active_staff_uidx
  ON public.hr_offboarding_processes (staff_id)
  WHERE status NOT IN ('completed', 'cancelled')
    AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS hr_offboarding_processes_venue_archived_idx
  ON public.hr_offboarding_processes (venue_id, archived_at);

-- Deleting a process removes linked notice-email records.
ALTER TABLE public.hr_boarding_emails
  DROP CONSTRAINT IF EXISTS hr_boarding_emails_process_id_fkey;

ALTER TABLE public.hr_boarding_emails
  ADD CONSTRAINT hr_boarding_emails_process_id_fkey
  FOREIGN KEY (process_id)
  REFERENCES public.hr_offboarding_processes(id)
  ON DELETE CASCADE;
