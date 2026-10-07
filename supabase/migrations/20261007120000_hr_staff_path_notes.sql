-- Free-text dated notes shown on the employee's Employment Path timeline.

CREATE TABLE IF NOT EXISTS public.hr_staff_path_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  note_date DATE NOT NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_staff_path_notes_staff_date_idx
  ON public.hr_staff_path_notes (staff_id, note_date DESC, created_at DESC);

ALTER TABLE public.hr_staff_path_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_staff_path_notes_select" ON public.hr_staff_path_notes;
CREATE POLICY "hr_staff_path_notes_select"
  ON public.hr_staff_path_notes FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_path_notes_insert" ON public.hr_staff_path_notes;
CREATE POLICY "hr_staff_path_notes_insert"
  ON public.hr_staff_path_notes FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_path_notes_delete" ON public.hr_staff_path_notes;
CREATE POLICY "hr_staff_path_notes_delete"
  ON public.hr_staff_path_notes FOR DELETE TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );
