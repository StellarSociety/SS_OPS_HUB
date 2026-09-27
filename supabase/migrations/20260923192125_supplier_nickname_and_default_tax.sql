-- Short display name, and Standard purchases 5% (SP) as the default tax
-- on suppliers that do not already have one.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS nickname TEXT;

UPDATE public.suppliers s
SET default_tax_code_id = tc.id,
    updated_at = now()
FROM public.tax_codes tc
WHERE tc.code = 'SP'
  AND s.default_tax_code_id IS NULL;
