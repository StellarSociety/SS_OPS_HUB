"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, FileText, X } from "lucide-react";
import { formatFileSize, isImageAttachment } from "@/lib/connect/format";
import { cn } from "@/lib/utils";

export type PreviewableFile = {
  url: string;
  name: string;
  type: string;
  size: number;
};

/** Supabase Storage serves `?download=<name>` as an attachment (cross-origin safe). */
export function downloadUrl(file: Pick<PreviewableFile, "url" | "name">): string {
  return `${file.url}${file.url.includes("?") ? "&" : "?"}download=${encodeURIComponent(file.name)}`;
}

export function downloadFile(file: Pick<PreviewableFile, "url" | "name">) {
  const a = document.createElement("a");
  a.href = downloadUrl(file);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type Kind = "image" | "pdf" | "video" | "audio" | "other";

function kindOf(file: PreviewableFile): Kind {
  if (isImageAttachment(file.type)) return "image";
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "other";
}

/** Full-screen in-app preview of a chat file. */
export function AttachmentPreview({
  file,
  onClose,
}: {
  file: PreviewableFile;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const kind = kindOf(file);

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex flex-col bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${file.name}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="flex shrink-0 items-center gap-3 px-4 py-3 text-white">
        <FileText className="h-5 w-5 shrink-0 opacity-70" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          {file.size ? <p className="text-xs text-white/60">{formatFileSize(file.size)}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => downloadFile(file)}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 hover:bg-white/10"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div
        className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- chat attachment
          <img src={file.url} alt={file.name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        ) : kind === "pdf" ? (
          <iframe
            src={file.url}
            title={file.name}
            className="h-full w-full max-w-5xl rounded-lg bg-white shadow-2xl"
          />
        ) : kind === "video" ? (
          <video src={file.url} controls autoPlay className="max-h-full max-w-full rounded-lg shadow-2xl" />
        ) : kind === "audio" ? (
          <audio src={file.url} controls autoPlay className="w-full max-w-md" />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-10 py-8 text-center shadow-2xl">
            <FileText className="h-12 w-12 text-[var(--venue-primary,#818a40)]" aria-hidden />
            <p className="max-w-xs break-all font-medium text-[#2B2F16]">{file.name}</p>
            <p className="text-sm text-black/50">No preview for this file type.</p>
            <button
              type="button"
              onClick={() => downloadFile(file)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--venue-primary,#818a40)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Right-click menu for a file: Preview / Download. */
function FileMenu({
  x,
  y,
  onPreview,
  onDownload,
  onClose,
}: {
  x: number;
  y: number;
  onPreview: () => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof MouseEvent && ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const item =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[#2B2F16] hover:bg-[var(--venue-primary,#818a40)] hover:text-white";
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[300] w-40 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg"
      style={{ left: Math.min(x, window.innerWidth - 170), top: Math.min(y, window.innerHeight - 90) }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" role="menuitem" className={item} onClick={() => (onPreview(), onClose())}>
        <Eye className="h-4 w-4" /> Preview
      </button>
      <button type="button" role="menuitem" className={item} onClick={() => (onDownload(), onClose())}>
        <Download className="h-4 w-4" /> Download
      </button>
    </div>,
    document.body,
  );
}

/**
 * Wraps any file thumbnail / card: click opens the in-app preview, right-click
 * offers Preview and Download.
 */
export function AttachmentTrigger({
  file,
  className,
  children,
  title,
}: {
  file: PreviewableFile;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        title={title ?? file.name}
        onClick={() => setPreviewing(true)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={cn("text-left", className)}
      >
        {children}
      </button>
      {menu ? (
        <FileMenu
          x={menu.x}
          y={menu.y}
          onPreview={() => setPreviewing(true)}
          onDownload={() => downloadFile(file)}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {previewing ? <AttachmentPreview file={file} onClose={() => setPreviewing(false)} /> : null}
    </>
  );
}
