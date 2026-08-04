-- Uniform piece photos stored in Zoho WorkDrive (Assets > Assets Pictures).

ALTER TABLE public.hr_uniform_pieces
  ADD COLUMN IF NOT EXISTS workdrive_file_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS hr_uniform_pieces_workdrive_file_idx
  ON public.hr_uniform_pieces (workdrive_file_id)
  WHERE workdrive_file_id <> '';

NOTIFY pgrst, 'reload schema';
