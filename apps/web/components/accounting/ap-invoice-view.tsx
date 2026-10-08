"use client";

import { useTransition, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  Landmark,
  Paperclip,
  StickyNote,
  X,
} from "lucide-react";
import { InvoiceStatusBadge } from "@/components/accounting/invoices-sub-nav";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  postApInvoice,
  reverseApInvoice,
  voidApInvoice,
} from "@/lib/actions/accounting-ap";
import {
  AP_DOCUMENT_TYPE_LABELS,
  type ApInvoice,
} from "@/lib/accounting/ap-types";
import { formatAedAccounting, formatDateDmy } from "@/lib/accounting/money";
import { cn } from "@/lib/utils";

const UNPOSTED = ["draft", "submitted", "approved"];

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round(
    (new Date(`${iso}T00:00:00`).getTime() - today.getTime()) / 86_400_000,
  );
}

/**
 * Read-only view of one AP document with its actions. Used in the details
 * dialog (from All Invoices / Alerts) and on the document's own page.
 */
export function ApInvoiceView({
  invoice,
  canEdit,
  canAdmin,
  onChanged,
  onClose,
}: {
  invoice: ApInvoice;
  canEdit: boolean;
  canAdmin: boolean;
  /** Called after post / void / reverse so the caller can refresh. */
  onChanged: () => void;
  onClose?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const lines = invoice.ap_invoice_lines ?? [];
  const isCredit = invoice.document_type === "credit_note";
  const due = daysUntil(invoice.due_date);
  const settled = ["void", "reversed"].includes(invoice.status);

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
      onChanged();
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                isCredit
                  ? "bg-red-50 text-red-700"
                  : "bg-[var(--venue-secondary,#F0F3DD)] text-[#3D421F]",
              )}
            >
              <FileText className="size-3" />
              {AP_DOCUMENT_TYPE_LABELS[invoice.document_type]}
            </span>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <h2 className="font-serif text-2xl text-[#3D421F]">
            {invoice.suppliers?.name ?? "Supplier"}
          </h2>
          <p className="text-sm text-black/50">
            <span className="font-medium text-black/70">{invoice.invoice_no}</span>
            {invoice.legal_entities
              ? ` · ${invoice.legal_entities.entity_code} — ${invoice.legal_entities.name}`
              : null}
            {invoice.venues?.name ? ` · ${invoice.venues.name}` : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && !settled && (
            <ScopedLink
              href={`/accounting/invoices/new?id=${invoice.id}`}
              className="inline-flex h-9 items-center rounded-md border border-black/10 bg-[var(--venue-secondary,#F0F3DD)] px-3.5 text-sm font-medium text-[#3D421F] hover:opacity-90"
              title={
                invoice.status === "posted"
                  ? "Saving changes reverses this journal and posts a corrected one"
                  : undefined
              }
            >
              Edit
            </ScopedLink>
          )}
          {canEdit && UNPOSTED.includes(invoice.status) && (
            <>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => run(() => postApInvoice(invoice.id), "Posted to the ledger.")}
              >
                Post
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                className="border border-black/10 text-red-800"
                onClick={() => run(() => voidApInvoice(invoice.id), "Document voided.")}
              >
                Void
              </Button>
            </>
          )}
          {canAdmin && invoice.status === "posted" && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              className="border border-black/10 text-red-800"
              onClick={() => {
                const reason = window.prompt("Reversal reason (optional):");
                if (reason === null) return;
                run(
                  () => reverseApInvoice(invoice.id, reason || undefined),
                  "Document reversed.",
                );
              }}
            >
              Reverse
            </Button>
          )}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="ml-1 inline-flex size-9 items-center justify-center rounded-md text-black/45 hover:bg-black/5 hover:text-black"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {invoice.document_type === "delivery_note" && !invoice.supplier_invoice_no ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          Requires invoice number — edit this delivery note once the supplier’s
          invoice arrives.
        </div>
      ) : null}

      {/* Amounts */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Amount label="Net" value={invoice.subtotal_net} negative={isCredit} />
        <Amount label="VAT" value={invoice.tax_total} negative={isCredit} />
        <Amount label="Gross" value={invoice.total_gross} negative={isCredit} strong />
      </div>

      {/* Facts */}
      <dl className="grid gap-x-6 gap-y-4 rounded-xl border border-black/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Supplier invoice no">
          {invoice.supplier_invoice_no ?? (
            <span className="text-amber-700">Not yet received</span>
          )}
        </Fact>
        {invoice.delivery_note_no ? (
          <Fact label="Delivery note no">{invoice.delivery_note_no}</Fact>
        ) : null}
        <Fact label="Invoice date" icon={<CalendarDays className="size-3.5" />}>
          {formatDateDmy(invoice.invoice_date)}
        </Fact>
        <Fact label="Due date" icon={<CalendarDays className="size-3.5" />}>
          {formatDateDmy(invoice.due_date)}
          {!settled ? (
            <span
              className={cn(
                "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                due < 0 ? "bg-red-50 text-red-700" : "bg-black/5 text-black/55",
              )}
            >
              {due < 0 ? `${-due}d overdue` : due === 0 ? "today" : `in ${due}d`}
            </span>
          ) : null}
        </Fact>
        <Fact label="Currency">
          {invoice.currency === "AED" ? "AED" : `${invoice.currency} @ ${invoice.fx_rate}`}
        </Fact>
        <Fact label="Journal entry" icon={<Landmark className="size-3.5" />}>
          {invoice.journal_entries ? (
            <ScopedLink
              href={`/accounting/journals/${invoice.journal_entries.id}`}
              className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
            >
              {invoice.journal_entries.entry_no}
            </ScopedLink>
          ) : (
            <span className="text-black/40">Not posted</span>
          )}
        </Fact>
        <Fact label="Attachment" icon={<Paperclip className="size-3.5" />}>
          {invoice.attachment_url ? (
            <a
              href={invoice.attachment_url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
            >
              View file
            </a>
          ) : (
            <span className="text-black/40">None</span>
          )}
        </Fact>
      </dl>

      {/* Lines */}
      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--venue-secondary,#F0F3DD)]/60 text-left text-[11px] uppercase tracking-wide text-black/55">
            <tr>
              <th className="px-4 py-2.5">Line</th>
              <th className="px-4 py-2.5">Tax</th>
              <th className="px-4 py-2.5 text-right">Net</th>
              <th className="px-4 py-2.5 text-right">VAT</th>
              <th className="px-4 py-2.5 text-right">Gross</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-black/5 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-[#3D421F]">{line.description}</div>
                  <div className="text-xs text-black/50">
                    {line.accounts ? `${line.accounts.code} — ${line.accounts.name}` : "—"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] font-semibold text-black/60"
                    title={line.tax_codes?.label}
                  >
                    {line.tax_codes?.code ?? "—"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                  {formatAedAccounting(line.net_amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-black/60">
                  {formatAedAccounting(line.tax_amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-[#3D421F]">
                  {formatAedAccounting(line.gross_amount)}
                </td>
              </tr>
            ))}
          </tbody>
          {lines.length > 1 ? (
            <tfoot>
              <tr className="border-t border-black/10 bg-black/[0.03] font-semibold text-[#3D421F]">
                <td className="px-4 py-2.5" colSpan={2}>
                  Total · {lines.length} lines
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatAedAccounting(invoice.subtotal_net)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatAedAccounting(invoice.tax_total)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatAedAccounting(invoice.total_gross)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {invoice.memo ? (
        <p className="flex items-start gap-2 text-sm text-black/55">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-black/35" />
          {invoice.memo}
        </p>
      ) : null}
    </div>
  );
}

function Amount({
  label,
  value,
  negative,
  strong,
}: {
  label: string;
  value: number;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        strong
          ? "border-[var(--venue-primary,#818a40)]/25 bg-[var(--venue-secondary,#F0F3DD)]/70"
          : "border-black/10 bg-white",
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-black/45">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 tabular-nums",
          strong ? "text-xl font-semibold" : "text-lg font-medium",
          negative ? "text-red-700" : "text-[#3D421F]",
        )}
      >
        {formatAedAccounting(value)}
      </div>
    </div>
  );
}

function Fact({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-black/45">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-sm text-[#3D421F]">{children}</dd>
    </div>
  );
}
