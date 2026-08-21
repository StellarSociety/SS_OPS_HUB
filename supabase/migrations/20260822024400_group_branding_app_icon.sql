-- Organisation-level SS OPS HUB app icon (install page + Home Screen).

ALTER TABLE public.group_branding
  ADD COLUMN IF NOT EXISTS app_icon_url TEXT;

COMMENT ON COLUMN public.group_branding.app_icon_url IS
  'Optional override for the SS OPS HUB app icon. Null uses the built-in default.';

COMMENT ON TABLE public.group_branding IS
  'Singleton organisation branding. Group logo is shown on sign-in; app icon is shown on the install page and Home Screen.';
