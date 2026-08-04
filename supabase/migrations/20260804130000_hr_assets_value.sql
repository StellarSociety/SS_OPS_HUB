-- Optional monetary value on company assets (AED).

ALTER TABLE public.hr_assets
  ADD COLUMN IF NOT EXISTS asset_value NUMERIC(14, 2) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
