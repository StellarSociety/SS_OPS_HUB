"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { InvoiceStatusBadge } from "@/components/accounting/invoices-sub-nav";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import type {
  JournalEntry,
  JournalSourceType,
  JournalStatus,
} from "@/lib/accounting/journal-types";
import {
  JOURNAL_SOURCE_LABELS,
  JOURNAL_STATUS_LABELS,
} from "@/lib/accounting/journal-types";
import { formatAedAccounting } from "@/lib/accounting/money";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | JournalStatus;
type SourceFilter = "all" | JournalSourceType;

type Props = {
  entries: JournalEntry[];
};

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "posted", label: JOURNAL_STATUS_LABELS.posted },
  { id: "draft", label: JOURNAL_STATUS_LABELS.draft },
  { id: "reversed", label: JOURNAL_STATUS_LABELS.reversed },
];

const SOURCE_CHIPS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "All sources" },
  { id: "ap", label: JOURNAL_SOURCE_LABELS.ap },
  { id: "sales", label: JOURNAL_SOURCE_LABELS.sales },
  { id: "manual", label: JOURNAL_SOURCE_LABELS.manual },
  { id: "payroll", label: JOURNAL_SOURCE_LABELS.payroll },
  { id: "bank", label: JOURNAL_SOURCE_LABELS.bank },
];

export function JournalsBrowserClient({ entries }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (sourceFilter !== "all" && entry.source_type !== sourceFilter) {
        return false;
      }
      if (dateFrom && entry.entry_date < dateFrom) return false;
      if (dateTo && entry.entry_date > dateTo) return false;
      if (!q) return true;
      const hay = [
        entry.entry_no,
        entry.memo ?? "",
        JOURNAL_SOURCE_LABELS[entry.source_type] ?? entry.source_type,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [entries, statusFilter, sourceFilter, search, dateFrom, dateTo]);

  function exportCsv() {
    const headers = [
      "Entry No",
      "Date",
      "Source",
      "Memo",
      "Status",
      "Debit",
      "Credit",
      "Entity",
    ];
    const rows = filtered.map((e) => [
      e.entry_no,
      e.entry_date,
      e.source_type,
      e.memo ?? "",
      e.status,
      e.total_debit,
      e.total_credit,
      e.legal_entities
        ? `${e.legal_entities.entity_code} — ${e.legal_entities.name}`
        : "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-black/55">
            Search
          </label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Entry no or memo…"
            className="h-10"
          />
        </div>
        <div className="w-[150px]">
          <label className="mb-1 block text-xs font-medium text-black/55">
            From
          </label>
          <DateInput
            value={dateFrom}
            onChange={setDateFrom}
            className="w-full"
            inputClassName="h-10"
          />
        </div>
        <div className="w-[150px]">
          <label className="mb-1 block text-xs font-medium text-black/55">
            To
          </label>
          <DateInput
            value={dateTo}
            onChange={setDateTo}
            className="w-full"
            inputClassName="h-10"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-10 border border-black/10"
          onClick={exportCsv}
          disabled={filtered.length === 0}
        >
          <Download className="size-4" />
          CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setStatusFilter(chip.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === chip.id
                ? "bg-[var(--venue-primary,#818a40)] text-white"
                : "bg-black/5 text-black/70 hover:bg-black/10",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {SOURCE_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setSourceFilter(chip.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              sourceFilter === chip.id
                ? "bg-[#3D421F] text-white"
                : "bg-black/5 text-black/70 hover:bg-black/10",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-black/55">
        {filtered.length} journal{filtered.length === 1 ? "" : "s"}
        {filtered.length !== entries.length
          ? ` (of ${entries.length})`
          : ""}
        .
      </p>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/40 text-xs uppercase tracking-wide text-black/55">
            <tr>
              <th className="px-3 py-2.5 font-medium">Entry</th>
              <th className="px-3 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Source</th>
              <th className="px-3 py-2.5 font-medium">Memo</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Debit</th>
              <th className="px-3 py-2.5 text-right font-medium">Credit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No journal entries match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-black/5 hover:bg-black/[0.02]"
                >
                  <td className="px-3 py-2.5">
                    <ScopedLink
                      href={`/accounting/journals/${entry.id}`}
                      className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
                    >
                      {entry.entry_no}
                    </ScopedLink>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-black/75">
                    {entry.entry_date}
                  </td>
                  <td className="px-3 py-2.5 text-black/75">
                    {JOURNAL_SOURCE_LABELS[entry.source_type] ??
                      entry.source_type}
                  </td>
                  <td className="max-w-[280px] truncate px-3 py-2.5 text-black/65">
                    {entry.memo || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <InvoiceStatusBadge status={entry.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatAedAccounting(entry.total_debit)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatAedAccounting(entry.total_credit)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
