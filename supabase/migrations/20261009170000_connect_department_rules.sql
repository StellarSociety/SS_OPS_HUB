-- Connecteam: automatic membership by HR department.
-- Hub users whose linked staff record (profiles.staff_id) is in a rule's
-- department join the group at that role. Combined with the group's
-- "everyone" role, the highest automatic role wins; explicit
-- connect_group_members rows always override automatic roles.

CREATE TABLE IF NOT EXISTS public.connect_group_department_rules (
  group_id UUID NOT NULL REFERENCES public.connect_groups(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'contributor'
    CHECK (role IN ('moderator', 'contributor', 'viewer')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, department_id)
);

ALTER TABLE public.connect_group_department_rules ENABLE ROW LEVEL SECURITY;

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
  )
  OR EXISTS (
    SELECT 1
    FROM public.connect_group_department_rules r
    JOIN public.staff s ON s.department_id = r.department_id
    JOIN public.profiles p ON p.staff_id = s.id AND p.status = 'active'
    WHERE r.group_id = check_group_id
      AND p.id = check_user_id
      AND public.connect_has_venue_presence(r.venue_id, check_user_id)
  );
$$;

DROP POLICY IF EXISTS "connect_group_department_rules_select" ON public.connect_group_department_rules;
CREATE POLICY "connect_group_department_rules_select" ON public.connect_group_department_rules
  FOR SELECT TO authenticated
  USING (public.connect_can_view_group(group_id));

GRANT SELECT ON public.connect_group_department_rules TO authenticated;
GRANT ALL ON public.connect_group_department_rules TO service_role;

NOTIFY pgrst, 'reload schema';
