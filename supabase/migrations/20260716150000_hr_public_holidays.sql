-- Venue-scoped public holiday calendar for schedules highlight + future leave balances.
-- Leave rule (app logic later): worked on PH → PH allowance increases; did not work → no add.

CREATE TABLE IF NOT EXISTS public.hr_public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, holiday_date)
);

CREATE INDEX IF NOT EXISTS hr_public_holidays_venue_date_idx
  ON public.hr_public_holidays (venue_id, holiday_date);

ALTER TABLE public.hr_public_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_public_holidays_select" ON public.hr_public_holidays;
CREATE POLICY "hr_public_holidays_select"
  ON public.hr_public_holidays FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'schedules', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_public_holidays_admin_write" ON public.hr_public_holidays;
CREATE POLICY "hr_public_holidays_admin_write"
  ON public.hr_public_holidays FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id));
