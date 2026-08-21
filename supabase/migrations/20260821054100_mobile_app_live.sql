-- Unlock Mobile App: mark live globally and enable for all venue-scoped venues.

UPDATE public.app_module_states
SET state = 'live',
    updated_at = now()
WHERE module_key = 'mobile_app';

INSERT INTO public.app_module_states (module_key, state)
VALUES ('mobile_app', 'live')
ON CONFLICT (module_key) DO UPDATE
SET state = 'live',
    updated_at = now();

INSERT INTO public.venue_modules (venue_id, module_key, enabled)
SELECT v.id, 'mobile_app', true
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id, module_key) DO UPDATE SET enabled = true;
