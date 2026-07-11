-- Daily sales — manually entered tax collection amounts (gross) per day,
-- compared against the values computed from the day's Total Revenue.

ALTER TABLE public.venue_daily_sales
  ADD COLUMN IF NOT EXISTS vat_collected_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS municipality_fee_collected_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_collected_gs NUMERIC(14, 2) NOT NULL DEFAULT 0;
