-- Admin-recoverable login passwords (AES ciphertext only).
-- Written exclusively via the service role from server actions when a
-- plaintext password is known (manual set / invite / self-reset).
-- No authenticated policies — never exposed through the Data API.

CREATE TABLE IF NOT EXISTS public.user_login_passwords (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_encrypted TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_login_passwords ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_login_passwords FROM anon, authenticated;
GRANT ALL ON TABLE public.user_login_passwords TO service_role;

CREATE OR REPLACE FUNCTION public.user_login_passwords_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_login_passwords_set_updated_at
  ON public.user_login_passwords;
CREATE TRIGGER user_login_passwords_set_updated_at
  BEFORE UPDATE ON public.user_login_passwords
  FOR EACH ROW EXECUTE FUNCTION public.user_login_passwords_touch();
