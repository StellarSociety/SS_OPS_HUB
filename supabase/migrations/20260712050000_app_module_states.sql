-- SS Ops Hub — Global per-app display state (Apps Hub visibility & access)
-- States:
--   live           → normal, clickable
--   coming_soon    → "Coming soon" stamp, not clickable
--   visible_locked → faded icon, visible but access path blocked
--   hidden         → removed entirely from the Apps Hub

CREATE TABLE public.app_module_states (
  module_key TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'live'
    CHECK (state IN ('live', 'coming_soon', 'visible_locked', 'hidden')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_module_states ENABLE ROW LEVEL SECURITY;

-- Everyone signed in needs to know app states to render the hub correctly.
CREATE POLICY "app_module_states_select_authenticated"
  ON public.app_module_states
  FOR SELECT
  TO authenticated
  USING (true);

-- Only app admins can change states (service role bypasses RLS anyway).
CREATE POLICY "app_module_states_admin_write"
  ON public.app_module_states
  FOR ALL
  TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- Seed from the current static registry defaults.
INSERT INTO public.app_module_states (module_key, state)
VALUES
  ('operational_lists', 'coming_soon'),
  ('team_projects', 'coming_soon'),
  ('maintenance', 'coming_soon'),
  ('sentiment', 'coming_soon'),
  ('sales', 'live'),
  ('gp_cos', 'coming_soon'),
  ('accounting', 'coming_soon'),
  ('hr', 'live'),
  ('learning', 'coming_soon'),
  ('venue_governance', 'coming_soon'),
  ('approvals', 'coming_soon')
ON CONFLICT (module_key) DO NOTHING;
