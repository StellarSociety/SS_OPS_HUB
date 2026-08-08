-- Track hub-linked WorkDrive files that are gone or trashed in Zoho.

ALTER TABLE public.hr_staff_workdrive_documents
  ADD COLUMN IF NOT EXISTS missing_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS missing_reason TEXT;

COMMENT ON COLUMN public.hr_staff_workdrive_documents.missing_at IS
  'Set when Zoho reports the linked file deleted or trashed outside the hub.';
COMMENT ON COLUMN public.hr_staff_workdrive_documents.missing_reason IS
  'deleted_on_workdrive | trashed_on_workdrive';

NOTIFY pgrst, 'reload schema';
