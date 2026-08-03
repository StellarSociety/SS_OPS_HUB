-- Expiry dates for labour contract and eResidence card (Employment Doc's).
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS contract_expiry DATE,
  ADD COLUMN IF NOT EXISTS eresidence_expiry DATE;

CREATE INDEX IF NOT EXISTS staff_contract_expiry_idx
  ON public.staff (contract_expiry);

CREATE INDEX IF NOT EXISTS staff_eresidence_expiry_idx
  ON public.staff (eresidence_expiry);
