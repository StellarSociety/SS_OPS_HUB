import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HrWorkDriveDocKind } from "@/lib/hr/types";

export type StaffWorkDriveDocumentRow = {
  id: string;
  venue_id: string;
  staff_id: string;
  emp_no: string;
  doc_kind: HrWorkDriveDocKind;
  workdrive_file_id: string;
  permalink: string | null;
  file_name: string;
  subfolder_id: string | null;
  employee_folder_id: string | null;
  path: string | null;
  content_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

export async function persistStaffWorkDriveDocument(
  supabase: SupabaseClient,
  row: {
    venueId: string;
    staffId: string;
    empNo: string;
    docKind: HrWorkDriveDocKind;
    workdriveFileId: string;
    permalink: string;
    fileName: string;
    subfolderId: string;
    employeeFolderId: string;
    path: string;
    contentType?: string;
    uploadedBy?: string | null;
  },
): Promise<StaffWorkDriveDocumentRow> {
  const { data, error } = await supabase
    .from("hr_staff_workdrive_documents")
    .insert({
      venue_id: row.venueId,
      staff_id: row.staffId,
      emp_no: row.empNo,
      doc_kind: row.docKind,
      workdrive_file_id: row.workdriveFileId,
      permalink: row.permalink || null,
      file_name: row.fileName,
      subfolder_id: row.subfolderId || null,
      employee_folder_id: row.employeeFolderId || null,
      path: row.path || null,
      content_type: row.contentType || null,
      uploaded_by: row.uploadedBy ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data as StaffWorkDriveDocumentRow;
}

export async function getStaffWorkDriveDocumentByFileId(
  supabase: SupabaseClient,
  venueId: string,
  workdriveFileId: string,
): Promise<StaffWorkDriveDocumentRow | null> {
  const { data, error } = await supabase
    .from("hr_staff_workdrive_documents")
    .select("*")
    .eq("venue_id", venueId)
    .eq("workdrive_file_id", workdriveFileId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as StaffWorkDriveDocumentRow | null) ?? null;
}
