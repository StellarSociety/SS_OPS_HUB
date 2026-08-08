-- Short display label for employee-table column headers.

ALTER TABLE public.certification_types
  ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT '';

-- Seed sensible short labels from known staff_field mappings.
UPDATE public.certification_types
SET label = CASE staff_field
  WHEN 'ohc_date' THEN 'OCH'
  WHEN 'pic_date' THEN 'PIC'
  WHEN 'basic_food_safety_date' THEN 'Food safety'
  WHEN 'fire_safety_date' THEN 'Fire safety'
  WHEN 'first_aid_date' THEN 'First aid'
  ELSE COALESCE(NULLIF(trim(label), ''), left(name, 40))
END
WHERE coalesce(trim(label), '') = '';
