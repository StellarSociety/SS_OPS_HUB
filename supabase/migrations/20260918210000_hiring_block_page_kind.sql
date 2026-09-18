-- Page division blocks split the public hiring questionnaire into multiple screens.

ALTER TABLE public.hiring_form_blocks
  DROP CONSTRAINT IF EXISTS hiring_form_blocks_kind_check;

ALTER TABLE public.hiring_form_blocks
  ADD CONSTRAINT hiring_form_blocks_kind_check
  CHECK (kind IN ('title', 'description', 'field', 'page'));
