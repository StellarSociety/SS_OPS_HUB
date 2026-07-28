-- Link Sales waiters to HR staff for Benefits / tip settlement.
ALTER TABLE public.venue_waiters
  ADD COLUMN IF NOT EXISTS staff_id UUID
    REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS venue_waiters_staff_id_idx
  ON public.venue_waiters (staff_id)
  WHERE staff_id IS NOT NULL;

COMMENT ON COLUMN public.venue_waiters.staff_id IS
  'Optional link to HR staff for gratuity / benefits settlement.';
