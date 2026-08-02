"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, HardDrive, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type StaffDocumentUploadSlotProps = {
  label?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  readOnly?: boolean;
  className?: string;
  /** When set, shows Upload to WorkDrive for the selected file. */
  onUploadToDrive?: () => void;
  uploadingToDrive?: boolean;
  driveUploadNote?: string | null;
};

export function StaffDocumentUploadSlot({
  label = "Upload document",
  file,
  onFileChange,
  readOnly = false,
  className,
  onUploadToDrive,
  uploadingToDrive = false,
  driveUploadNote = null,
}: StaffDocumentUploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(next: File | null) {
    if (readOnly) return;
    onFileChange(next);
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
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
        className={cn(
          "flex min-h-[6.5rem] w-full flex-1 flex-col items-center justify-center rounded-lg border border-dashed px-3 py-3 text-center transition-colors",
          dragging
            ? "border-[var(--venue-primary)] bg-[var(--venue-primary)]/10"
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
                className="max-h-14 max-w-full rounded object-contain"
              />
            ) : (
              <FileText className="h-7 w-7 text-[#3D421F]/60" aria-hidden />
            )}
            <p className="mt-2 max-w-full truncate text-xs font-semibold text-[#3D421F]">
              {file.name}
            </p>
            <p className="mt-0.5 text-[10px] text-black/40">
              {formatBytes(file.size)}
            </p>
          </>
        ) : (
          <>
            <Upload className="h-7 w-7 text-black/25" aria-hidden />
            <p className="mt-2 text-xs font-medium text-black/50">
              {dragging ? "Drop to attach" : label}
            </p>
            <p className="mt-0.5 text-[10px] text-black/40">
              PDF · JPG · PNG · WebP
            </p>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={readOnly || uploadingToDrive}
        onChange={(e) => {
          const next = e.target.files?.[0] ?? null;
          if (next) pick(next);
          e.target.value = "";
        }}
      />

      {driveUploadNote ? (
        <p className="mt-2 text-[11px] leading-snug text-black/45">
          {driveUploadNote}
        </p>
      ) : null}

      {file && !readOnly ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {onUploadToDrive ? (
            <button
              type="button"
              disabled={uploadingToDrive}
              onClick={onUploadToDrive}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-[#3D421F] px-2.5 text-xs font-semibold text-white transition hover:bg-[#2f3318] disabled:opacity-50"
            >
              <HardDrive className="h-3.5 w-3.5" aria-hidden />
              {uploadingToDrive ? "Uploading…" : "Upload to WorkDrive"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={uploadingToDrive}
            onClick={() => pick(null)}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-black/50 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}
