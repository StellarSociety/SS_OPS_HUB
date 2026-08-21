-- Keep the stored app name as the install / Home Screen source of truth.

ALTER TABLE public.group_branding
  ALTER COLUMN app_name SET DEFAULT 'SS Ops HUB';

UPDATE public.group_branding
SET app_name = 'SS Ops HUB'
WHERE id = 1 AND (app_name IS NULL OR btrim(app_name) = '');

COMMENT ON COLUMN public.group_branding.app_name IS
  'Install page and Home Screen app name. Empty values use SS Ops HUB.';
