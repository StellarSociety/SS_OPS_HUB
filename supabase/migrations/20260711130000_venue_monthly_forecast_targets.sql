-- Extend monthly forecasts with covers and ASPH targets per revenue center

ALTER TABLE public.venue_monthly_forecasts
  ADD COLUMN IF NOT EXISTS forecast_covers NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_venue_asph NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_food_asph NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_beverages_asph NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_wine_asph NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_shisha_asph NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forecast_other_asph NUMERIC(14, 2) NOT NULL DEFAULT 0;
