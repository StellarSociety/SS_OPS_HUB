-- Background color for the second public intro screen.

ALTER TABLE public.hiring_forms
  ADD COLUMN IF NOT EXISTS intro2_background_color TEXT NOT NULL DEFAULT '#E8E8E8';
