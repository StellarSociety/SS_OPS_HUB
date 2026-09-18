-- Background color for the public hiring form body (questionnaire).

ALTER TABLE public.hiring_forms
  ADD COLUMN IF NOT EXISTS body_background_color TEXT NOT NULL DEFAULT '#E8E8E8';
