"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Ticket,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  importWaiterVoucherSuggestions,
  markVenueVoucherRedeemed,
  removeVenueVoucher,
  saveVenueVoucher,
} from "@/lib/actions/sales";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import {
  collectWaiterVoucherSuggestions,
  formatLocalDate,
  reconcileVouchers,
  summarizeVoucherLedger,
} from "@/lib/sales/vouchers-calculations";
import type {
  ParsedWaiterVoucherComment,
  VenueVoucher,
  VoucherStatus,
  VoucherTenderTotals,
} from "@/lib/sales/vouchers-types";
import {
  VOUCHER_STATUS_LABELS,
  VOUCHER_STATUSES,
} from "@/lib/sales/vouchers-types";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type VouchersPanelProps = {
  vouchers: VenueVoucher[];
  tenderTotals: VoucherTenderTotals;
  waiterEntries: Array<{
    id: string;
    sale_date: string;
    voucher_comments: string | null;
  }>;
  canEdit: boolean;
};

type FormState = {
  id: string;
  voucher_number: string;
  voucher_name: string;
  face_value_gs: string;
  status: VoucherStatus;
  issued_date: string;
  redeemed_date: string;
  expires_date: string;
  purchaser_name: string;
  recipient_name: string;
  notes: string;
};

const inputClass =
  "mt-1 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[#3D421F]/35 disabled:opacity-60";

const textareaClass =
  "mt-1 w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[#3D421F]/35 disabled:opacity-60";

function emptyForm(date = formatLocalDate()): FormState {
  return {
    id: "",
    voucher_number: "",
    voucher_name: "",
    face_value_gs: "",
    status: "issued",
    issued_date: date,
    redeemed_date: "",
    expires_date: "",
    purchaser_name: "",
    recipient_name: "",
    notes: "",
  };
}

function voucherToForm(voucher: VenueVoucher): FormState {
  return {
    id: voucher.id,
    voucher_number: voucher.voucher_number,
    voucher_name: voucher.voucher_name,
    face_value_gs: String(voucher.face_value_gs),
    status: voucher.status,
    issued_date: voucher.issued_date,
    redeemed_date: voucher.redeemed_date ?? "",
    expires_date: voucher.expires_date ?? "",
    purchaser_name: voucher.purchaser_name,
    recipient_name: voucher.recipient_name,
    notes: voucher.notes,
  };
}

function statusBadgeClass(status: VoucherStatus): string {
  switch (status) {
    case "issued":
      return "bg-[#818a40]/15 text-[#3D421F]";
    case "redeemed":
      return "bg-emerald-100 text-emerald-900";
    case "cancelled":
      return "bg-black/5 text-black/55";
    case "expired":
      return "bg-amber-100 text-amber-900";
  }
}

function formatSignedMoney(value: number): string {
  if (value === 0) return formatMoney(0);
  const sign = value > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

export function VouchersPanel({
  vouchers,
  tenderTotals,
  waiterEntries,
  canEdit,
}: VouchersPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | "all">(
    "all",
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showTenderDays, setShowTenderDays] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedImports, setSelectedImports] = useState<Set<string>>(
    () => new Set(),
  );

  const ledger = useMemo(() => summarizeVoucherLedger(vouchers), [vouchers]);
  const reconciliation = useMemo(
    () => reconcileVouchers(ledger, tenderTotals),
    [ledger, tenderTotals],
  );

  const existingNumbers = useMemo(
    () =>
      new Set(vouchers.map((v) => v.voucher_number.trim().toLowerCase())),
    [vouchers],
  );

  const suggestions = useMemo(
    () => collectWaiterVoucherSuggestions(waiterEntries, existingNumbers),
    [waiterEntries, existingNumbers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((voucher) => {
      if (statusFilter !== "all" && voucher.status !== statusFilter) {
        return false;
      }
      if (dateFrom && voucher.issued_date < dateFrom) return false;
      if (dateTo && voucher.issued_date > dateTo) return false;
      if (!q) return true;
      const haystack = [
        voucher.voucher_number,
        voucher.voucher_name,
        voucher.purchaser_name,
        voucher.recipient_name,
        voucher.notes,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [vouchers, search, statusFilter, dateFrom, dateTo]);

  function openCreate() {
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(voucher: VenueVoucher) {
    setForm(voucherToForm(voucher));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setForm(emptyForm());
  }

  function handleSave() {
    startTransition(async () => {
      const formData = new FormData();
      if (form.id) formData.set("id", form.id);
      formData.set("voucher_number", form.voucher_number);
      formData.set("voucher_name", form.voucher_name);
      formData.set("face_value_gs", form.face_value_gs || "0");
      formData.set("status", form.status);
      formData.set("issued_date", form.issued_date);
      formData.set("redeemed_date", form.redeemed_date);
      formData.set("expires_date", form.expires_date);
      formData.set("purchaser_name", form.purchaser_name);
      formData.set("recipient_name", form.recipient_name);
      formData.set("notes", form.notes);

      const result = await saveVenueVoucher(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Voucher saved.");
      closeForm();
      router.refresh();
    });
  }

  function handleDelete(voucher: VenueVoucher) {
    if (
      !window.confirm(
        `Delete voucher ${voucher.voucher_number}? This cannot be undone.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", voucher.id);
      const result = await removeVenueVoucher(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Voucher deleted.");
      if (form.id === voucher.id) closeForm();
      router.refresh();
    });
  }

  function handleQuickRedeem(voucher: VenueVoucher) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", voucher.id);
      formData.set("redeemed_date", formatLocalDate());
      const result = await markVenueVoucherRedeemed(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Voucher redeemed.");
      router.refresh();
    });
  }

  function toggleImport(key: string) {
    setSelectedImports((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllImports(items: ParsedWaiterVoucherComment[]) {
    setSelectedImports(
      new Set(items.map((item) => item.voucher_number.toLowerCase())),
    );
  }

  function handleImport() {
    const items = suggestions.filter((item) =>
      selectedImports.has(item.voucher_number.toLowerCase()),
    );
    if (items.length === 0) {
      toast.error("Select at least one voucher to import.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set(
        "payload",
        JSON.stringify(
          items.map((item) => ({
            voucher_number: item.voucher_number,
            voucher_name: item.voucher_name,
            face_value_gs: item.face_value_gs,
            issued_date: item.sale_date,
            source_waiter_sales_id: item.waiter_sales_id,
          })),
        ),
      );
      const result = await importWaiterVoucherSuggestions(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Imported.");
      setSelectedImports(new Set());
      setShowImport(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          label="Outstanding"
          value={formatMoney(ledger.outstanding_gs)}
          hint={`${ledger.outstanding_count} open`}
          emphasis
        />
        <SummaryCard
          label="Issued (all time)"
          value={formatMoney(ledger.issued_all_time_gs)}
          hint={`${ledger.issued_all_time_count} vouchers`}
        />
        <SummaryCard
          label="Redeemed"
          value={formatMoney(ledger.redeemed_gs)}
          hint={`${ledger.redeemed_count} used`}
        />
        <SummaryCard
          label="Cancelled"
          value={formatMoney(ledger.cancelled_gs)}
          hint={`${ledger.cancelled_count} voided`}
        />
        <SummaryCard
          label="Expired"
          value={formatMoney(ledger.expired_gs)}
          hint={`${ledger.expired_count} expired`}
        />
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-[#3D421F]">
              Tender reconciliation
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Compared against Daily Sales tender totals for Voucher Issue and
              Voucher Redeem across all time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowTenderDays((open) => !open)}
            className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm text-[#3D421F] hover:bg-black/[0.03]"
          >
            {showTenderDays ? "Hide daily tenders" : "Show daily tenders"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ReconcileRow
            label="Voucher Issue"
            tender={reconciliation.tender_issue_gs}
            ledger={reconciliation.ledger_issued_gs}
            variance={reconciliation.issue_variance_gs}
          />
          <ReconcileRow
            label="Voucher Redeem"
            tender={reconciliation.tender_redeem_gs}
            ledger={reconciliation.ledger_redeemed_gs}
            variance={reconciliation.redeem_variance_gs}
          />
        </div>

        {showTenderDays ? (
          <div className="overflow-x-auto rounded-lg border border-black/10">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium text-right">Issue</th>
                  <th className="px-3 py-2 font-medium text-right">Redeem</th>
                </tr>
              </thead>
              <tbody>
                {tenderTotals.days.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-6 text-center text-black/45"
                    >
                      No Voucher Issue or Redeem tender amounts recorded yet.
                    </td>
                  </tr>
                ) : (
                  tenderTotals.days.map((day) => (
                    <tr key={day.sale_date} className="border-t border-black/5">
                      <td className="px-3 py-2 text-[#3D421F]">
                        {day.sale_date}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(day.issue_gs)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(day.redeem_gs)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#3D421F] px-3 py-2 text-sm text-white hover:bg-[#2f3318]"
            >
              <Plus className="h-4 w-4" />
              Add voucher
            </button>
            <button
              type="button"
              onClick={() => {
                setShowImport(true);
                selectAllImports(suggestions);
              }}
              disabled={suggestions.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] hover:bg-black/[0.03] disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              Import from waiter comments
              {suggestions.length > 0 ? (
                <span className="rounded-full bg-[#818a40]/20 px-1.5 text-xs">
                  {suggestions.length}
                </span>
              ) : null}
            </button>
          </>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search number, name…"
              className="h-10 w-52 rounded-md border border-black/10 bg-white pl-8 pr-3 text-sm outline-none focus:border-[#3D421F]/35"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as VoucherStatus | "all")
            }
            className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#3D421F]/35"
          >
            <option value="all">All statuses</option>
            {VOUCHER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {VOUCHER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#3D421F]/35"
            aria-label="Issued from"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#3D421F]/35"
            aria-label="Issued to"
          />
          {(search || statusFilter !== "all" || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
              className="inline-flex items-center gap-1 rounded-md border border-black/10 bg-white px-2.5 py-2 text-sm text-black/60 hover:bg-black/[0.03]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {formOpen ? (
        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl text-[#3D421F]">
                {form.id ? "Edit voucher" : "Add voucher"}
              </h2>
              <p className="mt-1 text-sm text-black/55">
                Track each issued voucher individually so outstanding liability
                stays accurate.
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-md p-1.5 text-black/45 hover:bg-black/[0.04] hover:text-[#3D421F]"
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Voucher number *">
              <input
                className={inputClass}
                disabled={!canEdit || isPending}
                value={form.voucher_number}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    voucher_number: e.target.value,
                  }))
                }
                placeholder="e.g. GV-1042"
              />
            </Field>
            <Field label="Voucher name">
              <input
                className={inputClass}
                disabled={!canEdit || isPending}
                value={form.voucher_name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, voucher_name: e.target.value }))
                }
                placeholder="Gift / occasion label"
              />
            </Field>
            <Field label="Face value *">
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                disabled={!canEdit || isPending}
                value={form.face_value_gs}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    face_value_gs: e.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                disabled={!canEdit || isPending}
                value={form.status}
                onChange={(e) => {
                  const status = e.target.value as VoucherStatus;
                  setForm((prev) => ({
                    ...prev,
                    status,
                    redeemed_date:
                      status === "redeemed"
                        ? prev.redeemed_date || formatLocalDate()
                        : "",
                  }));
                }}
              >
                {VOUCHER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {VOUCHER_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Issued date *">
              <input
                type="date"
                className={inputClass}
                disabled={!canEdit || isPending}
                value={form.issued_date}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, issued_date: e.target.value }))
                }
              />
            </Field>
            <Field label="Redeemed date">
              <input
                type="date"
                className={inputClass}
                disabled={
                  !canEdit || isPending || form.status !== "redeemed"
                }
                value={form.redeemed_date}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    redeemed_date: e.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Expires">
              <input
                type="date"
                className={inputClass}
                disabled={!canEdit || isPending}
                value={form.expires_date}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, expires_date: e.target.value }))
                }
              />
            </Field>
            <Field label="Purchaser">
              <input
                className={inputClass}
                disabled={!canEdit || isPending}
                value={form.purchaser_name}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    purchaser_name: e.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Recipient">
              <input
                className={inputClass}
                disabled={!canEdit || isPending}
                value={form.recipient_name}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    recipient_name: e.target.value,
                  }))
                }
              />
            </Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes">
                <textarea
                  rows={3}
                  className={textareaClass}
                  disabled={!canEdit || isPending}
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Optional details, POS references, special conditions…"
                />
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canEdit || isPending || !form.voucher_number.trim()}
              onClick={handleSave}
              className="rounded-md bg-[#3D421F] px-4 py-2 text-sm text-white hover:bg-[#2f3318] disabled:opacity-50"
            >
              {form.id ? "Save changes" : "Create voucher"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={closeForm}
              className="rounded-md border border-black/10 bg-white px-4 py-2 text-sm text-[#3D421F] hover:bg-black/[0.03]"
            >
              Cancel
            </button>
          </div>
        </Card>
      ) : null}

      {showImport ? (
        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl text-[#3D421F]">
                Import from waiter comments
              </h2>
              <p className="mt-1 text-sm text-black/55">
                Parsed from lines in the format{" "}
                <span className="font-medium text-[#3D421F]">
                  Name | Number | Value
                </span>
                . Already-tracked numbers are skipped.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowImport(false)}
              className="rounded-md p-1.5 text-black/45 hover:bg-black/[0.04]"
              aria-label="Close import"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {suggestions.length === 0 ? (
            <p className="text-sm text-black/50">
              No new voucher comments found to import.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-black/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
                    <tr>
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={
                            selectedImports.size === suggestions.length &&
                            suggestions.length > 0
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              selectAllImports(suggestions);
                            } else {
                              setSelectedImports(new Set());
                            }
                          }}
                          aria-label="Select all"
                        />
                      </th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Number</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium text-right">Value</th>
                      <th className="px-3 py-2 font-medium">Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((item) => {
                      const key = item.voucher_number.toLowerCase();
                      return (
                        <tr
                          key={`${item.waiter_sales_id}-${key}`}
                          className="border-t border-black/5"
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedImports.has(key)}
                              onChange={() => toggleImport(key)}
                              aria-label={`Select ${item.voucher_number}`}
                            />
                          </td>
                          <td className="px-3 py-2">{item.sale_date}</td>
                          <td className="px-3 py-2 font-medium text-[#3D421F]">
                            {item.voucher_number}
                          </td>
                          <td className="px-3 py-2">
                            {item.voucher_name || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(item.face_value_gs)}
                          </td>
                          <td className="max-w-[16rem] truncate px-3 py-2 text-black/50">
                            {item.raw}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                disabled={!canEdit || isPending || selectedImports.size === 0}
                onClick={handleImport}
                className="rounded-md bg-[#3D421F] px-4 py-2 text-sm text-white hover:bg-[#2f3318] disabled:opacity-50"
              >
                Import selected ({selectedImports.size})
              </button>
            </>
          )}
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-[var(--venue-primary,#818a40)]" />
            <h2 className="font-serif text-lg text-[#3D421F]">
              Voucher ledger
            </h2>
            <span className="text-sm text-black/45">
              {filtered.length}
              {filtered.length !== vouchers.length
                ? ` of ${vouchers.length}`
                : ""}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-4 py-2.5 font-medium">Number</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium text-right">Value</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Issued</th>
                <th className="px-4 py-2.5 font-medium">Redeemed</th>
                <th className="px-4 py-2.5 font-medium">Expires</th>
                <th className="px-4 py-2.5 font-medium">People</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-black/45"
                  >
                    {vouchers.length === 0
                      ? "No vouchers yet. Add one or import from waiter comments."
                      : "No vouchers match the current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((voucher) => (
                  <tr
                    key={voucher.id}
                    className="border-t border-black/5 align-top hover:bg-black/[0.015]"
                  >
                    <td className="px-4 py-3 font-medium text-[#3D421F]">
                      {voucher.voucher_number}
                    </td>
                    <td className="px-4 py-3">
                      <div>{voucher.voucher_name || "—"}</div>
                      {voucher.notes ? (
                        <div className="mt-0.5 max-w-[14rem] truncate text-xs text-black/40">
                          {voucher.notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(voucher.face_value_gs)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          statusBadgeClass(voucher.status),
                        )}
                      >
                        {VOUCHER_STATUS_LABELS[voucher.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {voucher.issued_date}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {voucher.redeemed_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {voucher.expires_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-black/60">
                      {voucher.purchaser_name || voucher.recipient_name ? (
                        <>
                          {voucher.purchaser_name ? (
                            <div>From: {voucher.purchaser_name}</div>
                          ) : null}
                          {voucher.recipient_name ? (
                            <div>To: {voucher.recipient_name}</div>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canEdit && voucher.status === "issued" ? (
                          <button
                            type="button"
                            title="Mark redeemed"
                            disabled={isPending}
                            onClick={() => handleQuickRedeem(voucher)}
                            className="rounded-md p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        ) : null}
                        {canEdit ? (
                          <>
                            <button
                              type="button"
                              title="Edit"
                              disabled={isPending}
                              onClick={() => openEdit(voucher)}
                              className="rounded-md p-1.5 text-[#3D421F] hover:bg-black/[0.04] disabled:opacity-50"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              disabled={isPending}
                              onClick={() => handleDelete(voucher)}
                              className="rounded-md p-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <Card
      className={cn(
        "p-4",
        emphasis && "border-[#818a40]/25 bg-[#818a40]/08",
      )}
    >
      <p className="text-xs uppercase tracking-wide text-black/45">{label}</p>
      <p className="mt-1 font-serif text-2xl tabular-nums text-[#3D421F]">
        {value}
      </p>
      <p className="mt-1 text-xs text-black/45">{hint}</p>
    </Card>
  );
}

function ReconcileRow({
  label,
  tender,
  ledger,
  variance,
}: {
  label: string;
  tender: number;
  ledger: number;
  variance: number;
}) {
  const balanced = Math.abs(variance) < 0.005;
  return (
    <div className="rounded-lg border border-black/10 bg-white/70 p-4">
      <p className="text-sm font-medium text-[#3D421F]">{label}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-black/50">Tenders</dt>
          <dd className="tabular-nums">{formatMoney(tender)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-black/50">Ledger</dt>
          <dd className="tabular-nums">{formatMoney(ledger)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-black/5 pt-1.5">
          <dt className="text-black/50">Variance</dt>
          <dd
            className={cn(
              "tabular-nums font-medium",
              balanced ? "text-emerald-700" : "text-amber-800",
            )}
          >
            {formatSignedMoney(variance)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-[#3D421F]">{label}</span>
      {children}
    </label>
  );
}
