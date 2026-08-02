-- Metadata only for HR staff documents stored in Zoho WorkDrive.
-- File bytes live in WorkDrive — never in Supabase Storage.

CREATE TABLE IF NOT EXISTS public.hr_staff_workdrive_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  emp_no TEXT NOT NULL DEFAULT '',
  doc_kind TEXT NOT NULL,
  workdrive_file_id TEXT NOT NULL,
  permalink TEXT,
  file_name TEXT NOT NULL,
  subfolder_id TEXT,
  employee_folder_id TEXT,
  path TEXT,
  content_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_staff_workdrive_documents_file_uidx
  ON public.hr_staff_workdrive_documents (venue_id, workdrive_file_id);

CREATE INDEX IF NOT EXISTS hr_staff_workdrive_documents_staff_idx
  ON public.hr_staff_workdrive_documents (venue_id, staff_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS hr_staff_workdrive_documents_kind_idx
  ON public.hr_staff_workdrive_documents (venue_id, staff_id, doc_kind);

ALTER TABLE public.hr_staff_workdrive_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hr_staff_workdrive_documents_select"
  ON public.hr_staff_workdrive_documents;
CREATE POLICY "hr_staff_workdrive_documents_select"
  ON public.hr_staff_workdrive_documents FOR SELECT TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'view', venue_id)
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_workdrive_documents_insert"
  ON public.hr_staff_workdrive_documents;
CREATE POLICY "hr_staff_workdrive_documents_insert"
  ON public.hr_staff_workdrive_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_workdrive_documents_update"
  ON public.hr_staff_workdrive_documents;
CREATE POLICY "hr_staff_workdrive_documents_update"
  ON public.hr_staff_workdrive_documents FOR UPDATE TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  )
  WITH CHECK (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'edit', venue_id)
  );

DROP POLICY IF EXISTS "hr_staff_workdrive_documents_delete"
  ON public.hr_staff_workdrive_documents;
CREATE POLICY "hr_staff_workdrive_documents_delete"
  ON public.hr_staff_workdrive_documents FOR DELETE TO authenticated
  USING (
    public.is_app_admin()
    OR public.has_feature_permission(auth.uid(), 'hr', 'staff', 'admin', venue_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_staff_workdrive_documents TO authenticated;
GRANT ALL ON public.hr_staff_workdrive_documents TO service_role;

NOTIFY pgrst, 'reload schema';
