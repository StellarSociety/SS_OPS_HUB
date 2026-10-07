"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

type ConfirmDeleteDialogProps = {
  open: boolean;
  title: string;
  /** What is being deleted (summary card). */
  subject?: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * In-app delete confirmation. Use instead of window.confirm, which embedded
 * browsers can suppress (silently returning false).
 */
export function ConfirmDeleteDialog({
  open,
  title,
  subject,
  description,
  confirmLabel = "Delete",
  pending = false,
  error,
  onClose,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
            <Trash2 className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2
              id="confirm-delete-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {title}
            </h2>
            {description ? (
              <div className="mt-2 text-sm leading-relaxed text-black/65">
                {description}
              </div>
            ) : null}
          </div>
        </div>

        {subject ? (
          <div className="mt-4 rounded-lg border border-black/8 bg-black/[0.02] px-3 py-2.5 text-sm text-[#3D421F]">
            {subject}
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="h-9 rounded-md border border-black/10 bg-white px-3.5 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            autoFocus
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-700 px-3.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            {pending ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
