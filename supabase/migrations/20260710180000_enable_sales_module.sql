-- Enable Sales & Revenue for all venue-scoped venues (module is now live)

INSERT INTO public.venue_modules (venue_id, module_key, enabled)
SELECT v.id, 'sales', true
FROM public.venues v
WHERE NOT v.is_global
ON CONFLICT (venue_id, module_key) DO UPDATE SET enabled = true;
