-- Chart-only people (external partners, etc.) can sit on the reporting tree
-- without appearing in HR employee lists, payroll, or the staff directory.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS org_chart_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff.org_chart_only IS
  'True when this row exists only for Directory Hierarchy. Not an HR employee.';

CREATE INDEX IF NOT EXISTS staff_org_chart_only_idx
  ON public.staff (home_venue_id)
  WHERE org_chart_only = false;
