"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Eye,
  ExternalLink,
  FileWarning,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { StaffDocumentUploadSlot } from "@/components/hr/staff-document-upload-slot";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { uploadStaffDocumentViaApi } from "@/lib/hr/workdrive/client-upload";
import type { InsuranceEmployeeRow } from "@/lib/hr/types";

function downloadUrlFor(workdriveFileId: string) {
  return `/api/hr/workdrive/download/${encodeURIComponent(workdriveFileId)}`;
}

function filePreviewKind(fileName: string): "pdf" | "image" | "unsupported" {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  return "unsupported";
}

type InsuranceCardCellProps = {
  row: InsuranceEmployeeRow;
  canManage: boolean;
  onUploaded: () => void;
};

export function InsuranceCardCell({
  row,
  canManage,
  onUploaded,
}: InsuranceCardCellProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  if (row.hasDocument && row.document) {
    const missing = Boolean(row.document.isMissing);
    return (
      <>
        <button
          type="button"
          title={
            missing
              ? "Deleted from WorkDrive"
              : `Preview ${row.document.fileName}`
          }
          aria-label={
            missing
              ? `Insurance card deleted from WorkDrive for ${row.staff.full_name}`
              : `Preview insurance card for ${row.staff.full_name}`
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (missing) {
              toast.error("This file was deleted from WorkDrive.");
              return;
            }
            setPreviewOpen(true);
          }}
          className={
            missing
              ? "inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-amber-900 transition hover:border-amber-400 hover:bg-amber-100"
              : "inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
          }
        >
          {missing ? (
            <FileWarning className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
        {previewOpen && !missing ? (
          <InsuranceCardPreviewDialog
            fileName={row.document.fileName}
            workdriveFileId={row.document.workdriveFileId}
            permalink={row.document.permalink}
            onClose={() => setPreviewOpen(false)}
          />
        ) : null}
      </>
    );
  }

  if (!canManage) {
    return (
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-black/[0.03] text-black/35"
        title="No insurance card on file"
        aria-label="No insurance card on file"
      >
        <FileWarning className="h-4 w-4" aria-hidden />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        title="Upload insurance card"
        aria-label={`Upload insurance card for ${row.staff.full_name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setUploadOpen(true);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 transition hover:border-red-300 hover:bg-red-100"
      >
        <Upload className="h-4 w-4" aria-hidden />
      </button>
      {uploadOpen ? (
        <InsuranceCardQuickUploadDialog
          row={row}
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

function InsuranceCardPreviewDialog({
  fileName,
  workdriveFileId,
  permalink,
  onClose,
}: {
  fileName: string;
  workdriveFileId: string;
  permalink: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const kind = useMemo(() => filePreviewKind(fileName), [fileName]);
  const downloadUrl = downloadUrlFor(workdriveFileId);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        const res = await fetch(downloadUrl, { credentials: "same-origin" });
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
  }, [downloadUrl, kind]);

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

  if (!mounted || typeof document === "undefined") return null;

  function openExternal() {
    const url = permalink?.trim() || downloadUrl;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92dvh,48rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate font-nav text-base font-semibold text-[#3D421F]"
            >
              {fileName}
            </h2>
            <p className="mt-0.5 text-xs text-black/45">Insurance card preview</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-[#3D421F] transition hover:bg-black/5"
              onClick={openExternal}
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 bg-black/[0.03] p-3">
          {loading ? (
            <div className="flex h-[min(60vh,28rem)] items-center justify-center gap-2 text-sm text-black/45">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading preview…
            </div>
          ) : error ? (
            <div className="flex h-[min(60vh,28rem)] flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-red-700">{error}</p>
              <Button type="button" size="sm" onClick={openExternal}>
                Open file instead
              </Button>
            </div>
          ) : kind === "image" && objectUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={objectUrl}
              alt={fileName}
              className="mx-auto max-h-[min(70vh,36rem)] max-w-full object-contain"
            />
          ) : kind === "pdf" && objectUrl ? (
            <iframe
              title={fileName}
              src={objectUrl}
              className="h-[min(70vh,36rem)] w-full rounded-md border border-black/10 bg-white"
            />
          ) : (
            <div className="flex h-[min(60vh,28rem)] flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-black/55">
                Preview is not available for this file type.
              </p>
              <Button type="button" size="sm" onClick={openExternal}>
                Open file
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InsuranceCardQuickUploadDialog({
  row,
  onClose,
  onUploaded,
}: {
  row: InsuranceEmployeeRow;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const titleId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const preferredRecordId =
    row.recordsMissingCard.find((r) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        r.id,
      ),
    )?.id ?? "";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !uploading) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, uploading]);

  async function handleUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setProgress(0);
    setNote(null);
    try {
      const result = await uploadStaffDocumentViaApi({
        staffId: row.staff.id,
        empNo: row.staff.emp_no,
        fullName: row.staff.full_name,
        docKind: "medical_insurance",
        fileSlotId: preferredRecordId || undefined,
        docExpiry: row.expiryDate,
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
      toast.saved(`Insurance card uploaded for ${row.staff.full_name}`);
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

  if (typeof document === "undefined") return null;

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
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              Upload insurance card
            </h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
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
            Saves to this employee&apos;s WorkDrive{" "}
            <span className="font-medium text-[#3D421F]">Insurance</span> folder
            {preferredRecordId ? " and links to their open reference." : "."}
          </p>
          <StaffDocumentUploadSlot
            label="Upload insurance card"
            file={file}
            onFileChange={(next) => {
              setFile(next);
              setNote(null);
            }}
            uploadingToDrive={uploading}
            uploadProgress={progress}
            driveUploadNote={note}
            onUploadToDrive={
              file && !uploading
                ? () => {
                    void handleUpload();
                  }
                : undefined
            }
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
        </div>
      </div>
    </div>,
    document.body,
  );
}
