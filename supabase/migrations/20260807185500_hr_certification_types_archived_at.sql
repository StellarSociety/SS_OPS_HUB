-- Soft-archive for certification catalog types.

ALTER TABLE public.certification_types
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS certification_types_archived_at_idx
  ON public.certification_types (archived_at)
  WHERE archived_at IS NULL;
