-- Add Venue Hire gross sales fields to venue_daily_sales

ALTER TABLE public.venue_daily_sales
  ADD COLUMN IF NOT EXISTS lunch_venue_hire_gs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dinner_venue_hire_gs NUMERIC(14, 2) NOT NULL DEFAULT 0;
