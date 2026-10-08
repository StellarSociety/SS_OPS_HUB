"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { ApInvoiceView } from "@/components/accounting/ap-invoice-view";
import { getApInvoiceDetail } from "@/lib/actions/accounting-ap-detail";
import type { ApInvoice } from "@/lib/accounting/ap-types";

type Loaded = { invoice: ApInvoice; canEdit: boolean; canAdmin: boolean };

/** Wide dialog showing one AP document; opened from the invoice lists. */
export function ApInvoiceDialog({
  invoiceId,
  onClose,
  onChanged,
}: {
  invoiceId: string | null;
  onClose: () => void;
  /** After post / void / reverse — e.g. refresh the list behind. */
  onChanged?: () => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const result = await getApInvoiceDetail(id);
    if (result.ok) {
      setData({ invoice: result.invoice, canEdit: result.canEdit, canAdmin: result.canAdmin });
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    if (!invoiceId) return;
    let live = true;
    getApInvoiceDetail(invoiceId).then((result) => {
      if (!live) return;
      if (result.ok) {
        setData({ invoice: result.invoice, canEdit: result.canEdit, canAdmin: result.canAdmin });
        setError(null);
      } else {
        setError(result.error);
      }
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [invoiceId, onClose]);

  if (!invoiceId || typeof document === "undefined") return null;
  const shown = data?.invoice.id === invoiceId ? data : null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Document details"
        className="w-full max-w-6xl rounded-2xl border border-black/10 bg-[#fbfbf7] p-5 shadow-2xl sm:p-6"
      >
        {shown ? (
          <ApInvoiceView
            invoice={shown.invoice}
            canEdit={shown.canEdit}
            canAdmin={shown.canAdmin}
            onClose={onClose}
            onChanged={() => {
              void load(invoiceId);
              onChanged?.();
            }}
          />
        ) : error ? (
          <div className="flex items-center justify-between gap-4 p-4 text-sm text-red-700">
            {error}
            <button type="button" onClick={onClose} className="text-black/55 hover:underline">
              Close
            </button>
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center gap-2 text-sm text-black/45">
            <Loader2 className="size-4 animate-spin" /> Loading document…
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
