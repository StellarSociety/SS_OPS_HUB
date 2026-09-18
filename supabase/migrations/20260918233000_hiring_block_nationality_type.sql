-- Nationality fields store a country name from a searchable world list.

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
      'picture',
      'file'
    )
  );

UPDATE public.hiring_form_blocks
SET field_type = 'nationality'
WHERE kind = 'field'
  AND field_type = 'short_text'
  AND lower(btrim(coalesce(field_label, ''))) = 'nationality';
