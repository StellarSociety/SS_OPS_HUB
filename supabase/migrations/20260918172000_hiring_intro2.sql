-- Intro page background color and a second public intro screen.

ALTER TABLE public.hiring_forms
  ADD COLUMN IF NOT EXISTS intro_background_color TEXT NOT NULL DEFAULT '#323232',
  ADD COLUMN IF NOT EXISTS intro2_image_url TEXT,
  ADD COLUMN IF NOT EXISTS intro2_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS intro2_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS intro2_button_label TEXT NOT NULL DEFAULT 'Continue';
