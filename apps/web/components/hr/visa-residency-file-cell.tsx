"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  Eye,
  FileText,
  FileWarning,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import {
  listStaffWorkDriveDocs,
  type StaffWorkDriveDocumentListItem,
} from "@/lib/actions/hr-workdrive";
import { StaffDocumentUploadSlot } from "@/components/hr/staff-document-upload-slot";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { uploadStaffDocumentViaApi } from "@/lib/hr/workdrive/client-upload";
import {
  resolveDirectoryVisaStatus,
  type HrWorkDriveDocKind,
  type VisaEmployeeRow,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

function downloadUrlFor(item: StaffWorkDriveDocumentListItem) {
  return `/api/hr/workdrive/download/${encodeURIComponent(item.workdriveFileId)}`;
}

function filePreviewKind(fileName: string): "pdf" | "image" | "unsupported" {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  return "unsupported";
}

export function isSelfOwnedVisaStatus(
  status: string | null | undefined,
): boolean {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .includes("self owned");
}

export function isProvidedVisaStatus(
  status: string | null | undefined,
): boolean {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .includes("provided");
}

/** Company cancelation flow — provided visas only (not self-owned). */
export function canShowVisaCancelationAction(row: {
  visaStatus?: string | null;
  staff: { visa_status?: string | null };
  cancelDate?: string | null;
  isCanceled?: boolean;
}): boolean {
  const status = resolveDirectoryVisaStatus(
    row.staff.visa_status,
    row.visaStatus,
  );
  if (isSelfOwnedVisaStatus(status)) return false;
  if (isProvidedVisaStatus(status)) return true;
  // After cancelation, status becomes Visa Canceled — still allow edit.
  return Boolean(row.cancelDate || row.isCanceled);
}

/** Self-owned visas — initiate PRO issue email draft (not cancelation). */
export function canShowVisaIssueAction(row: {
  visaStatus?: string | null;
  staff: { visa_status?: string | null };
}): boolean {
  const status = resolveDirectoryVisaStatus(
    row.staff.visa_status,
    row.visaStatus,
  );
  return isSelfOwnedVisaStatus(status);
}

type VisaDocFileKind = "eresidence_card" | "visa_noc";

type VisaDocFileCellProps = {
  row: VisaEmployeeRow;
  canManage: boolean;
  onUploaded: () => void;
  docKind: VisaDocFileKind;
  hasFile: boolean;
  /** When false, render an empty dash (e.g. NOC when not self-owned). */
  applicable?: boolean;
  label: string;
  previewTitle: string;
  missingToast: string;
};

function VisaDocFileCell({
  row,
  canManage,
  onUploaded,
  docKind,
  hasFile,
  applicable = true,
  label,
  previewTitle,
  missingToast,
}: VisaDocFileCellProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewItem, setPreviewItem] =
    useState<StaffWorkDriveDocumentListItem | null>(null);

  async function openPreview() {
    if (loadingPreview) return;
    setLoadingPreview(true);
    try {
      const result = await listStaffWorkDriveDocs({
        staffId: row.staff.id,
        docKind: docKind as HrWorkDriveDocKind,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const item = result.items[0] ?? null;
      if (!item) {
        toast.error(missingToast);
        return;
      }
      if (item.isMissing) {
        toast.error("This file was deleted from WorkDrive.");
        return;
      }
      setPreviewItem(item);
      setPreviewOpen(true);
    } finally {
      setLoadingPreview(false);
    }
  }

  if (!applicable) {
    return (
      <div className="flex items-center justify-center text-xs text-black/30">
        —
      </div>
    );
  }

  if (hasFile) {
    return (
      <>
        <div
          className="flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title={`Preview ${label}`}
            aria-label={`Preview ${label} for ${row.staff.full_name}`}
            disabled={loadingPreview}
            onClick={() => {
              void openPreview();
            }}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md border transition",
              "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100",
              "disabled:opacity-50",
            )}
          >
            {loadingPreview ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>

        {previewOpen && previewItem ? (
          <DocPreviewDialog
            item={previewItem}
            title={previewTitle}
            onClose={() => {
              setPreviewOpen(false);
              setPreviewItem(null);
            }}
          />
        ) : null}
      </>
    );
  }

  if (!canManage) {
    return (
      <div
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-black/[0.03] text-black/35"
          title={`No ${label} on file`}
          aria-label={`No ${label} on file`}
        >
          <FileWarning className="h-4 w-4" aria-hidden />
        </span>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title={`Upload ${label}`}
          aria-label={`Upload ${label} for ${row.staff.full_name}`}
          onClick={() => setUploadOpen(true)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 transition hover:border-red-300 hover:bg-red-100"
        >
          <Upload className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {uploadOpen ? (
        <DocQuickUploadDialog
          row={row}
          docKind={docKind}
          label={label}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            onUploaded();
          }}
        />
      ) : null}
    </>
  );
}

type VisaResidencyFileCellProps = {
  row: VisaEmployeeRow;
  canManage: boolean;
  onUploaded: () => void;
};

export function VisaResidencyFileCell({
  row,
  canManage,
  onUploaded,
}: VisaResidencyFileCellProps) {
  return (
    <VisaDocFileCell
      row={row}
      canManage={canManage}
      onUploaded={onUploaded}
      docKind="eresidence_card"
      hasFile={row.hasResidenceDocument}
      label="residency card"
      previewTitle="Residency card"
      missingToast="No residency card found on WorkDrive."
    />
  );
}

type VisaNocFileCellProps = {
  row: VisaEmployeeRow;
  canManage: boolean;
  onUploaded: () => void;
};

export function VisaNocFileCell({
  row,
  canManage,
  onUploaded,
}: VisaNocFileCellProps) {
  const status = resolveDirectoryVisaStatus(
    row.staff.visa_status,
    row.visaStatus,
  );
  return (
    <VisaDocFileCell
      row={row}
      canManage={canManage}
      onUploaded={onUploaded}
      docKind="visa_noc"
      hasFile={row.hasNocDocument}
      applicable={isSelfOwnedVisaStatus(status)}
      label="Visa NOC"
      previewTitle="Visa NOC"
      missingToast="No Visa NOC found on WorkDrive."
    />
  );
}

/** Red = cancelation letter on file; amber = not uploaded. Opens the in-app preview. */
export function VisaCancelationFileMark({ row }: { row: VisaEmployeeRow }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewItem, setPreviewItem] =
    useState<StaffWorkDriveDocumentListItem | null>(null);

  const hasFile = row.hasCancelationDocument;

  async function openPreview() {
    if (loadingPreview) return;
    setLoadingPreview(true);
    try {
      const result = await listStaffWorkDriveDocs({
        staffId: row.staff.id,
        docKind: "visa_cancelation",
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const item = result.items[0] ?? null;
      if (!item) {
        toast.error("No visa cancelation file found on WorkDrive.");
        return;
      }
      if (item.isMissing) {
        toast.error("This file was deleted from WorkDrive.");
        return;
      }
      setPreviewItem(item);
      setPreviewOpen(true);
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <>
      <span
        className="inline-flex shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title={
            hasFile
              ? "Preview visa cancelation file"
              : "Visa cancelation file not uploaded — click to preview"
          }
          aria-label={
            hasFile
              ? `Preview visa cancelation for ${row.staff.full_name}`
              : `Visa cancelation not uploaded for ${row.staff.full_name}`
          }
          disabled={loadingPreview}
          onClick={() => {
            void openPreview();
          }}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md border transition",
            hasFile
              ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100"
              : "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100",
            "disabled:opacity-50",
          )}
        >
          {loadingPreview ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : hasFile ? (
            <FileText className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <FileWarning className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </span>

      {previewOpen && previewItem ? (
        <DocPreviewDialog
          item={previewItem}
          title="Visa cancelation"
          onClose={() => {
            setPreviewOpen(false);
            setPreviewItem(null);
          }}
        />
      ) : null}
    </>
  );
}

function DocQuickUploadDialog({
  row,
  docKind,
  label,
  onClose,
  onUploaded,
}: {
  row: VisaEmployeeRow;
  docKind: VisaDocFileKind;
  label: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const titleId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !uploading) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, uploading]);

  async function handleUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setProgress(0);
    setNote(null);
    try {
      const preferredSlotId = String(row.latestRecordId ?? "").trim();
      const result = await uploadStaffDocumentViaApi({
        staffId: row.staff.id,
        empNo: row.staff.emp_no,
        fullName: row.staff.full_name,
        docKind,
        fileSlotId: preferredSlotId || undefined,
        docExpiry: row.expiryDate ?? row.cancelDate,
        file,
        onProgress: (percent) => setProgress(percent),
      });
      if (!result.ok) {
        toast.error(result.error);
        setNote(result.error);
        setUploading(false);
        setProgress(null);
        return;
      }
      toast.saved(
        preferredSlotId
          ? `${label} uploaded and linked to the current reference.`
          : `${label} uploaded.`,
      );
      setUploading(false);
      setProgress(null);
      onUploaded();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed.";
      toast.error(message);
      setNote(message);
      setUploading(false);
      setProgress(null);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              Upload {label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {row.staff.full_name} · Emp. {row.staff.emp_no}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
            disabled={uploading}
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs text-black/45">
            Saves to this employee&apos;s WorkDrive folder
            {row.latestRecordId
              ? " and links to their current visa reference."
              : "."}
          </p>
          <StaffDocumentUploadSlot
            label={`Choose ${label}`}
            file={file}
            onFileChange={(next) => {
              setFile(next);
              setNote(null);
            }}
            uploadingToDrive={uploading}
            uploadProgress={progress}
            driveUploadNote={note}
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            disabled={uploading}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-9"
            disabled={!file || uploading}
            onClick={() => {
              void handleUpload();
            }}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            Upload
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DocPreviewDialog({
  item,
  title,
  onClose,
}: {
  item: StaffWorkDriveDocumentListItem;
  title: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const kind = useMemo(() => filePreviewKind(item.fileName), [item.fileName]);

  function openExternal() {
    const url = item.permalink?.trim() || downloadUrlFor(item);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  useEffect(() => {
    if (kind === "unsupported") {
      setLoading(false);
      setError(null);
      setObjectUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setObjectUrl(null);

    void (async () => {
      try {
        const res = await fetch(downloadUrlFor(item), {
          credentials: "same-origin",
        });
        if (!res.ok) {
          let message = `Could not load preview (${res.status}).`;
          try {
            const payload = (await res.json()) as { error?: string };
            if (payload.error?.trim()) message = payload.error.trim();
          } catch {
            /* ignore */
          }
          if (!cancelled) {
            setError(message);
            setLoading(false);
          }
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        setObjectUrl(URL.createObjectURL(blob));
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Could not load preview — check your connection.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item, kind]);

  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex h-[min(92dvh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/10 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
              {title}
            </p>
            <h2
              id={titleId}
              className="mt-0.5 truncate font-serif text-lg text-[#3D421F]"
              title={item.fileName}
            >
              {item.fileName}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={openExternal}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 text-xs font-medium text-[#3D421F] transition hover:bg-black/[0.03]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open
            </button>
            <button
              type="button"
              className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 bg-[#f5f4ef]">
          {kind === "unsupported" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-black/60">
                In-app preview is not available for this file type.
              </p>
              <button
                type="button"
                onClick={openExternal}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#3D421F] px-3 text-sm font-semibold text-white transition hover:bg-[#2f3318]"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Open in new tab
              </button>
            </div>
          ) : loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <Loader2
                className="h-6 w-6 animate-spin text-[#3D421F]/70"
                aria-hidden
              />
              <p className="text-xs text-black/45">Loading preview…</p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="max-w-lg text-sm leading-relaxed text-black/65">
                {error}
              </p>
              <button
                type="button"
                onClick={openExternal}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#3D421F] px-3 text-sm font-semibold text-white transition hover:bg-[#2f3318]"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Open in new tab
              </button>
            </div>
          ) : objectUrl && kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={objectUrl}
              alt={item.fileName}
              className="h-full w-full object-contain p-4"
            />
          ) : objectUrl ? (
            <iframe
              title={item.fileName}
              src={objectUrl}
              className="h-full w-full border-0 bg-white"
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
