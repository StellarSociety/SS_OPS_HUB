"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InvoiceStatusBadge } from "@/components/accounting/invoices-sub-nav";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { postApInvoice, rejectApInvoice } from "@/lib/actions/accounting-ap";
import type { ApInvoice } from "@/lib/accounting/ap-types";
import { formatAedAccounting } from "@/lib/accounting/money";

type Props = {
  invoices: ApInvoice[];
  canEdit: boolean;
};

export function ApApprovalsClient({ invoices, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  function approvePost(id: string) {
    startTransition(async () => {
      const result = await postApInvoice(id);
      if (!result.ok) {
        toast.error(result.error ?? "Approve & post failed.");
        return;
      }
      toast.saved(`Posted${result.entryNo ? ` as ${result.entryNo}` : ""}.`);
      router.refresh();
    });
  }

  function reject(id: string) {
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required.");
      return;
    }
    startTransition(async () => {
      const result = await rejectApInvoice(id, rejectReason);
      if (!result.ok) {
        toast.error(result.error ?? "Reject failed.");
        return;
      }
      toast.saved("Invoice rejected.");
      setRejectId(null);
      setRejectReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        Invoices awaiting approval ({invoices.length}).
      </p>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2.5">Invoice</th>
              <th className="px-3 py-2.5">Supplier</th>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5 text-right">Gross</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-black/45">
                  No invoices pending approval.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-black/5">
                  <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                    <ScopedLink
                      href={`/accounting/invoices/${inv.id}`}
                      className="hover:underline"
                    >
                      {inv.invoice_no}
                    </ScopedLink>
                  </td>
                  <td className="px-3 py-2.5">{inv.suppliers?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums">{inv.invoice_date}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                    {formatAedAccounting(inv.total_gross)}
                  </td>
                  <td className="px-3 py-2.5">
                    <InvoiceStatusBadge status={inv.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => approvePost(inv.id)}
                        >
                          Approve & post
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          className="border border-black/10"
                          onClick={() => {
                            setRejectId(inv.id);
                            setRejectReason("");
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-black/40">View only</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rejectId && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRejectId(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-black/10 bg-[#faf9f6] p-5 shadow-xl">
            <h3 className="font-serif text-xl text-[#3D421F]">Reject invoice</h3>
            <textarea
              className="mt-3 min-h-[100px] w-full rounded-md border border-black/10 bg-white p-3 text-sm"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason…"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRejectId(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() => reject(rejectId)}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
