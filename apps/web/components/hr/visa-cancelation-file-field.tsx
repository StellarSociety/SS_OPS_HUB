"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { StaffDocumentUploadSlot } from "@/components/hr/staff-document-upload-slot";
import { StaffWorkDriveDocumentList } from "@/components/hr/staff-workdrive-document-list";
import {
  listStaffWorkDriveDocs,
  type StaffWorkDriveDocumentListItem,
} from "@/lib/actions/hr-workdrive";
import { uploadStaffDocumentViaApi } from "@/lib/hr/workdrive/client-upload";
import { cn } from "@/lib/utils";

type VisaCancelationFileFieldProps = {
  staffId: string;
  empNo: string;
  fullName: string;
  fileSlotId?: string | null;
  docExpiry?: string | null;
  readOnly?: boolean;
  className?: string;
};

export function VisaCancelationFileField({
  staffId,
  empNo,
  fullName,
  fileSlotId = null,
  docExpiry = null,
  readOnly = false,
  className,
}: VisaCancelationFileFieldProps) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [docs, setDocs] = useState<StaffWorkDriveDocumentListItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  async function reload() {
    if (!staffId) {
      setDocs([]);
      return;
    }
    setDocsLoading(true);
    const result = await listStaffWorkDriveDocs({
      staffId,
      docKind: "visa_cancelation",
    });
    setDocs(result.ok ? result.items : []);
    setDocsLoading(false);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on identity/slot
  }, [staffId, fileSlotId]);

  const slot = String(fileSlotId ?? "").trim();
  const visibleDocs = docs.filter((row) => {
    const rowSlot = String(row.fileSlotId ?? "").trim();
    if (!slot || slot === "default") return true;
    return !rowSlot || rowSlot === "default" || rowSlot === slot;
  });
  const existing = visibleDocs.find((row) => !row.isMissing) ?? visibleDocs[0] ?? null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm font-medium text-[#3D421F]">
        Visa cancelation document
      </p>
      <p className="min-h-[2.5rem] text-[11px] leading-snug text-black/40">
        Same WorkDrive file as Staff → Employment documents. Drop a PDF or photo
        here, or open the file already on Drive.
      </p>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <StaffDocumentUploadSlot
          className="shrink-0"
          label="Drop or click cancelation letter"
          file={file}
          existingFile={
            existing
              ? {
                  fileName: existing.fileName,
                  workdriveFileId: existing.workdriveFileId,
                  permalink: existing.permalink,
                }
              : null
          }
          onFileChange={(next) => {
            setFile(next);
            setNote(null);
          }}
          readOnly={readOnly}
          uploadingToDrive={uploading}
          uploadProgress={progress}
          driveUploadNote={note}
          onUploadToDrive={
            readOnly || !file
              ? undefined
              : () => {
                  if (uploading) return;
                  void (async () => {
                    if (!file) return;
                    setUploading(true);
                    setProgress(0);
                    try {
                      const result = await uploadStaffDocumentViaApi({
                        staffId,
                        empNo: empNo.trim(),
                        fullName: fullName.trim(),
                        docKind: "visa_cancelation",
                        fileSlotId: slot || undefined,
                        docExpiry,
                        file,
                        onProgress: setProgress,
                      });
                      if (!result.ok) {
                        toast.error(result.error);
                        setNote(result.error);
                        return;
                      }
                      toast.saved("Visa cancelation uploaded to WorkDrive");
                      setNote(null);
                      setFile(null);
                      await reload();
                    } catch (error) {
                      const message =
                        error instanceof Error
                          ? error.message
                          : "Upload failed.";
                      toast.error(message);
                      setNote(message);
                    } finally {
                      setUploading(false);
                      setProgress(null);
                    }
                  })();
                }
          }
        />
        <div className="min-w-0 flex-1">
          {docsLoading && visibleDocs.length === 0 ? (
            <p className="text-[11px] text-black/40">Loading document…</p>
          ) : null}
          <StaffWorkDriveDocumentList
            items={visibleDocs}
            readOnly={readOnly}
            className="mt-0"
            onDeleted={(documentId) => {
              setDocs((prev) => prev.filter((row) => row.id !== documentId));
            }}
            onRenamed={(documentId, next) => {
              setDocs((prev) =>
                prev.map((row) =>
                  row.id === documentId
                    ? { ...row, fileName: next.fileName, path: next.path }
                    : row,
                ),
              );
            }}
          />
          {!docsLoading && visibleDocs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-3 py-4 text-center text-[11px] text-black/40">
              No cancelation file uploaded yet
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
