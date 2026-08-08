import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HrWorkDriveDocKind } from "@/lib/hr/types";
import {
  probeWorkDriveFilePresence,
  type WorkDriveFilePresence,
} from "@/lib/hr/workdrive/client";

export type WorkDriveMissingReason =
  | "deleted_on_workdrive"
  | "trashed_on_workdrive";

export type StaffWorkDriveDocumentRow = {
  id: string;
  venue_id: string;
  staff_id: string;
  emp_no: string;
  doc_kind: HrWorkDriveDocKind;
  file_slot_id: string | null;
  workdrive_file_id: string;
  permalink: string | null;
  file_name: string;
  subfolder_id: string | null;
  employee_folder_id: string | null;
  path: string | null;
  content_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  missing_at: string | null;
  missing_reason: WorkDriveMissingReason | null;
};

export async function persistStaffWorkDriveDocument(
  supabase: SupabaseClient,
  row: {
    venueId: string;
    staffId: string;
    empNo: string;
    docKind: HrWorkDriveDocKind;
    fileSlotId?: string | null;
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
      file_slot_id: row.fileSlotId?.trim() || null,
      workdrive_file_id: row.workdriveFileId,
      permalink: row.permalink || null,
      file_name: row.fileName,
      subfolder_id: row.subfolderId || null,
      employee_folder_id: row.employeeFolderId || null,
      path: row.path || null,
      content_type: row.contentType || null,
      uploaded_by: row.uploadedBy ?? null,
      missing_at: null,
      missing_reason: null,
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

export async function listStaffWorkDriveDocuments(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
  docKind: HrWorkDriveDocKind,
  opts?: { fileSlotId?: string | null },
): Promise<StaffWorkDriveDocumentRow[]> {
  let query = supabase
    .from("hr_staff_workdrive_documents")
    .select("*")
    .eq("venue_id", venueId)
    .eq("staff_id", staffId)
    .eq("doc_kind", docKind)
    .order("uploaded_at", { ascending: false });

  const slot = String(opts?.fileSlotId ?? "").trim();
  if (slot) {
    query = query.eq("file_slot_id", slot);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return (data ?? []) as StaffWorkDriveDocumentRow[];
}

export async function deleteStaffWorkDriveDocumentMeta(
  supabase: SupabaseClient,
  venueId: string,
  documentId: string,
): Promise<StaffWorkDriveDocumentRow | null> {
  const { data, error } = await supabase
    .from("hr_staff_workdrive_documents")
    .delete()
    .eq("venue_id", venueId)
    .eq("id", documentId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as StaffWorkDriveDocumentRow | null) ?? null;
}

export async function getStaffWorkDriveDocumentById(
  supabase: SupabaseClient,
  venueId: string,
  documentId: string,
): Promise<StaffWorkDriveDocumentRow | null> {
  const { data, error } = await supabase
    .from("hr_staff_workdrive_documents")
    .select("*")
    .eq("venue_id", venueId)
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as StaffWorkDriveDocumentRow | null) ?? null;
}

export async function updateStaffWorkDriveDocumentFileName(
  supabase: SupabaseClient,
  venueId: string,
  documentId: string,
  fileName: string,
): Promise<void> {
  const { error } = await supabase
    .from("hr_staff_workdrive_documents")
    .update({ file_name: fileName })
    .eq("venue_id", venueId)
    .eq("id", documentId);
  if (error) throw new Error(error.message);
}

export async function markStaffWorkDriveDocumentMissing(
  supabase: SupabaseClient,
  venueId: string,
  documentId: string,
  reason: WorkDriveMissingReason,
): Promise<void> {
  const { error } = await supabase
    .from("hr_staff_workdrive_documents")
    .update({
      missing_at: new Date().toISOString(),
      missing_reason: reason,
    })
    .eq("venue_id", venueId)
    .eq("id", documentId);
  if (error) throw new Error(error.message);
}

export async function clearStaffWorkDriveDocumentMissing(
  supabase: SupabaseClient,
  venueId: string,
  documentId: string,
): Promise<void> {
  const { error } = await supabase
    .from("hr_staff_workdrive_documents")
    .update({
      missing_at: null,
      missing_reason: null,
    })
    .eq("venue_id", venueId)
    .eq("id", documentId);
  if (error) throw new Error(error.message);
}

const PRESENCE_PROBE_CONCURRENCY = 4;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]!);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Probe WorkDrive for each row and persist missing / restored state.
 * Auth failures leave rows unchanged (`unknown`).
 */
export async function reconcileStaffWorkDriveDocumentsPresence(params: {
  supabase: SupabaseClient;
  venueId: string;
  apiDomain: string;
  accessToken: string;
  rows: StaffWorkDriveDocumentRow[];
}): Promise<StaffWorkDriveDocumentRow[]> {
  const { supabase, venueId, apiDomain, accessToken, rows } = params;
  if (rows.length === 0) return rows;

  const probes = await mapPool(rows, PRESENCE_PROBE_CONCURRENCY, async (row) => {
    const presence: WorkDriveFilePresence = await probeWorkDriveFilePresence(
      apiDomain,
      accessToken,
      row.workdrive_file_id,
    );
    return { row, presence };
  });

  const nextRows: StaffWorkDriveDocumentRow[] = [];
  for (const { row, presence } of probes) {
    if (presence.state === "unknown") {
      nextRows.push(row);
      continue;
    }
    if (presence.state === "missing") {
      if (row.missing_at && row.missing_reason === presence.reason) {
        nextRows.push(row);
        continue;
      }
      await markStaffWorkDriveDocumentMissing(
        supabase,
        venueId,
        row.id,
        presence.reason,
      );
      nextRows.push({
        ...row,
        missing_at: new Date().toISOString(),
        missing_reason: presence.reason,
      });
      continue;
    }
    // present
    if (row.missing_at || row.missing_reason) {
      await clearStaffWorkDriveDocumentMissing(supabase, venueId, row.id);
      nextRows.push({
        ...row,
        missing_at: null,
        missing_reason: null,
      });
      continue;
    }
    nextRows.push(row);
  }
  return nextRows;
}
