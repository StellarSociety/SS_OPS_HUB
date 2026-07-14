-- Configurable schedule roster day labels (abbreviation, name, colours).

CREATE TABLE IF NOT EXISTS public.schedule_day_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL,
  name TEXT NOT NULL,
  bg_color TEXT NOT NULL DEFAULT '#e5e5e5',
  text_color TEXT NOT NULL DEFAULT '#404040',
  border_color TEXT NOT NULL DEFAULT '#d4d4d4',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_day_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_day_labels_select"
  ON public.schedule_day_labels FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.module_key = 'hr'
        AND up.feature_key IN ('staff', 'lookups')
        AND public.access_level_rank(up.access_level) >= public.access_level_rank('view')
    )
  );

CREATE POLICY "schedule_day_labels_admin_write"
  ON public.schedule_day_labels FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL));

INSERT INTO public.schedule_day_labels
  (code, abbreviation, name, bg_color, text_color, border_color, sort_order)
VALUES
  ('SHIFT', 'Shift', 'Working shift', '#d1fae5', '#065f46', '#a7f3d0', 1),
  ('OFF', 'Off', 'Day off', '#e5e5e5', '#404040', '#d4d4d4', 2),
  ('AL', 'AL', 'Annual leave', '#e0f2fe', '#075985', '#bae6fd', 3),
  ('PH', 'PH', 'Public holiday', '#ede9fe', '#5b21b6', '#ddd6fe', 4),
  ('SL', 'SL', 'Sick leave', '#ffedd5', '#9a3412', '#fed7aa', 5),
  ('UPL', 'UPL', 'Unpaid leave', '#fef3c7', '#78350f', '#fde68a', 6),
  ('ABS', 'ABS', 'Absence', '#ffe4e6', '#9f1239', '#fecdd3', 7),
  ('ML', 'ML', 'Maternal leave', '#fae8ff', '#86198f', '#f5d0fe', 8),
  ('PL', 'PL', 'Parental leave', '#e0e7ff', '#3730a3', '#c7d2fe', 9),
  ('BL', 'BL', 'Bereavement leave', '#e7e5e4', '#44403c', '#d6d3d1', 10)
ON CONFLICT (code) DO NOTHING;

-- Rename legacy Paid Leave code if any schedule days were saved as LP.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff_schedule_days'
  ) THEN
    UPDATE public.staff_schedule_days
    SET label_code = 'AL'
    WHERE label_code = 'LP';
  END IF;
END $$;
