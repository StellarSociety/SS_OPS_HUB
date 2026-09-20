-- Per-user mobile visibility (hidden vs no-access) and dated access blocks.
-- Hidden rows are stored even when the app is not granted, so the phone can
-- hide a tile instead of showing it locked.

ALTER TABLE public.user_module_access
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.user_module_access
  DROP CONSTRAINT IF EXISTS user_module_access_hidden_not_enabled;

ALTER TABLE public.user_module_access
  ADD CONSTRAINT user_module_access_hidden_not_enabled
  CHECK (hidden = false OR enabled = false);

CREATE INDEX IF NOT EXISTS user_module_access_hidden_idx
  ON public.user_module_access (user_id, module_key)
  WHERE hidden = true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_blocked_until DATE,
  ADD COLUMN IF NOT EXISTS access_block_from_termination BOOLEAN NOT NULL DEFAULT true;
