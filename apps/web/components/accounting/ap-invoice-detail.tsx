"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InvoiceStatusBadge } from "@/components/accounting/invoices-sub-nav";
import { ScopedLink } from "@/components/layout/scoped-link";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  postApInvoice,
  rejectApInvoice,
  reverseApInvoice,
  submitApInvoice,
  voidApInvoice,
} from "@/lib/actions/accounting-ap";
import type { ApInvoice } from "@/lib/accounting/ap-types";
import { formatAedAccounting } from "@/lib/accounting/money";
import { toScopedHref } from "@/lib/venue/scope-routing";

type Props = {
  invoice: ApInvoice;
  canEdit: boolean;
  canAdmin: boolean;
};

export function ApInvoiceDetail({ invoice, canEdit, canAdmin }: Props) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "Action failed.");
        return;
      }
      toast.saved(success);
      router.refresh();
    });
  }

  const lines = invoice.ap_invoice_lines ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-xl font-semibold text-[#3D421F] md:text-2xl">
              {invoice.invoice_no}
            </h2>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="text-sm text-black/55">
            {invoice.suppliers?.name ?? "Supplier"} ·{" "}
            {invoice.legal_entities
              ? `${invoice.legal_entities.entity_code} — ${invoice.legal_entities.name}`
              : "Entity"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && invoice.status === "draft" && (
            <>
              <ScopedLink
                href={`/accounting/invoices/new?id=${invoice.id}`}
                className="inline-flex h-10 items-center rounded-md border border-black/10 bg-[var(--venue-secondary,#F0F3DD)] px-4 text-sm font-medium text-[#3D421F] hover:opacity-90"
              >
                Edit
              </ScopedLink>
              <Button
                type="button"
                disabled={pending}
                onClick={() => run(() => submitApInvoice(invoice.id), "Submitted.")}
              >
                Submit
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                className="border border-black/10 text-red-800"
                onClick={() =>
                  run(() => voidApInvoice(invoice.id), "Invoice voided.")
                }
              >
                Void
              </Button>
            </>
          )}
          {canEdit && invoice.status === "submitted" && (
            <>
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => postApInvoice(invoice.id), "Approved and posted.")
                }
              >
                Approve & post
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                className="border border-black/10"
                onClick={() => setRejectOpen(true)}
              >
                Reject
              </Button>
            </>
          )}
          {canEdit && invoice.status === "approved" && (
            <Button
              type="button"
              disabled={pending}
              onClick={() => run(() => postApInvoice(invoice.id), "Posted.")}
            >
              Post
            </Button>
          )}
          {canAdmin && invoice.status === "posted" && (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              className="border border-black/10 text-red-800"
              onClick={() => {
                const reason = window.prompt("Reversal reason (optional):") ?? "";
                run(
                  () => reverseApInvoice(invoice.id, reason || undefined),
                  "Invoice reversed.",
                );
              }}
            >
              Reverse
            </Button>
          )}
          <ScopedLink
            href="/accounting/invoices"
            className="inline-flex h-10 items-center rounded-md px-3 text-sm text-black/55 hover:bg-black/5"
          >
            Back to list
          </ScopedLink>
        </div>
      </div>

      {invoice.rejection_reason && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Rejection reason: {invoice.rejection_reason}
        </div>
      )}

      <div className="grid gap-4 rounded-lg border border-black/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Supplier invoice #" value={invoice.supplier_invoice_no} />
        <Field label="Invoice date" value={invoice.invoice_date} />
        <Field label="Due date" value={invoice.due_date} />
        <Field
          label="Currency"
          value={
            invoice.currency === "AED"
              ? "AED"
              : `${invoice.currency} @ ${invoice.fx_rate}`
          }
        />
        <Field label="Venue" value={invoice.venues?.name ?? "—"} />
        <Field label="Net" value={formatAedAccounting(invoice.subtotal_net)} />
        <Field label="VAT" value={formatAedAccounting(invoice.tax_total)} />
        <Field label="Gross" value={formatAedAccounting(invoice.total_gross)} />
        {invoice.memo && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="Memo" value={invoice.memo} />
          </div>
        )}
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Attachment
          </p>
          {invoice.attachment_url ? (
            <a
              href={invoice.attachment_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[var(--venue-primary)] underline"
            >
              View attachment
            </a>
          ) : (
            <p className="text-sm text-black/45">None</p>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2.5 text-left">#</th>
              <th className="px-3 py-2.5 text-left">Description</th>
              <th className="px-3 py-2.5 text-left">Account</th>
              <th className="px-3 py-2.5 text-right">Qty</th>
              <th className="px-3 py-2.5 text-right">Unit</th>
              <th className="px-3 py-2.5 text-right">Net</th>
              <th className="px-3 py-2.5 text-left">Tax</th>
              <th className="px-3 py-2.5 text-right">VAT</th>
              <th className="px-3 py-2.5 text-right">Gross</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-black/5">
                <td className="px-3 py-2.5">{line.line_no}</td>
                <td className="px-3 py-2.5">{line.description}</td>
                <td className="px-3 py-2.5">
                  {line.accounts
                    ? `${line.accounts.code} — ${line.accounts.name}`
                    : "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {line.quantity}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatAedAccounting(line.unit_price)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatAedAccounting(line.net_amount)}
                </td>
                <td className="px-3 py-2.5">
                  {line.tax_codes?.code ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatAedAccounting(line.tax_amount)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                  {formatAedAccounting(line.gross_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invoice.journal_entries && (
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <h3 className="font-serif text-lg text-[#3D421F]">Journal entry</h3>
          <p className="mt-1 text-sm text-black/65">
            {invoice.journal_entries.entry_no} · {invoice.journal_entries.status} ·{" "}
            {invoice.journal_entries.entry_date}
          </p>
        </div>
      )}

      {rejectOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setRejectOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-black/10 bg-[#faf9f6] p-5 shadow-xl">
            <h3 className="font-serif text-xl text-[#3D421F]">Reject invoice</h3>
            <p className="mt-1 text-sm text-black/55">
              Returns the invoice to draft with a rejection reason.
            </p>
            <textarea
              className="mt-3 min-h-[100px] w-full rounded-md border border-black/10 bg-white p-3 text-sm text-[#3D421F]"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason…"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRejectOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending || !rejectReason.trim()}
                onClick={() => {
                  run(
                    () => rejectApInvoice(invoice.id, rejectReason),
                    "Invoice rejected.",
                  );
                  setRejectOpen(false);
                  setRejectReason("");
                  router.push(toScopedHref("/accounting/invoices", scope, slug));
                }}
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-black/45">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-[#3D421F]">{value}</p>
    </div>
  );
}
