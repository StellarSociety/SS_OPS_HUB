-- Operational Apps module keys (replaces legacy checklists, venue_ops, management seeds)

INSERT INTO public.venue_modules (venue_id, module_key, enabled)
SELECT v.id, m.module_key, m.enabled
FROM public.venues v
CROSS JOIN (
  VALUES
    ('operational_lists', false),
    ('team_projects', false),
    ('maintenance', false),
    ('sentiment', false),
    ('sales', false),
    ('gp_cos', false),
    ('accounting', false),
    ('hr', true),
    ('learning', false),
    ('venue_governance', false),
    ('approvals', false)
) AS m(module_key, enabled)
WHERE NOT v.is_global
ON CONFLICT (venue_id, module_key) DO NOTHING;
