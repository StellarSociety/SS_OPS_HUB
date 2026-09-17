-- Open-position (HIRE) cards on the reporting tree. Vacancy nodes are not staff.

CREATE TABLE IF NOT EXISTS public.directory_hierarchy_hires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  reports_to_staff_id UUID REFERENCES public.staff (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  position_id UUID REFERENCES public.positions (id) ON DELETE SET NULL,
  budgeted_salary NUMERIC(14, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS directory_hierarchy_hires_venue_idx
  ON public.directory_hierarchy_hires (venue_id);

CREATE INDEX IF NOT EXISTS directory_hierarchy_hires_reports_to_idx
  ON public.directory_hierarchy_hires (reports_to_staff_id);

DROP TRIGGER IF EXISTS directory_hierarchy_hires_set_updated_at
  ON public.directory_hierarchy_hires;
CREATE TRIGGER directory_hierarchy_hires_set_updated_at
  BEFORE UPDATE ON public.directory_hierarchy_hires
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.directory_hierarchy_hires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "directory_hierarchy_hires_select" ON public.directory_hierarchy_hires;
CREATE POLICY "directory_hierarchy_hires_select"
  ON public.directory_hierarchy_hires FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(
      auth.uid(), 'directory', 'hierarchy', 'view', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'directory', 'hierarchy_management', 'view', venue_id
    )
  );

GRANT SELECT ON public.directory_hierarchy_hires TO authenticated;
GRANT ALL ON public.directory_hierarchy_hires TO service_role;

CREATE OR REPLACE FUNCTION public.can_write_directory_hierarchy(p_venue_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_app_admin(auth.uid())
    OR public.has_feature_permission(
      auth.uid(), 'directory', 'hierarchy', 'edit', p_venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'directory', 'hierarchy_management', 'view', p_venue_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_write_directory_hierarchy(UUID) TO authenticated;

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

  IF NOT public.can_write_directory_hierarchy(p_venue_id) THEN
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

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_nodes) n
    WHERE NULLIF(btrim(n->>'label'), '') IS NOT NULL
      AND char_length(btrim(n->>'label')) > 48
  ) THEN
    RAISE EXCEPTION 'Chart labels can be at most 48 characters';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_nodes) n
    WHERE n ? 'collabs'
      AND jsonb_typeof(n->'collabs') <> 'array'
  ) THEN
    RAISE EXCEPTION 'Side collabs must be an array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_nodes) n
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n->'collabs', '[]'::jsonb)) c
    WHERE NULLIF(c->>'staff_id', '') IS NULL
      OR c->>'side' NOT IN ('left', 'right')
      OR c->>'staff_id' = n->>'staff_id'
  ) THEN
    RAISE EXCEPTION 'Each side collab needs a person and a left or right side';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_nodes) n
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n->'collabs', '[]'::jsonb)) c
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = (c->>'staff_id')::uuid
        AND s.home_venue_id = p_venue_id
    )
  ) THEN
    RAISE EXCEPTION 'Side collabs can only include staff from this venue';
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
    sort_order,
    label,
    collabs,
    highlighted
  )
  SELECT
    p_venue_id,
    (n->>'staff_id')::uuid,
    NULLIF(n->>'reports_to_staff_id', '')::uuid,
    COALESCE((n->>'sort_order')::integer, 0),
    NULLIF(btrim(n->>'label'), ''),
    COALESCE(n->'collabs', '[]'::jsonb),
    COALESCE((n->>'highlighted')::boolean, false)
  FROM jsonb_array_elements(p_nodes) n;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_directory_hierarchy_hires(
  p_venue_id UUID,
  p_hires JSONB
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

  IF NOT public.can_write_directory_hierarchy(p_venue_id) THEN
    RAISE EXCEPTION 'Not authorized to edit hierarchy';
  END IF;

  IF p_hires IS NULL OR jsonb_typeof(p_hires) <> 'array' THEN
    RAISE EXCEPTION 'Hire payload must be an array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_hires) n
    WHERE NULLIF(n->>'id', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Each hire card needs an id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_hires) n
    GROUP BY n->>'id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A hire card can only appear once on the chart';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_hires) n
    WHERE NULLIF(n->>'reports_to_staff_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.staff s
        WHERE s.id = (n->>'reports_to_staff_id')::uuid
          AND s.home_venue_id = p_venue_id
      )
  ) THEN
    RAISE EXCEPTION 'Hire cards must hang under staff from this venue';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_hires) n
    WHERE NULLIF(n->>'position_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.positions p
        WHERE p.id = (n->>'position_id')::uuid
          AND p.venue_id = p_venue_id
      )
  ) THEN
    RAISE EXCEPTION 'Hire cards can only use positions from this venue';
  END IF;

  DELETE FROM public.directory_hierarchy_hires
  WHERE venue_id = p_venue_id;

  INSERT INTO public.directory_hierarchy_hires (
    id,
    venue_id,
    reports_to_staff_id,
    sort_order,
    position_id,
    budgeted_salary
  )
  SELECT
    (n->>'id')::uuid,
    p_venue_id,
    NULLIF(n->>'reports_to_staff_id', '')::uuid,
    COALESCE((n->>'sort_order')::integer, 0),
    NULLIF(n->>'position_id', '')::uuid,
    NULLIF(n->>'budgeted_salary', '')::numeric
  FROM jsonb_array_elements(p_hires) n;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_directory_hierarchy_hires(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_directory_hierarchy_hires(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_directory_hierarchy_hires(UUID, JSONB) TO authenticated;
