"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, ExternalLink, Send } from "lucide-react";
import { InvoiceStatusBadge } from "@/components/accounting/invoices-sub-nav";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  bulkSubmitApInvoices,
  submitApInvoice,
} from "@/lib/actions/accounting-ap";
import type { ApInvoice, ApInvoiceStatus } from "@/lib/accounting/ap-types";
import { AP_STATUS_LABELS } from "@/lib/accounting/ap-types";
import { formatAedAccounting } from "@/lib/accounting/money";
import { cn } from "@/lib/utils";

type StatusFilter = "needs_action" | "all" | ApInvoiceStatus;

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
  if (filter === "needs_action") {
    return inv.status === "draft" || inv.status === "submitted" || inv.status === "approved";
  }
  return inv.status === filter;
}

function escapeCsv(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ApInvoicesTable({ invoices, canEdit }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("needs_action");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (!matchesStatus(inv, statusFilter)) return false;
      if (dateFrom && inv.invoice_date < dateFrom) return false;
      if (dateTo && inv.invoice_date > dateTo) return false;
      if (!q) return true;
      const hay = [
        inv.invoice_no,
        inv.supplier_invoice_no,
        inv.memo ?? "",
        inv.suppliers?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [invoices, statusFilter, search, dateFrom, dateTo]);

  const draftIds = filtered
    .filter((i) => i.status === "draft" && selected.has(i.id))
    .map((i) => i.id);

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.filter((i) => i.status === "draft").map((i) => i.id)));
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
      inv.supplier_invoice_no,
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

  function handleBulkSubmit() {
    if (!draftIds.length) {
      toast.error("Select draft invoices to submit.");
      return;
    }
    startTransition(async () => {
      const result = await bulkSubmitApInvoices(draftIds);
      const failed = result.results.filter((r) => !r.ok);
      if (failed.length) {
        toast.error(
          `${failed.length} of ${draftIds.length} failed: ${failed[0]?.error ?? "error"}`,
        );
      } else {
        toast.saved(`Submitted ${draftIds.length} invoice(s).`);
      }
      setSelected(new Set());
    });
  }

  function handleSubmitOne(id: string) {
    startTransition(async () => {
      const result = await submitApInvoice(id);
      if (!result.ok) {
        toast.error(result.error ?? "Submit failed.");
        return;
      }
      toast.saved("Invoice submitted.");
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
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="needs_action">Needs action</option>
            <option value="all">All</option>
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Invoice no, supplier, memo…"
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#3D421F]">From</label>
          <DateInput value={dateFrom} onChange={setDateFrom} className="w-[150px]" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[#3D421F]">To</label>
          <DateInput value={dateTo} onChange={setDateTo} className="w-[150px]" />
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
              onClick={handleBulkSubmit}
            >
              <Send className="mr-1.5 h-4 w-4" />
              Submit selected ({draftIds.length})
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
                    aria-label="Select all drafts"
                    checked={
                      filtered.some((i) => i.status === "draft") &&
                      filtered
                        .filter((i) => i.status === "draft")
                        .every((i) => selected.has(i.id))
                    }
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
              )}
              <th className="px-3 py-2.5">Invoice</th>
              <th className="px-3 py-2.5">Supplier</th>
              <th className="px-3 py-2.5">Supplier inv #</th>
              <th className="px-3 py-2.5">Invoice date</th>
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
                  colSpan={canEdit ? 13 : 12}
                  className="px-3 py-10 text-center text-black/45"
                >
                  No invoices match these filters.
                </td>
              </tr>
            ) : (
              filtered.map((inv) => {
                const days = daysToDue(inv.due_date);
                return (
                  <tr
                    key={inv.id}
                    className="border-b border-black/5 hover:bg-[var(--venue-primary)]/5"
                  >
                    {canEdit && (
                      <td className="px-3 py-2.5">
                        {inv.status === "draft" ? (
                          <input
                            type="checkbox"
                            aria-label={`Select ${inv.invoice_no}`}
                            checked={selected.has(inv.id)}
                            onChange={(e) => toggleOne(inv.id, e.target.checked)}
                          />
                        ) : null}
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                      <ScopedLink
                        href={`/accounting/invoices/${inv.id}`}
                        className="hover:underline"
                      >
                        {inv.invoice_no}
                      </ScopedLink>
                    </td>
                    <td className="px-3 py-2.5">{inv.suppliers?.name ?? "—"}</td>
                    <td className="px-3 py-2.5">{inv.supplier_invoice_no}</td>
                    <td className="px-3 py-2.5 tabular-nums">{inv.invoice_date}</td>
                    <td className="px-3 py-2.5 tabular-nums">{inv.due_date}</td>
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
                        <ScopedLink
                          href={`/accounting/invoices/${inv.id}`}
                          className="inline-flex h-9 items-center justify-center rounded-md px-3 hover:bg-black/5"
                          title="Open"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="sr-only">Open</span>
                        </ScopedLink>
                        {canEdit && inv.status === "draft" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => handleSubmitOne(inv.id)}
                            title="Submit"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span className="sr-only">Submit</span>
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
      <p className="text-xs text-black/45">
        Showing {filtered.length} of {invoices.length} invoice(s).
      </p>
    </div>
  );
}
