-- Working Status lookup (schedule roster tags). Rules that set a staff
-- member's working status will come later; the column defaults to Active.

CREATE TABLE IF NOT EXISTS public.working_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.working_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "working_statuses_select"
  ON public.working_statuses FOR SELECT TO authenticated
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

CREATE POLICY "working_statuses_admin_write"
  ON public.working_statuses FOR ALL TO authenticated
  USING (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL))
  WITH CHECK (public.has_feature_permission(auth.uid(), 'hr', 'lookups', 'admin', NULL));

INSERT INTO public.working_statuses (name, sort_order) VALUES
  ('Active', 1),
  ('Paid Leave', 2),
  ('Unpaid Leave', 3),
  ('OFF-Boarding', 4)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS working_status_id UUID
    REFERENCES public.working_statuses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS staff_working_status_idx
  ON public.staff (working_status_id);

UPDATE public.staff s
SET working_status_id = ws.id
FROM public.working_statuses ws
WHERE ws.name = 'Active'
  AND s.working_status_id IS NULL;
