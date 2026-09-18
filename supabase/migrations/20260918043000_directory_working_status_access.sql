-- Directory photo lightbox shows working status. employment_statuses already
-- allows directory readers; working_statuses did not.

DROP POLICY IF EXISTS "working_statuses_select" ON public.working_statuses;
CREATE POLICY "working_statuses_select"
  ON public.working_statuses FOR SELECT TO authenticated
  USING (
    public.has_hr_staff_row_access(auth.uid(), NULL)
    OR public.has_directory_staff_row_access(auth.uid(), NULL)
    OR public.has_feature_access(auth.uid(), 'hr', 'lookups', NULL)
  );

-- Original working-status migration defaulted everyone to Active; later hires
-- were inserted without a lookup, so the photo dialog showed "—".
UPDATE public.staff s
SET working_status_id = ws.id
FROM public.working_statuses ws
WHERE ws.name = 'Active'
  AND s.working_status_id IS NULL;
