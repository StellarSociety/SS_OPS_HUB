-- Birth/anniversary (day+month) and dietary restrictions for Guests Intel.
ALTER TABLE public.guests_intel_guests
  ADD COLUMN IF NOT EXISTS birth_anniversary TEXT,
  ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS other_diets TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.guests_intel_guests
  DROP CONSTRAINT IF EXISTS guests_intel_guests_birth_anniversary_check;

ALTER TABLE public.guests_intel_guests
  ADD CONSTRAINT guests_intel_guests_birth_anniversary_check
  CHECK (
    birth_anniversary IS NULL
    OR birth_anniversary ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
  );
