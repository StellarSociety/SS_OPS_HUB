-- Seed venue_modules for all toggleable modules (HR live; others disabled by default)

INSERT INTO public.venue_modules (venue_id, module_key, enabled)
SELECT v.id, m.module_key, m.enabled
FROM public.venues v
CROSS JOIN (
  VALUES
    ('checklists', false),
    ('sales', false),
    ('hr', true),
    ('venue_ops', false),
    ('gp_cos', false),
    ('management', false)
) AS m(module_key, enabled)
WHERE NOT v.is_global
ON CONFLICT (venue_id, module_key) DO UPDATE SET enabled = EXCLUDED.enabled;
