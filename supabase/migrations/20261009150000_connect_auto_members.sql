-- Connecteam: "everyone" groups.
-- A group with auto_member_role includes every active Hub user with access at
-- the venue (venue-scoped or global grants) at that role — new employees join
-- automatically once they get a login. Explicit connect_group_members rows
-- override the default (e.g. promote someone to moderator).

ALTER TABLE public.connect_groups
  ADD COLUMN IF NOT EXISTS auto_member_role TEXT
    CHECK (auto_member_role IN ('contributor', 'viewer'));

CREATE OR REPLACE FUNCTION public.connect_has_venue_presence(
  check_venue_id uuid,
  check_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_permissions up
    JOIN public.profiles p ON p.id = up.user_id AND p.status = 'active'
    WHERE up.user_id = check_user_id
      AND (up.venue_id IS NULL OR up.venue_id = check_venue_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.connect_has_venue_presence(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.connect_can_view_group(
  check_group_id uuid,
  check_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.connect_group_members m
    WHERE m.group_id = check_group_id AND m.user_id = check_user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.connect_groups g
    WHERE g.id = check_group_id
      AND (
        (g.auto_member_role IS NOT NULL
          AND public.connect_has_venue_presence(g.venue_id, check_user_id))
        OR public.has_feature_permission(check_user_id, 'team_connect', 'settings', 'view', g.venue_id)
      )
  );
$$;

-- Announcements: everyone reads it.
UPDATE public.connect_groups
SET auto_member_role = 'viewer'
WHERE lower(name) = 'announcements' AND auto_member_role IS NULL;

NOTIFY pgrst, 'reload schema';
