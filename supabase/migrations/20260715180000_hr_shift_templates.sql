-- Venue-scoped working-shift templates (time ranges) for roster scheduling.
-- Assigned days keep label_code = 'SHIFT' plus optional shift_template_id.

CREATE TABLE IF NOT EXISTS public.hr_shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  spans_midnight BOOLEAN NOT NULL DEFAULT false,
  bg_color TEXT NOT NULL DEFAULT '#d1fae5',
  text_color TEXT NOT NULL DEFAULT '#065f46',
  border_color TEXT NOT NULL DEFAULT '#a7f3d0',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (venue_id, name),
  UNIQUE (venue_id, abbreviation)
);

CREATE INDEX IF NOT EXISTS hr_shift_templates_venue_sort_idx
  ON public.hr_shift_templates (venue_id, sort_order);

ALTER TABLE public.hr_shift_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_shift_templates_select" ON public.hr_shift_templates;
CREATE POLICY "hr_shift_templates_select"
  ON public.hr_shift_templates FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
  );

DROP POLICY IF EXISTS "hr_shift_templates_admin_write" ON public.hr_shift_templates;
CREATE POLICY "hr_shift_templates_admin_write"
  ON public.hr_shift_templates FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', venue_id));

ALTER TABLE public.hr_schedule_days
  ADD COLUMN IF NOT EXISTS shift_template_id UUID
    REFERENCES public.hr_shift_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS hr_schedule_days_shift_template_idx
  ON public.hr_schedule_days (shift_template_id);

-- Seed defaults for every venue (idempotent by name).
INSERT INTO public.hr_shift_templates
  (venue_id, name, abbreviation, start_time, end_time, spans_midnight, sort_order)
SELECT
  v.id,
  seed.name,
  seed.abbreviation,
  seed.start_time::time,
  seed.end_time::time,
  seed.spans_midnight,
  seed.sort_order
FROM public.venues v
CROSS JOIN (
  VALUES
    ('11AM – 10PM', '11–10', '11:00', '22:00', false, 1),
    ('12PM – 11PM', '12–11', '12:00', '23:00', false, 2),
    ('2PM – 12AM', '2–12', '14:00', '00:00', true, 3),
    ('4PM – 2AM', '4–2', '16:00', '02:00', true, 4)
) AS seed(name, abbreviation, start_time, end_time, spans_midnight, sort_order)
ON CONFLICT (venue_id, name) DO NOTHING;
