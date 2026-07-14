-- Daily schedule roster cells: one label per staff member per date.

CREATE TABLE IF NOT EXISTS public.staff_schedule_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  label_code TEXT NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, work_date)
);

CREATE INDEX IF NOT EXISTS staff_schedule_days_venue_date_idx
  ON public.staff_schedule_days (venue_id, work_date);

CREATE INDEX IF NOT EXISTS staff_schedule_days_staff_date_idx
  ON public.staff_schedule_days (staff_id, work_date);

ALTER TABLE public.staff_schedule_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_schedule_days_select"
  ON public.staff_schedule_days FOR SELECT TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

CREATE POLICY "staff_schedule_days_insert"
  ON public.staff_schedule_days FOR INSERT TO authenticated
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

CREATE POLICY "staff_schedule_days_update"
  ON public.staff_schedule_days FOR UPDATE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

CREATE POLICY "staff_schedule_days_delete"
  ON public.staff_schedule_days FOR DELETE TO authenticated
  USING (
    public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );
