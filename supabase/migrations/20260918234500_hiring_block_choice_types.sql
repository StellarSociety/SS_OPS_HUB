-- Choice fields: yes/no, dropdown, radio, checkbox, multiple choices.

ALTER TABLE public.hiring_form_blocks
  DROP CONSTRAINT IF EXISTS hiring_form_blocks_field_type_check;

ALTER TABLE public.hiring_form_blocks
  ADD CONSTRAINT hiring_form_blocks_field_type_check
  CHECK (
    field_type IS NULL
    OR field_type IN (
      'short_text',
      'long_text',
      'date',
      'number',
      'email',
      'phone',
      'nationality',
      'yes_no',
      'dropdown',
      'radio',
      'checkbox',
      'multiple_choice',
      'picture',
      'file'
    )
  );
