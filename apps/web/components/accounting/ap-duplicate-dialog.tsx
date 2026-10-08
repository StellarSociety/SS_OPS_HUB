"use client";

import { createPortal } from "react-dom";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ApDuplicateDoc } from "@/lib/accounting/ap-duplicates";
import {
  AP_DOCUMENT_TYPE_LABELS,
  AP_STATUS_LABELS,
} from "@/lib/accounting/ap-types";
import { formatAedAccounting, formatDateDmy } from "@/lib/accounting/money";

/** Table of AP documents that share a supplier reference. */
export function ApDuplicateDocsTable({
  docs,
  hrefFor,
  newTab = false,
  onOpen,
}: {
  docs: ApDuplicateDoc[];
  hrefFor: (id: string) => string;
  newTab?: boolean;
  /** Open in place (e.g. the details dialog) instead of following the link. */
  onOpen?: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-black/10">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.03] text-left text-[11px] uppercase tracking-wide text-black/50">
          <tr>
            <th className="px-3 py-2">Document</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Supplier ref</th>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Net</th>
            <th className="px-3 py-2 text-right">Gross</th>
            <th className="px-3 py-2">Memo</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-t border-black/5 align-top">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-[#3D421F]">
                <a
                  href={hrefFor(d.id)}
                  onClick={
                    onOpen
                      ? (e) => {
                          e.preventDefault();
                          onOpen(d.id);
                        }
                      : undefined
                  }
                  target={newTab ? "_blank" : undefined}
                  rel={newTab ? "noreferrer" : undefined}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {d.invoice_no}
                  {newTab ? <ExternalLink className="size-3 text-black/40" /> : null}
                </a>
              </td>
              <td
                className={`whitespace-nowrap px-3 py-2 ${d.document_type === "credit_note" ? "text-red-700" : "text-black/70"}`}
              >
                {AP_DOCUMENT_TYPE_LABELS[d.document_type]}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-black/70">
                {d.supplier_invoice_no ?? "—"}
                {d.delivery_note_no ? (
                  <div className="text-[11px] text-black/45">
                    DN {d.delivery_note_no}
                  </div>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-black/70">
                {formatDateDmy(d.invoice_date)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-black/70">
                {AP_STATUS_LABELS[d.status] ?? d.status}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {formatAedAccounting(d.subtotal_net)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                {formatAedAccounting(d.total_gross)}
              </td>
              <td className="max-w-[220px] truncate px-3 py-2 text-black/50" title={d.memo ?? ""}>
                {d.memo ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Warns that a supplier document number is already on file, listing the
 * existing documents, and lets the user change the number or keep both.
 */
export function ApDuplicateDialog({
  open,
  docs,
  supplierName,
  number,
  keepLabel,
  pending,
  hrefFor,
  onChangeNumber,
  onKeepBoth,
}: {
  open: boolean;
  docs: ApDuplicateDoc[];
  supplierName: string;
  number: string;
  keepLabel: string;
  pending?: boolean;
  hrefFor: (id: string) => string;
  onChangeNumber: () => void;
  onKeepBoth: () => void;
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (!pending && e.target === e.currentTarget) onChangeNumber();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ap-duplicate-title"
        className="w-full max-w-6xl rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <AlertTriangle className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="ap-duplicate-title" className="font-serif text-xl text-[#3D421F]">
              This document already exists
            </h2>
            <p className="mt-1 text-sm text-black/65">
              <span className="font-medium text-[#3D421F]">{supplierName}</span>{" "}
              reference <span className="font-medium text-[#3D421F]">{number}</span>{" "}
              is already on {docs.length === 1 ? "this document" : `these ${docs.length} documents`}:
            </p>
          </div>
        </div>

        <div className="mt-4 max-h-[50vh] overflow-auto">
          <ApDuplicateDocsTable docs={docs} hrefFor={hrefFor} newTab />
        </div>

        <p className="mt-3 text-xs text-black/50">
          Keeping both records them under the same reference; they will be listed
          in Expenses → Alerts.
        </p>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onKeepBoth}>
            {keepLabel}
          </Button>
          {/* Takes focus so pickers behind the dialog close. */}
          <Button type="button" disabled={pending} onClick={onChangeNumber} autoFocus>
            Change number
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
