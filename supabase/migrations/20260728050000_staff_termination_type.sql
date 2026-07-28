-- Per-staff resignation vs involuntary termination — drives gratuity / service charge entitlement.
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS termination_type TEXT
  CHECK (termination_type IS NULL OR termination_type IN ('resignation', 'termination'));

COMMENT ON COLUMN staff.termination_type IS
  'How employment ended when termination_date is set. Used by HR benefits (gratuity / service charge) with venue policy toggles.';
