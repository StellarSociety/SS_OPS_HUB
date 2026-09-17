-- Highlighted people on the reporting tree (larger, darker card).

ALTER TABLE public.directory_hierarchy_nodes
  ADD COLUMN IF NOT EXISTS highlighted BOOLEAN NOT NULL DEFAULT false;

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
