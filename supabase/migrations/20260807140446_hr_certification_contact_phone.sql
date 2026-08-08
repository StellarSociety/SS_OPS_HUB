-- Contact phone for certification provider defaults.

ALTER TABLE public.certification_types
  ADD COLUMN IF NOT EXISTS contact_phone TEXT NOT NULL DEFAULT '';
