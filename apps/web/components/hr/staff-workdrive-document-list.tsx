"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  Eye,
  FolderOpen,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteStaffWorkDriveDoc,
  resolveWorkDriveFolderLink,
  type StaffWorkDriveDocumentListItem,
} from "@/lib/actions/hr-workdrive";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

function formatUploadedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downloadUrlFor(item: StaffWorkDriveDocumentListItem) {
  return `/api/hr/workdrive/download/${encodeURIComponent(item.workdriveFileId)}`;
}

function filePreviewKind(
  fileName: string,
): "pdf" | "image" | "unsupported" {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  return "unsupported";
}

type StaffWorkDriveDocumentListProps = {
  items: StaffWorkDriveDocumentListItem[];
  readOnly?: boolean;
  onDeleted?: (documentId: string) => void;
  className?: string;
};

export function StaffWorkDriveDocumentList({
  items,
  readOnly: _readOnly = false,
  onDeleted,
  className,
}: StaffWorkDriveDocumentListProps) {
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] =
    useState<StaffWorkDriveDocumentListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewTarget, setPreviewTarget] =
    useState<StaffWorkDriveDocumentListItem | null>(null);

  if (items.length === 0) return null;

  function openFile(item: StaffWorkDriveDocumentListItem) {
    if (item.isMissing) {
      toast.error("This file was deleted from WorkDrive.");
      return;
    }
    const url = item.permalink?.trim() || downloadUrlFor(item);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function openFolder(item: StaffWorkDriveDocumentListItem) {
    if (!item.folderId) {
      toast.error("Folder location is not available for this file.");
      return;
    }
    startTransition(async () => {
      const result = await resolveWorkDriveFolderLink({
        folderId: item.folderId!,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  function requestDelete(item: StaffWorkDriveDocumentListItem) {
    if (deleting) return;
    setDeleteTarget(item);
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setDeleteTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const result = await deleteStaffWorkDriveDoc({
        documentId: deleteTarget.id,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(
        deleteTarget.isMissing ? "Link removed from hub" : "Document deleted",
      );
      onDeleted?.(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <ul className={cn("space-y-1.5", className)}>
        {items.map((item) => {
          const missing = item.isMissing;
          return (
            <li
              key={item.id}
              className={cn(
                "rounded-lg border bg-white/70 px-2.5 py-2",
                missing
                  ? "border-amber-300/80 bg-amber-50/50"
                  : "border-black/8",
              )}
            >
              <div className="flex items-start gap-2">
                {missing ? (
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-xs font-semibold text-[#3D421F]/80"
                      title={item.fileName}
                    >
                      {item.fileName}
                    </p>
                    <p className="mt-0.5 text-[10px] font-medium text-amber-800">
                      Deleted from WorkDrive
                    </p>
                    <p
                      className="mt-0.5 truncate text-[10px] leading-snug text-black/45"
                      title={item.path ?? undefined}
                    >
                      {item.path?.trim() || "WorkDrive"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-black/40">
                      {formatUploadedAt(item.uploadedAt)}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded-md text-left transition hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3D421F]/25"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPreviewTarget(item);
                    }}
                    title="Preview file"
                  >
                    <p
                      className="truncate text-xs font-semibold text-[#3D421F]"
                      title={item.fileName}
                    >
                      {item.fileName}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[10px] leading-snug text-black/45"
                      title={item.path ?? undefined}
                    >
                      {item.path?.trim() || "WorkDrive"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-black/40">
                      {formatUploadedAt(item.uploadedAt)}
                    </p>
                  </button>
                )}
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    title={
                      missing
                        ? "File was deleted from WorkDrive"
                        : "Preview"
                    }
                    aria-label={`Preview ${item.fileName}`}
                    disabled={pending || deleting || missing}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPreviewTarget(item);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#3D421F]/10 text-[#3D421F] transition hover:bg-[#3D421F]/15 disabled:opacity-40"
                  >
                    <Eye className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    title={
                      missing
                        ? "File was deleted from WorkDrive"
                        : "Open in new tab"
                    }
                    aria-label={`Open ${item.fileName} in new tab`}
                    disabled={pending || deleting || missing}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openFile(item);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#3D421F]/70 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    title="Open folder location"
                    aria-label={`Open folder for ${item.fileName}`}
                    disabled={pending || deleting || !item.folderId}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openFolder(item);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#3D421F]/70 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    title={
                      missing ? "Remove from hub" : "Delete from WorkDrive"
                    }
                    aria-label={
                      missing
                        ? `Remove ${item.fileName} from hub`
                        : `Delete ${item.fileName}`
                    }
                    disabled={pending || deleting}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      requestDelete(item);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-700/80 transition hover:bg-red-50 hover:text-red-800 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {previewTarget ? (
        <PreviewWorkDriveDocDialog
          item={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onOpenExternal={() => openFile(previewTarget)}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteWorkDriveDocDialog
          fileName={deleteTarget.fileName}
          alreadyMissing={deleteTarget.isMissing}
          busy={deleting}
          onClose={closeDeleteDialog}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </>
  );
}

function PreviewWorkDriveDocDialog({
  item,
  onClose,
  onOpenExternal,
}: {
  item: StaffWorkDriveDocumentListItem;
  onClose: () => void;
  onOpenExternal: () => void;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const kind = useMemo(() => filePreviewKind(item.fileName), [item.fileName]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (item.isMissing) {
      setLoading(false);
      setError("This file was deleted from WorkDrive.");
      setObjectUrl(null);
      return;
    }

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

  if (!mounted) return null;

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
              File preview
            </p>
            <h2
              id={titleId}
              className="mt-0.5 truncate font-serif text-lg text-[#3D421F]"
              title={item.fileName}
            >
              {item.fileName}
            </h2>
            {item.path?.trim() ? (
              <p
                className="mt-0.5 truncate text-[11px] text-black/45"
                title={item.path}
              >
                {item.path}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!item.isMissing ? (
              <button
                type="button"
                onClick={onOpenExternal}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 text-xs font-medium text-[#3D421F] transition hover:bg-black/[0.03]"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Open
              </button>
            ) : null}
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
          {item.isMissing ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="max-w-lg text-sm leading-relaxed text-black/65">
                This file was deleted from WorkDrive.
              </p>
            </div>
          ) : kind === "unsupported" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-black/60">
                In-app preview is not available for this file type.
              </p>
              <button
                type="button"
                onClick={onOpenExternal}
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
              {!/deleted from WorkDrive/i.test(error) ? (
                <button
                  type="button"
                  onClick={onOpenExternal}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#3D421F] px-3 text-sm font-semibold text-white transition hover:bg-[#2f3318]"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Open in new tab
                </button>
              ) : null}
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

function DeleteWorkDriveDocDialog({
  fileName,
  alreadyMissing,
  busy,
  onClose,
  onConfirm,
}: {
  fileName: string;
  alreadyMissing: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        disabled={busy}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700/80">
              {alreadyMissing ? "Remove from hub" : "Delete from WorkDrive"}
            </p>
            <h2
              id={titleId}
              className="mt-0.5 font-serif text-lg text-[#3D421F]"
            >
              {alreadyMissing ? "Remove this link?" : "Delete this file?"}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-black/65">
          <p>
            {alreadyMissing ? "Remove" : "Delete"}{" "}
            <span className="font-medium text-[#3D421F]" title={fileName}>
              {fileName}
            </span>
            ?
          </p>
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
            {alreadyMissing
              ? "The file is already gone from Zoho WorkDrive. This only removes the link from this staff record."
              : "This moves the file to Zoho WorkDrive trash and removes it from this staff record."}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 bg-[#faf9f6] px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] transition hover:bg-black/[0.03] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex h-9 items-center justify-center rounded-md bg-rose-700 px-3 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:opacity-50"
          >
            {busy
              ? alreadyMissing
                ? "Removing…"
                : "Deleting…"
              : alreadyMissing
                ? "Remove from hub"
                : "Delete from WorkDrive"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
