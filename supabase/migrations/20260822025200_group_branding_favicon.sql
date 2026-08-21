-- Organisation-level favicon (sign-in + Global browser tab).

ALTER TABLE public.group_branding
  ADD COLUMN IF NOT EXISTS favicon_url TEXT;

COMMENT ON COLUMN public.group_branding.favicon_url IS
  'Optional override for the Stellar Society Group favicon. Null uses the built-in default.';
