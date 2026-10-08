"use client";

import { ArrowLeft } from "lucide-react";
import { InvoiceStatusBadge } from "@/components/accounting/invoices-sub-nav";
import { ScopedLink } from "@/components/layout/scoped-link";
import type { JournalEntry } from "@/lib/accounting/journal-types";
import {
  JOURNAL_SOURCE_LABELS,
} from "@/lib/accounting/journal-types";
import { formatAedAccounting, formatDateDmy } from "@/lib/accounting/money";

type Props = {
  entry: JournalEntry;
};

function sourceHref(entry: JournalEntry): string | null {
  if (!entry.source_ref) return null;
  if (entry.source_type === "ap") {
    return `/accounting/invoices/${entry.source_ref}`;
  }
  return null;
}

export function JournalEntryDetail({ entry }: Props) {
  const lines = entry.journal_lines ?? [];
  const sourceLink = sourceHref(entry);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <ScopedLink
            href="/accounting/journals"
            className="inline-flex items-center gap-1.5 text-sm text-black/55 hover:text-[#3D421F]"
          >
            <ArrowLeft className="size-3.5" />
            Journals
          </ScopedLink>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-xl font-semibold text-[#3D421F] md:text-2xl">
              {entry.entry_no}
            </h2>
            <InvoiceStatusBadge status={entry.status} />
          </div>
          <p className="text-sm text-black/55">
            {formatDateDmy(entry.entry_date)}
            {entry.legal_entities
              ? ` · ${entry.legal_entities.entity_code} — ${entry.legal_entities.name}`
              : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-black/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Source"
          value={
            JOURNAL_SOURCE_LABELS[entry.source_type] ?? entry.source_type
          }
        />
        <Field
          label="Source document"
          value={
            sourceLink ? (
              <ScopedLink
                href={sourceLink}
                className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
              >
                Open invoice
              </ScopedLink>
            ) : (
              entry.source_ref ?? "—"
            )
          }
        />
        <Field label="Memo" value={entry.memo || "—"} />
        <Field
          label="Posted"
          value={
            entry.posted_at
              ? new Date(entry.posted_at).toLocaleString("en-AE")
              : "—"
          }
        />
        {entry.reversal_of_entry && (
          <Field
            label="Reversal of"
            value={
              <ScopedLink
                href={`/accounting/journals/${entry.reversal_of_entry.id}`}
                className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
              >
                {entry.reversal_of_entry.entry_no}
              </ScopedLink>
            }
          />
        )}
        {entry.reversed_by_entry && (
          <Field
            label="Reversed by"
            value={
              <ScopedLink
                href={`/accounting/journals/${entry.reversed_by_entry.id}`}
                className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
              >
                {entry.reversed_by_entry.entry_no}
              </ScopedLink>
            }
          />
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/40 text-xs uppercase tracking-wide text-black/55">
            <tr>
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 font-medium">Description</th>
              <th className="px-3 py-2.5 font-medium">Tax</th>
              <th className="px-3 py-2.5 text-right font-medium">Debit</th>
              <th className="px-3 py-2.5 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-black/5">
                <td className="px-3 py-2.5 tabular-nums text-black/55">
                  {line.line_no}
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-medium tabular-nums text-[#3D421F]">
                    {line.accounts?.code ?? "—"}
                  </span>
                  {line.accounts?.name ? (
                    <span className="text-black/55">
                      {" "}
                      · {line.accounts.name}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-black/75">
                  {line.description || "—"}
                </td>
                <td className="px-3 py-2.5 text-black/55">
                  {line.tax_codes?.code ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {line.debit > 0 ? formatAedAccounting(line.debit) : ""}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {line.credit > 0 ? formatAedAccounting(line.credit) : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 font-medium">
              <td colSpan={4} className="px-3 py-2.5 text-right text-[#3D421F]">
                Totals
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[#3D421F]">
                {formatAedAccounting(entry.total_debit)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[#3D421F]">
                {formatAedAccounting(entry.total_credit)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-black/45">
        {label}
      </p>
      <div className="mt-0.5 text-sm text-[#3D421F]">{value}</div>
    </div>
  );
}
