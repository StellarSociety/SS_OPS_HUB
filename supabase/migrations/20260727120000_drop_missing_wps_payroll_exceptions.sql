-- WPS employee IDs are not tracked per staff yet; remove stale payroll warnings.
DELETE FROM public.hr_payroll_exceptions
WHERE exception_type = 'missing_wps_id';
