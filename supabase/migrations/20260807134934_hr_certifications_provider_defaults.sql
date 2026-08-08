-- Extend certification_types with provider defaults + staff date-field mapping.
-- Used by Staff Compliance → Certifications (catalog + employee tracking).

ALTER TABLE public.certification_types
  ADD COLUMN IF NOT EXISTS staff_field TEXT,
  ADD COLUMN IF NOT EXISTS provider_company TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_person TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cost_value NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Unique when set (maps to staff.*_date columns).
CREATE UNIQUE INDEX IF NOT EXISTS certification_types_staff_field_uidx
  ON public.certification_types (staff_field)
  WHERE staff_field IS NOT NULL;

-- Map existing seeds to staff date columns and refresh display names.
UPDATE public.certification_types
SET
  staff_field = 'ohc_date',
  name = 'OCH — Occupational Health Certificate',
  renewal_months = 12,
  lead_days = 30,
  sort_order = 1
WHERE name IN ('OHC training', 'OCH — Occupational Health Certificate')
   OR staff_field = 'ohc_date';

UPDATE public.certification_types
SET
  staff_field = 'pic_date',
  name = 'PIC — Person in Charge',
  renewal_months = 12,
  lead_days = 30,
  sort_order = 2
WHERE name IN ('PIC training', 'PIC — Person in Charge')
   OR staff_field = 'pic_date';

UPDATE public.certification_types
SET
  staff_field = 'basic_food_safety_date',
  name = 'Basic Food Safety',
  renewal_months = 12,
  lead_days = 30,
  sort_order = 3
WHERE name IN ('Food safety', 'Basic Food Safety')
   OR staff_field = 'basic_food_safety_date';

UPDATE public.certification_types
SET
  staff_field = 'fire_safety_date',
  name = 'Fire Safety',
  renewal_months = 12,
  lead_days = 30,
  sort_order = 4
WHERE name IN ('Fire safety', 'Fire Safety')
   OR staff_field = 'fire_safety_date';

UPDATE public.certification_types
SET
  staff_field = 'first_aid_date',
  name = 'First Aid',
  renewal_months = 24,
  lead_days = 30,
  sort_order = 5
WHERE name IN ('First aid', 'First Aid')
   OR staff_field = 'first_aid_date';

-- Ensure all five mandatory hospitality certifications exist.
INSERT INTO public.certification_types (
  name, renewal_months, lead_days, sort_order, staff_field
) VALUES
  ('OCH — Occupational Health Certificate', 12, 30, 1, 'ohc_date'),
  ('PIC — Person in Charge', 12, 30, 2, 'pic_date'),
  ('Basic Food Safety', 12, 30, 3, 'basic_food_safety_date'),
  ('Fire Safety', 12, 30, 4, 'fire_safety_date'),
  ('First Aid', 24, 30, 5, 'first_aid_date')
ON CONFLICT (name) DO UPDATE SET
  staff_field = EXCLUDED.staff_field,
  renewal_months = EXCLUDED.renewal_months,
  lead_days = EXCLUDED.lead_days,
  sort_order = EXCLUDED.sort_order;
