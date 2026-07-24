-- Speeds leave-balance roster scans that filter by venue + leave label + date
-- (e.g. UPL/AL/ABS for a calendar year). Full-year unfiltered scans under RLS
-- were hitting statement_timeout on the leave balances page.
CREATE INDEX IF NOT EXISTS hr_schedule_days_venue_label_date_idx
  ON public.hr_schedule_days (venue_id, label_code, work_date);
