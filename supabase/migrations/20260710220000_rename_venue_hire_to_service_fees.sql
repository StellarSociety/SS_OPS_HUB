-- Rename Venue Hire columns to Service Fees on venue_daily_sales

ALTER TABLE public.venue_daily_sales
  RENAME COLUMN lunch_venue_hire_gs TO lunch_service_fees_gs;

ALTER TABLE public.venue_daily_sales
  RENAME COLUMN dinner_venue_hire_gs TO dinner_service_fees_gs;
