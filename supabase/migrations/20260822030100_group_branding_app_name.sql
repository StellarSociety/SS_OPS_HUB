-- Home Screen / PWA display name for SS OPS HUB.

ALTER TABLE public.group_branding
  ADD COLUMN IF NOT EXISTS app_name TEXT;

COMMENT ON COLUMN public.group_branding.app_name IS
  'Optional Home Screen app name. Null uses the built-in default (SS OPS HUB).';
