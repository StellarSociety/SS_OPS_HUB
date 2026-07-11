-- SS Ops Hub — Collapse venue_daily_discounts from lunch/dinner split to a
-- single per-day value per category. Existing lunch + dinner amounts are
-- summed into the new columns before the old columns are dropped.

ALTER TABLE public.venue_daily_discounts
  ADD COLUMN IF NOT EXISTS food_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beverages_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wine_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shisha_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS others_discount_gs NUMERIC(14, 2) NOT NULL DEFAULT 0;

UPDATE public.venue_daily_discounts SET
  food_discount_gs = lunch_food_discount_gs + dinner_food_discount_gs,
  beverages_discount_gs = lunch_beverages_discount_gs + dinner_beverages_discount_gs,
  wine_discount_gs = lunch_wine_discount_gs + dinner_wine_discount_gs,
  shisha_discount_gs = lunch_shisha_discount_gs + dinner_shisha_discount_gs,
  others_discount_gs = lunch_others_discount_gs + dinner_others_discount_gs;

ALTER TABLE public.venue_daily_discounts
  DROP COLUMN lunch_food_discount_gs,
  DROP COLUMN lunch_beverages_discount_gs,
  DROP COLUMN lunch_wine_discount_gs,
  DROP COLUMN lunch_shisha_discount_gs,
  DROP COLUMN lunch_others_discount_gs,
  DROP COLUMN dinner_food_discount_gs,
  DROP COLUMN dinner_beverages_discount_gs,
  DROP COLUMN dinner_wine_discount_gs,
  DROP COLUMN dinner_shisha_discount_gs,
  DROP COLUMN dinner_others_discount_gs;
