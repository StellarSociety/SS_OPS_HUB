"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  HardDrive,
  Trash2,
  Upload,
} from "lucide-react";
import { DETACHED_FILE_FORM_ID } from "@/lib/hr/detached-file-form";
import { cn } from "@/lib/utils";

const ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFileName(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
}

export type ExistingStaffDocument = {
  fileName: string;
  workdriveFileId?: string;
  permalink?: string | null;
};

type StaffDocumentUploadSlotProps = {
  label?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Already-linked file on WorkDrive (shown when no new file is selected). */
  existingFile?: ExistingStaffDocument | null;
  readOnly?: boolean;
  className?: string;
  /** When set, shows Upload to WorkDrive for the selected file. */
  onUploadToDrive?: () => void;
  uploadingToDrive?: boolean;
  /** 0–100 while bytes are uploading; null when idle. */
  uploadProgress?: number | null;
  driveUploadNote?: string | null;
};

export function StaffDocumentUploadSlot({
  label = "Upload document",
  file,
  onFileChange,
  existingFile = null,
  readOnly = false,
  className,
  onUploadToDrive,
  uploadingToDrive = false,
  uploadProgress = null,
  driveUploadNote = null,
}: StaffDocumentUploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [existingPreviewUrl, setExistingPreviewUrl] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (file || !existingFile?.workdriveFileId) {
      setExistingPreviewUrl(null);
      return;
    }
    if (!isImageFileName(existingFile.fileName)) {
      setExistingPreviewUrl(null);
      return;
    }

    let cancelled = false;
    const downloadUrl = `/api/hr/workdrive/download/${encodeURIComponent(existingFile.workdriveFileId)}`;

    void (async () => {
      try {
        const res = await fetch(downloadUrl, { credentials: "same-origin" });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled || !blob.type.startsWith("image/")) return;
        setExistingPreviewUrl(URL.createObjectURL(blob));
      } catch {
        /* preview is optional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file, existingFile?.workdriveFileId, existingFile?.fileName]);

  useEffect(() => {
    if (!existingPreviewUrl) return;
    return () => URL.revokeObjectURL(existingPreviewUrl);
  }, [existingPreviewUrl]);

  function pick(next: File | null) {
    if (readOnly) return;
    onFileChange(next);
  }

  const showingExisting = !file && !!existingFile;

  return (
    <div className={cn("flex w-fit max-w-full flex-col", className)}>
      <button
        type="button"
        disabled={readOnly || uploadingToDrive}
        onClick={() => {
          if (!readOnly && !uploadingToDrive) inputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!readOnly) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (readOnly || uploadingToDrive) return;
          const next = e.dataTransfer.files?.[0] ?? null;
          if (next) pick(next);
        }}
        aria-label={
          showingExisting
            ? `Replace ${existingFile.fileName}`
            : file
              ? `Replace ${file.name}`
              : label
        }
        className={cn(
          "flex aspect-square h-32 w-32 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed px-2 py-2 text-center transition-colors",
          dragging
            ? "border-[var(--venue-primary)] bg-[var(--venue-primary)]/10"
            : showingExisting
              ? "border-emerald-200 bg-emerald-50/70 hover:border-emerald-300 hover:bg-emerald-50"
              : "border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 hover:border-[var(--venue-primary)]/35 hover:bg-[var(--venue-secondary,#F0F3DD)]/40",
          (readOnly || uploadingToDrive) && "cursor-not-allowed opacity-60",
          !readOnly && !uploadingToDrive && "cursor-pointer",
        )}
      >
        {file ? (
          <>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt=""
                className="max-h-12 max-w-full rounded object-contain"
              />
            ) : (
              <FileText className="h-6 w-6 text-[#3D421F]/60" aria-hidden />
            )}
            <p className="mt-1.5 w-full truncate px-0.5 text-[10px] font-semibold leading-tight text-[#3D421F]">
              {file.name}
            </p>
            <p className="mt-0.5 text-[9px] text-black/40">
              {formatBytes(file.size)}
            </p>
          </>
        ) : showingExisting ? (
          <>
            {existingPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={existingPreviewUrl}
                alt=""
                className="max-h-12 max-w-full rounded object-contain"
              />
            ) : (
              <CheckCircle2
                className="h-6 w-6 text-emerald-700"
                aria-hidden
              />
            )}
            <p className="mt-1.5 w-full truncate px-0.5 text-[10px] font-semibold leading-tight text-[#3D421F]">
              {existingFile.fileName}
            </p>
            <p className="mt-0.5 text-[9px] font-medium text-emerald-800/80">
              {dragging ? "Drop to replace" : "On file · click to replace"}
            </p>
          </>
        ) : (
          <>
            <Upload className="h-6 w-6 text-black/25" aria-hidden />
            <p className="mt-1.5 px-0.5 text-[10px] font-medium leading-tight text-black/50">
              {dragging ? "Drop to attach" : "Drop or click"}
            </p>
            <p className="mt-0.5 text-[9px] text-black/40">PDF · JPG · PNG</p>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        form={DETACHED_FILE_FORM_ID}
        className="hidden"
        disabled={readOnly || uploadingToDrive}
        onChange={(e) => {
          const next = e.target.files?.[0] ?? null;
          if (next) pick(next);
          e.target.value = "";
        }}
      />

      {driveUploadNote ? (
        <p className="mt-2 max-w-[12rem] text-[11px] leading-snug text-black/45">
          {driveUploadNote}
        </p>
      ) : null}

      {uploadingToDrive ? (
        <div
          className="mt-2 w-32 space-y-1.5"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            uploadProgress != null ? Math.round(uploadProgress) : undefined
          }
          aria-label="Upload progress"
        >
          <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-[#3D421F]/80">
            <span>
              {uploadProgress != null && uploadProgress < 100
                ? "Uploading…"
                : "Saving…"}
            </span>
            <span className="tabular-nums text-black/45">
              {uploadProgress != null ? `${Math.round(uploadProgress)}%` : "…"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div
              className={cn(
                "h-full rounded-full bg-[#3D421F] transition-[width] duration-150 ease-out",
                uploadProgress != null &&
                  uploadProgress >= 100 &&
                  "animate-pulse",
              )}
              style={{
                width: `${Math.min(100, Math.max(0, uploadProgress ?? 0))}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {file && !readOnly ? (
        <div className="mt-2 flex w-32 flex-col gap-1">
          {onUploadToDrive ? (
            <button
              type="button"
              disabled={uploadingToDrive}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUploadToDrive();
              }}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[#3D421F] px-2 text-xs font-semibold text-white transition hover:bg-[#2f3318] disabled:opacity-50"
            >
              <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {uploadingToDrive
                ? uploadProgress != null && uploadProgress < 100
                  ? `${Math.round(uploadProgress)}%`
                  : "Saving…"
                : "Upload"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={uploadingToDrive}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              pick(null);
            }}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-black/50 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {existingFile ? "Keep current" : "Remove"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
