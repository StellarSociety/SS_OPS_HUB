"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function HiringDialog({
  open,
  title,
  description,
  onClose,
  busy,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  busy?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hiring-dialog-title"
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-black/10 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[90vh] sm:rounded-2xl ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <button
          type="button"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50 sm:right-4 sm:top-4 sm:h-8 sm:w-8"
          disabled={busy}
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <h2
          id="hiring-dialog-title"
          className="pr-12 font-nav text-base font-semibold text-[#3D421F]"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
        <div className="mt-4 space-y-4">{children}</div>
        {footer ? (
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end [&_button]:h-11 [&_button]:w-full sm:[&_button]:h-10 sm:[&_button]:w-auto">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
