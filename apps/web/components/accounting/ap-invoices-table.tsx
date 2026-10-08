"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, Send } from "lucide-react";
import { InvoiceStatusBadge } from "@/components/accounting/invoices-sub-nav";
import { ApInvoiceDialog } from "@/components/accounting/ap-invoice-dialog";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  bulkPostApInvoices,
  postApInvoice,
} from "@/lib/actions/accounting-ap";
import type { ApInvoice, ApInvoiceStatus } from "@/lib/accounting/ap-types";
import {
  AP_DOCUMENT_TYPE_LABELS,
  AP_STATUS_LABELS,
} from "@/lib/accounting/ap-types";
import { formatAedAccounting, formatDateDmy } from "@/lib/accounting/money";
import { cn } from "@/lib/utils";

type StatusFilter = "not_posted" | "all" | ApInvoiceStatus;

const PAGE_SIZE = 50;

/** Saved but not yet on the ledger (left over from the old approval flow). */
const isUnposted = (inv: ApInvoice) =>
  inv.status === "draft" || inv.status === "submitted" || inv.status === "approved";

type Props = {
  invoices: ApInvoice[];
  canEdit: boolean;
};

function daysToDue(dueDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function matchesStatus(inv: ApInvoice, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "not_posted") return isUnposted(inv);
  return inv.status === filter;
}

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ApInvoicesTable({ invoices, canEdit }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (!matchesStatus(inv, statusFilter)) return false;
      if (dateFrom && inv.invoice_date < dateFrom) return false;
      if (dateTo && inv.invoice_date > dateTo) return false;
      if (!q) return true;
      const hay = [
        inv.invoice_no,
        inv.supplier_invoice_no ?? "",
        inv.delivery_note_no ?? "",
        inv.memo ?? "",
        inv.suppliers?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [invoices, statusFilter, search, dateFrom, dateTo]);

  // Render one page at a time; hundreds of rows make the page sluggish.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  const draftIds = filtered
    .filter((i) => isUnposted(i) && selected.has(i.id))
    .map((i) => i.id);

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.filter(isUnposted).map((i) => i.id)));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function exportCsv() {
    const headers = [
      "Invoice No",
      "Supplier",
      "Supplier Invoice No",
      "Invoice Date",
      "Due Date",
      "Venue",
      "Net",
      "VAT",
      "Gross",
      "Status",
      "Days to Due",
    ];
    const rows = filtered.map((inv) => [
      inv.invoice_no,
      inv.suppliers?.name ?? "",
      inv.supplier_invoice_no ?? "",
      inv.invoice_date,
      inv.due_date,
      inv.venues?.name ?? "",
      inv.subtotal_net,
      inv.tax_total,
      inv.total_gross,
      inv.status,
      daysToDue(inv.due_date),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ap-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleBulkPost() {
    if (!draftIds.length) {
      toast.error("Select unposted documents to post.");
      return;
    }
    const ids = [...draftIds];
    startTransition(async () => {
      // Small chunks: each server action must finish well inside its time limit.
      const failed: { id: string; error?: string }[] = [];
      for (let i = 0; i < ids.length; i += 15) {
        const result = await bulkPostApInvoices(ids.slice(i, i + 15));
        if (!result.ok) {
          toast.error(result.error ?? "Posting failed.");
          return;
        }
        failed.push(...result.results.filter((r) => !r.ok));
      }
      if (failed.length) {
        toast.error(
          `${failed.length} of ${ids.length} failed: ${failed[0]?.error ?? "error"}`,
        );
      } else {
        toast.saved(`Posted ${ids.length} document(s) to the ledger.`);
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  function handlePostOne(id: string) {
    startTransition(async () => {
      const result = await postApInvoice(id);
      if (!result.ok) {
        toast.error(result.error ?? "Posting failed.");
        return;
      }
      toast.saved("Posted to the ledger.");
      router.refresh();
    });
  }

  const selectClass =
    "flex h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#3D421F]">Status</label>
          <select
            className={selectClass}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setPage(0);
            }}
          >
            <option value="all">All</option>
            <option value="not_posted">Not posted</option>
            {(Object.keys(AP_STATUS_LABELS) as ApInvoiceStatus[]).map((s) => (
              <option key={s} value={s}>
                {AP_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <label className="text-xs font-medium text-[#3D421F]">Search</label>
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Invoice no, supplier, memo…"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#3D421F]">From</label>
          <DateInput
            value={dateFrom}
            onChange={(v) => {
              setDateFrom(v);
              setPage(0);
            }}
            className="w-[150px]"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#3D421F]">To</label>
          <DateInput
            value={dateTo}
            onChange={(v) => {
              setDateTo(v);
              setPage(0);
            }}
            className="w-[150px]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={exportCsv}
            className="border border-black/10"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
          {canEdit && (
            <Button
              type="button"
              disabled={pending || draftIds.length === 0}
              onClick={handleBulkPost}
            >
              <Send className="mr-1.5 h-4 w-4" />
              {pending ? "Posting…" : `Post selected (${draftIds.length})`}
            </Button>
          )}
          <ScopedLink
            href="/accounting/invoices/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--venue-primary,#818a40)] px-4 text-sm font-medium text-white hover:opacity-90"
          >
            New invoice
          </ScopedLink>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
            <tr>
              {canEdit && (
                <th className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all unposted"
                    checked={
                      filtered.some(isUnposted) &&
                      filtered
                        .filter(isUnposted)
                        .every((i) => selected.has(i.id))
                    }
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
              )}
              <th className="px-3 py-2.5">Invoice date</th>
              <th className="px-3 py-2.5">Invoice</th>
              <th className="px-3 py-2.5">Supplier</th>
              <th className="px-3 py-2.5">Due date</th>
              <th className="px-3 py-2.5">Venue</th>
              <th className="px-3 py-2.5 text-right">Net</th>
              <th className="px-3 py-2.5 text-right">VAT</th>
              <th className="px-3 py-2.5 text-right">Gross</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Days</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 12 : 11}
                  className="px-3 py-10 text-center text-black/45"
                >
                  No invoices match these filters.
                </td>
              </tr>
            ) : (
              pageRows.map((inv) => {
                const days = daysToDue(inv.due_date);
                return (
                  <tr
                    key={inv.id}
                    className="border-b border-black/5 hover:bg-[var(--venue-primary)]/5"
                  >
                    {canEdit && (
                      <td className="px-3 py-2.5">
                        {isUnposted(inv) ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${inv.invoice_no}`}
                            checked={selected.has(inv.id)}
                            onChange={(e) => toggleOne(inv.id, e.target.checked)}
                          />
                        ) : null}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                      {formatDateDmy(inv.invoice_date)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                      <button
                        type="button"
                        onClick={() => setOpenId(inv.id)}
                        className="whitespace-nowrap text-left hover:underline"
                      >
                        {inv.invoice_no}
                      </button>
                      {inv.document_type !== "invoice" ? (
                        <div
                          className={cn(
                            "text-[11px] font-normal",
                            inv.document_type === "credit_note"
                              ? "text-red-700"
                              : "text-black/50",
                          )}
                        >
                          {AP_DOCUMENT_TYPE_LABELS[inv.document_type]}
                          {inv.delivery_note_no ? ` · DN ${inv.delivery_note_no}` : ""}
                        </div>
                      ) : null}
                      {inv.document_type === "delivery_note" && !inv.supplier_invoice_no ? (
                        <span className="mt-1 inline-flex whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          Requires invoice number
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">{inv.suppliers?.name ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatDateDmy(inv.due_date)}</td>
                    <td className="px-3 py-2.5">{inv.venues?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatAedAccounting(inv.subtotal_net)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatAedAccounting(inv.tax_total)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {formatAedAccounting(inv.total_gross)}
                    </td>
                    <td className="px-3 py-2.5">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        days < 0 &&
                          inv.status !== "posted" &&
                          inv.status !== "void" &&
                          inv.status !== "reversed" &&
                          "text-red-700",
                      )}
                    >
                      {days}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setOpenId(inv.id)}
                          className="inline-flex h-9 items-center justify-center rounded-md px-3 hover:bg-black/5"
                          title="Open"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="sr-only">Open</span>
                        </button>
                        {canEdit && isUnposted(inv) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => handlePostOne(inv.id)}
                            title="Post to ledger"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span className="sr-only">Post to ledger</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-black/45">
        <span>
          {filtered.length === 0
            ? `0 of ${invoices.length} documents`
            : `${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + pageRows.length} of ${filtered.length}`}
          {filtered.length !== invoices.length ? ` (filtered from ${invoices.length})` : ""}
        </span>
        {pageCount > 1 ? (
          <span className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <span className="px-2 tabular-nums">
              Page {currentPage + 1} of {pageCount}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </span>
        ) : null}
      </div>
      <ApInvoiceDialog
        invoiceId={openId}
        onClose={() => setOpenId(null)}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
