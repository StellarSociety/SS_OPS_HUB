-- Mark Accounting and HACCP SafeLog as coming soon until they are ready to go live.

UPDATE public.app_module_states
SET state = 'coming_soon',
    updated_at = now()
WHERE module_key IN ('accounting', 'save_log');

INSERT INTO public.app_module_states (module_key, state)
VALUES
  ('accounting', 'coming_soon'),
  ('save_log', 'coming_soon')
ON CONFLICT (module_key) DO UPDATE
SET state = 'coming_soon',
    updated_at = now();
