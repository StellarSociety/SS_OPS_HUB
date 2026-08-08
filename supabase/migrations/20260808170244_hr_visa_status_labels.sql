-- Remap legacy staff visa_status labels to the Visa module select values.
-- No new tables — Visa history/providers remain in hr_venue_settings JSON.

UPDATE public.staff
SET visa_status = 'Visa Active self owned'
WHERE visa_status = 'Visa Self Owned';

UPDATE public.staff
SET visa_status = 'Visa Active Provided'
WHERE visa_status = 'Visa Provided';
