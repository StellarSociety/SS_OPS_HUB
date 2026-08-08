"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { previewVisaRequestEmails } from "@/lib/actions/hr-visa";
import { upsertVisaRequestDraftBatch } from "@/lib/hr/visa-request-drafts-storage";
import type { VisaEmployeeRow } from "@/lib/hr/types";
import { toast } from "@/components/ui/toast";

type VisaIssueDialogProps = {
  open: boolean;
  row: VisaEmployeeRow | null;
  venueId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function VisaIssueDialog({
  open,
  row,
  venueId,
  onClose,
  onSaved,
}: VisaIssueDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !row) return;
    setError(null);
  }, [open, row]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open || !row || typeof document === "undefined") return null;

  function handleCreateDraft() {
    if (!row) return;
    setError(null);
    startTransition(async () => {
      const preview = await previewVisaRequestEmails({
        units: [
          {
            staffId: row.staff.id,
            requestType: "issue",
            providerId: row.providerId,
          },
        ],
      });
      if (!preview.ok) {
        setError(preview.error);
        return;
      }
      const unit = preview.previews[0];
      if (!unit) {
        setError("Could not build visa issue email draft.");
        return;
      }
      upsertVisaRequestDraftBatch(venueId, {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        units: [
          {
            staffId: unit.staffId,
            empNo: unit.empNo,
            fullName: unit.fullName,
            requestType: "issue",
            providerId: unit.providerId,
            providerName: unit.providerName,
            to: unit.to,
            subject: unit.subject,
            body: unit.body,
          },
        ],
      });
      toast.saved(
        `Visa issue email draft created for ${row.staff.full_name}. Open Drafts to send.`,
      );
      onSaved();
      onClose();
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visa-issue-title"
        className="w-full max-w-md rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="visa-issue-title"
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              Issue visa
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {row.staff.full_name}
              {row.staff.emp_no ? ` · ${row.staff.emp_no}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
            disabled={pending}
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5 text-sm text-[#3D421F]">
            <p>
              Create a PRO email draft requesting a company visa issue for this
              self-owned employee.
            </p>
            {row.providerName ? (
              <p className="text-muted-foreground">
                Provider: {row.providerName}
                {row.providerEmail ? ` · ${row.providerEmail}` : ""}
              </p>
            ) : (
              <p className="text-amber-800/90">
                No PRO provider is set on this employee. The draft may need a
                recipient before sending.
              </p>
            )}
          </div>

          <p className="rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-2 text-xs text-[#3D421F]">
            Confirming creates a PRO issue email draft. Status changes to Visa
            Applied Pending only after you send it from Drafts.
          </p>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/10 px-5 py-3">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={handleCreateDraft}
            className="inline-flex h-9 items-center rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {pending ? "Creating…" : "Create draft"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
