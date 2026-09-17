-- Hierarchy Management can read the same reporting tree and staff identity
-- as Hierarchy, without requiring the Hierarchy feature grant.

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
        AND up.feature_key = ANY (
          ARRAY['staff', 'celebrations', 'hierarchy', 'hierarchy_management']::text[]
        )
        AND up.access_level IN ('view', 'edit', 'admin')
        AND (
          up.venue_id IS NULL
          OR p_venue_id IS NULL
          OR up.venue_id = p_venue_id
        )
    );
$$;

DROP POLICY IF EXISTS "directory_hierarchy_charts_select" ON public.directory_hierarchy_charts;
CREATE POLICY "directory_hierarchy_charts_select"
  ON public.directory_hierarchy_charts FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(
      auth.uid(), 'directory', 'hierarchy', 'view', venue_id
    )
    OR public.has_feature_permission(
      auth.uid(), 'directory', 'hierarchy_management', 'view', venue_id
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
    OR public.has_feature_permission(
      auth.uid(), 'directory', 'hierarchy_management', 'view', venue_id
    )
  );
