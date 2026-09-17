-- Directory hierarchy: venue reporting tree (who reports to whom).
-- Unassigned staff are simply omitted. Null reports_to_staff_id = top of chart.

CREATE TABLE public.directory_hierarchy_charts (
  venue_id UUID PRIMARY KEY REFERENCES public.venues (id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE TABLE public.directory_hierarchy_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff (id) ON DELETE CASCADE,
  reports_to_staff_id UUID REFERENCES public.staff (id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT directory_hierarchy_nodes_venue_staff_key UNIQUE (venue_id, staff_id),
  CONSTRAINT directory_hierarchy_nodes_not_self CHECK (staff_id <> reports_to_staff_id)
);

CREATE INDEX directory_hierarchy_nodes_staff_idx
  ON public.directory_hierarchy_nodes (staff_id);

CREATE INDEX directory_hierarchy_nodes_reports_to_idx
  ON public.directory_hierarchy_nodes (reports_to_staff_id);

DROP TRIGGER IF EXISTS directory_hierarchy_charts_set_updated_at
  ON public.directory_hierarchy_charts;
CREATE TRIGGER directory_hierarchy_charts_set_updated_at
  BEFORE UPDATE ON public.directory_hierarchy_charts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS directory_hierarchy_nodes_set_updated_at
  ON public.directory_hierarchy_nodes;
CREATE TRIGGER directory_hierarchy_nodes_set_updated_at
  BEFORE UPDATE ON public.directory_hierarchy_nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.directory_hierarchy_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_hierarchy_nodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_hierarchy_charts_select" ON public.directory_hierarchy_charts;
CREATE POLICY "directory_hierarchy_charts_select"
  ON public.directory_hierarchy_charts FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(
      auth.uid(), 'directory', 'hierarchy', 'view', venue_id
    )
  );

DROP POLICY IF EXISTS "directory_hierarchy_nodes_select" ON public.directory_hierarchy_nodes;
CREATE POLICY "directory_hierarchy_nodes_select"
  ON public.directory_hierarchy_nodes FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(
      auth.uid(), 'directory', 'hierarchy', 'view', venue_id
    )
  );

GRANT SELECT ON public.directory_hierarchy_charts TO authenticated;
GRANT SELECT ON public.directory_hierarchy_nodes TO authenticated;
GRANT ALL ON public.directory_hierarchy_charts TO service_role;
GRANT ALL ON public.directory_hierarchy_nodes TO service_role;

CREATE OR REPLACE FUNCTION public.replace_directory_hierarchy(
  p_venue_id UUID,
  p_nodes JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_venue_id IS NULL THEN
    RAISE EXCEPTION 'Venue is required';
  END IF;

  IF NOT (
    public.is_app_admin(auth.uid())
    OR public.has_feature_permission(
      auth.uid(), 'directory', 'hierarchy', 'edit', p_venue_id
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to edit hierarchy';
  END IF;

  IF p_nodes IS NULL OR jsonb_typeof(p_nodes) <> 'array' THEN
    RAISE EXCEPTION 'Hierarchy payload must be an array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_nodes) n
    WHERE NULLIF(n->>'staff_id', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Each person on the chart needs a staff id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_nodes) n
    GROUP BY n->>'staff_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A person can only appear once on the chart';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_nodes) n
    WHERE (n->>'staff_id') = NULLIF(n->>'reports_to_staff_id', '')
  ) THEN
    RAISE EXCEPTION 'A person cannot report to themselves';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_nodes) n
    WHERE NULLIF(n->>'reports_to_staff_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_nodes) parent
        WHERE parent->>'staff_id' = n->>'reports_to_staff_id'
      )
  ) THEN
    RAISE EXCEPTION 'Reports must hang under someone already on the chart';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_nodes) n
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = (n->>'staff_id')::uuid
        AND s.home_venue_id = p_venue_id
    )
  ) THEN
    RAISE EXCEPTION 'Hierarchy can only include staff from this venue';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_nodes) n
    WHERE NULLIF(n->>'reports_to_staff_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.id = (n->>'reports_to_staff_id')::uuid
          AND s.home_venue_id = p_venue_id
      )
  ) THEN
    RAISE EXCEPTION 'Reports must hang under staff from this venue';
  END IF;

  INSERT INTO public.directory_hierarchy_charts (venue_id, updated_by)
  VALUES (p_venue_id, auth.uid())
  ON CONFLICT (venue_id) DO UPDATE
  SET updated_by = excluded.updated_by,
      updated_at = now();

  DELETE FROM public.directory_hierarchy_nodes
  WHERE venue_id = p_venue_id;

  INSERT INTO public.directory_hierarchy_nodes (
    venue_id,
    staff_id,
    reports_to_staff_id,
    sort_order
  )
  SELECT
    p_venue_id,
    (n->>'staff_id')::uuid,
    NULLIF(n->>'reports_to_staff_id', '')::uuid,
    COALESCE((n->>'sort_order')::integer, 0)
  FROM jsonb_array_elements(p_nodes) n;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_directory_hierarchy(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_directory_hierarchy(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_directory_hierarchy(UUID, JSONB) TO authenticated;

-- Hierarchy viewers also need staff identity on the chart.
CREATE OR REPLACE FUNCTION public.has_directory_staff_row_access(
  check_user_id UUID,
  p_venue_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_app_admin(check_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_permissions up
      WHERE up.user_id = check_user_id
        AND up.module_key = 'directory'
        AND up.feature_key = ANY (ARRAY['staff', 'celebrations', 'hierarchy']::text[])
        AND up.access_level IN ('view', 'edit', 'admin')
        AND (
          up.venue_id IS NULL
          OR p_venue_id IS NULL
          OR up.venue_id = p_venue_id
        )
    );
$$;

-- Seed current Managing Partners at the top of each venue chart.
INSERT INTO public.directory_hierarchy_charts (venue_id)
SELECT DISTINCT s.home_venue_id
FROM public.staff s
JOIN public.positions p ON p.id = s.position_id
JOIN public.venues v ON v.id = s.home_venue_id
LEFT JOIN public.employment_statuses es ON es.id = s.employment_status_id
WHERE NOT v.is_global
  AND lower(btrim(p.name)) = 'managing partner'
  AND lower(btrim(coalesce(es.name, ''))) NOT IN ('hiring', 'out')
ON CONFLICT (venue_id) DO NOTHING;

INSERT INTO public.directory_hierarchy_nodes (
  venue_id,
  staff_id,
  reports_to_staff_id,
  sort_order
)
SELECT
  s.home_venue_id,
  s.id,
  NULL,
  (row_number() OVER (PARTITION BY s.home_venue_id ORDER BY s.full_name) - 1)::integer
FROM public.staff s
JOIN public.positions p ON p.id = s.position_id
JOIN public.venues v ON v.id = s.home_venue_id
LEFT JOIN public.employment_statuses es ON es.id = s.employment_status_id
WHERE NOT v.is_global
  AND lower(btrim(p.name)) = 'managing partner'
  AND lower(btrim(coalesce(es.name, ''))) NOT IN ('hiring', 'out')
ON CONFLICT (venue_id, staff_id) DO NOTHING;
