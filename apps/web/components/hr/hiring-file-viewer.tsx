"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";

export type HiringViewerFile = {
  id: string;
  url: string;
  name: string;
  contentType: string | null;
};

export type HiringFileKind = "image" | "pdf" | "other";

export function hiringFileKind(file: {
  contentType: string | null;
  name: string;
}): HiringFileKind {
  const type = (file.contentType ?? "").toLowerCase();
  const name = file.name.toLowerCase();
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|heic|bmp|svg)$/.test(name)) {
    return "image";
  }
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "other";
}

/** Full-screen preview for hiring photos and attachments. */
export function HiringFileViewer({
  files,
  index,
  onChange,
  onClose,
}: {
  files: HiringViewerFile[];
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const file = files[index];
  const count = files.length;

  useEffect(() => {
    // Capture phase so Escape closes only the viewer, not the dialog under it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      } else if (event.key === "ArrowRight" && count > 1) {
        onChange((index + 1) % count);
      } else if (event.key === "ArrowLeft" && count > 1) {
        onChange((index - 1 + count) % count);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [count, index, onChange, onClose]);

  if (!file || typeof document === "undefined") return null;
  const kind = hiringFileKind(file);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      className="fixed inset-0 z-[90] flex flex-col bg-black/95 text-white"
    >
      <div className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {file.name}
          {count > 1 ? (
            <span className="ml-2 font-normal text-white/50">
              {index + 1} / {count}
            </span>
          ) : null}
        </p>
        <a
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="Open in new tab"
          title="Open in new tab"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
        <a
          href={file.url}
          download={file.name}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
          aria-label="Download"
          title="Download"
        >
          <Download className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          aria-label="Close"
          title="Close (Esc)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16 sm:pb-6"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={file.id}
            src={file.url}
            alt={file.name}
            className="max-h-full max-w-full rounded-lg object-contain"
            draggable={false}
          />
        ) : kind === "pdf" ? (
          <iframe
            key={file.id}
            src={file.url}
            title={file.name}
            className="h-full w-full max-w-5xl rounded-lg bg-white"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-10 py-12 text-center">
            <FileText className="h-12 w-12 text-white/60" />
            <p className="max-w-sm text-sm text-white/70">
              This file type can’t be previewed here.
            </p>
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
            >
              Open file
            </a>
          </div>
        )}

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => onChange((index - 1 + count) % count)}
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 sm:left-4"
              aria-label="Previous file"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => onChange((index + 1) % count)}
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 sm:right-4"
              aria-label="Next file"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
