import type { HrWorkDriveDocKind } from "@/lib/hr/types";

export type StaffDocumentUploadResult =
  | {
      ok: true;
      workdriveFileId: string;
      permalink: string;
      path: string;
      fileName: string;
    }
  | { ok: false; error: string };

/** XHR upload so we can report byte progress (fetch has no upload progress). */
export function uploadStaffDocumentViaApi(input: {
  staffId: string;
  empNo: string;
  fullName: string;
  docKind: HrWorkDriveDocKind;
  fileSlotId?: string;
  /** ISO `YYYY-MM-DD` used for `{doc_expiry}` in the WorkDrive file name. */
  docExpiry?: string | null;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<StaffDocumentUploadResult> {
  const fd = new FormData();
  fd.set("staff_id", input.staffId);
  fd.set("emp_no", input.empNo);
  fd.set("full_name", input.fullName);
  fd.set("doc_kind", input.docKind);
  if (input.fileSlotId) fd.set("file_slot_id", input.fileSlotId);
  const docExpiry = String(input.docExpiry ?? "").trim();
  if (docExpiry) fd.set("doc_expiry", docExpiry);
  fd.set("file", input.file, input.file.name);

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/hr/workdrive/upload");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
      input.onProgress?.(pct);
    };
    xhr.upload.onload = () => {
      input.onProgress?.(100);
    };

    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText) as unknown;
      } catch {
        payload = null;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const error =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof (payload as { error: unknown }).error === "string"
            ? (payload as { error: string }).error
            : `Upload failed (${xhr.status}).`;
        resolve({ ok: false, error });
        return;
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as { ok?: unknown }).ok !== true
      ) {
        resolve({ ok: false, error: "Unexpected upload response." });
        return;
      }

      const okPayload = payload as {
        workdriveFileId: string;
        permalink: string;
        path: string;
        fileName: string;
      };
      resolve({
        ok: true,
        workdriveFileId: okPayload.workdriveFileId,
        permalink: okPayload.permalink,
        path: okPayload.path,
        fileName: okPayload.fileName,
      });
    };

    xhr.onerror = () => {
      resolve({ ok: false, error: "Network error during upload." });
    };

    xhr.send(fd);
  });
}
