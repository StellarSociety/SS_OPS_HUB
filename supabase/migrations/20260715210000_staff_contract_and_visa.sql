-- Contract kind and visa fields on staff (Roles & status section).
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS contract_kind TEXT,
  ADD COLUMN IF NOT EXISTS visa_status TEXT,
  ADD COLUMN IF NOT EXISTS visa_expiry DATE;
