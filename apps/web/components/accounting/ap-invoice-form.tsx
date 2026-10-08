"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/components/ui/toast";
import { ApDuplicateDialog } from "@/components/accounting/ap-duplicate-dialog";
import type { ApDuplicateDoc } from "@/lib/accounting/ap-duplicates";
import {
  checkSupplierInvoiceDuplicate,
  saveApInvoiceForm,
  upsertSupplier,
} from "@/lib/actions/accounting-ap";
import {
  AP_DOCUMENT_TYPE_LABELS,
  supplierKindPickerLabel,
  type ApDocumentType,
  type ApInvoice,
  type ApInvoiceLineInput,
  type Supplier,
  type TaxCode,
  type TaxRate,
} from "@/lib/accounting/ap-types";
import type { Account } from "@/lib/accounting/types";
import { addDaysIso, formatAedAccounting, roundMoney } from "@/lib/accounting/money";
import {
  computePurchaseLineTax,
  resolveTaxRate,
} from "@/lib/accounting/tax";
import { toScopedHref } from "@/lib/venue/scope-routing";

type LineDraft = {
  key: string;
  description: string;
  accountId: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
};

type Props = {
  suppliers: Supplier[];
  accounts: Account[];
  taxCodes: TaxCode[];
  taxRates: TaxRate[];
  venue: { id: string; name: string; slug: string };
  entity: { id: string; entity_code: string; name: string } | null;
  canEdit: boolean;
  invoice: ApInvoice | null;
};

function newLineKey() {
  return `L-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyLine(defaults?: { accountId?: string; taxCodeId?: string }): LineDraft {
  return {
    key: newLineKey(),
    description: "",
    accountId: defaults?.accountId ?? "",
    quantity: "1",
    unitPrice: "",
    taxCodeId: defaults?.taxCodeId ?? "",
  };
}

export function ApInvoiceForm({
  suppliers: initialSuppliers,
  accounts,
  taxCodes,
  taxRates,
  venue,
  entity,
  canEdit,
  invoice,
}: Props) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [pending, startTransition] = useTransition();
  const [suppliers, setSuppliers] = useState(initialSuppliers);

  const [documentType, setDocumentType] = useState<ApDocumentType>(
    invoice?.document_type ?? "invoice",
  );
  // Credit notes are entered as positive amounts and shown/saved as negatives.
  const sign = documentType === "credit_note" ? -1 : 1;
  /** Signed amount for display; avoids showing "-AED 0.00". */
  const signed = (n: number) => (n ? sign * n : 0);
  const docLabel = AP_DOCUMENT_TYPE_LABELS[documentType].toLowerCase();
  const isDeliveryNote = documentType === "delivery_note";
  const [deliveryNoteNo, setDeliveryNoteNo] = useState(
    invoice?.delivery_note_no ?? "",
  );
  const [supplierId, setSupplierId] = useState(invoice?.supplier_id ?? "");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState(
    invoice?.supplier_invoice_no ?? "",
  );
  const [invoiceDate, setInvoiceDate] = useState(
    invoice?.invoice_date ?? new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(invoice?.due_date ?? "");
  const [dueManual, setDueManual] = useState(Boolean(invoice?.due_date));
  const [currency, setCurrency] = useState(invoice?.currency ?? "AED");
  const [fxRate, setFxRate] = useState(
    invoice?.fx_rate && invoice.fx_rate !== 1 ? String(invoice.fx_rate) : "",
  );
  const memo = invoice?.memo ?? "";
  const [attachment, setAttachment] = useState<File | null>(null);
  // Existing documents sharing this document's supplier reference.
  const [dupMatches, setDupMatches] = useState<ApDuplicateDoc[]>([]);
  /** Dialog state; `fromSave` when it interrupted a save. */
  const [dupDialog, setDupDialog] = useState<{ fromSave: boolean } | null>(null);
  /** The user chose to keep both for the current numbers. */
  const [dupAccepted, setDupAccepted] = useState(false);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierTrn, setNewSupplierTrn] = useState("");
  const [newSupplierTerms, setNewSupplierTerms] = useState("30");

  const defaultTax =
    taxCodes.find((t) => t.code.toUpperCase() === "SP")?.id ?? taxCodes[0]?.id ?? "";

  const [lines, setLines] = useState<LineDraft[]>(() => {
    if (invoice?.ap_invoice_lines?.length) {
      return invoice.ap_invoice_lines.map((l) => ({
        key: l.id,
        description: l.description,
        accountId: l.account_id,
        quantity: "1",
        unitPrice: String(Math.abs(Number(l.net_amount))),
        taxCodeId: l.tax_code_id,
      }));
    }
    return [emptyLine({ taxCodeId: defaultTax })];
  });

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);

  useEffect(() => {
    if (dueManual) return;
    if (!invoiceDate) return;
    const terms = selectedSupplier?.payment_terms_days ?? 30;
    setDueDate(addDaysIso(invoiceDate, terms));
  }, [invoiceDate, selectedSupplier?.payment_terms_days, dueManual]);

  useEffect(() => {
    if (!supplierId || !selectedSupplier) return;
    setLines((prev) =>
      prev.map((line, idx) => {
        if (idx !== 0) return line;
        return {
          ...line,
          accountId:
            line.accountId ||
            selectedSupplier.default_expense_account_id ||
            line.accountId,
          taxCodeId:
            line.taxCodeId ||
            selectedSupplier.default_tax_code_id ||
            defaultTax ||
            line.taxCodeId,
        };
      }),
    );
  }, [supplierId, selectedSupplier, defaultTax]);

  const lineAmounts = useMemo(() => {
    return lines.map((line) => {
      const qty = Number(line.quantity) || 0;
      const unit = Number(line.unitPrice) || 0;
      const net = roundMoney(qty * unit);
      const taxCode = taxCodes.find((t) => t.id === line.taxCodeId);
      if (!taxCode || !invoiceDate || !line.taxCodeId) {
        return { net, tax: 0, gross: net, rate: 0 };
      }
      try {
        const rate = resolveTaxRate(taxRates, taxCode.id, invoiceDate);
        const computed = computePurchaseLineTax({
          netAmount: net,
          taxCode,
          rate,
        });
        return {
          net: computed.netAmount,
          tax: computed.taxAmount,
          gross: computed.grossAmount,
          rate: computed.rate,
        };
      } catch {
        return { net, tax: 0, gross: net, rate: 0 };
      }
    });
  }, [lines, taxCodes, taxRates, invoiceDate]);

  const totals = useMemo(() => {
    return lineAmounts.reduce(
      (acc, a) => ({
        net: roundMoney(acc.net + a.net),
        tax: roundMoney(acc.tax + a.tax),
        gross: roundMoney(acc.gross + a.gross),
      }),
      { net: 0, tax: 0, gross: 0 },
    );
  }, [lineAmounts]);

  const lineInputs: ApInvoiceLineInput[] = useMemo(
    () =>
      lines.map((line, idx) => ({
        description: line.description,
        accountId: line.accountId,
        quantity: Number(line.quantity) || 0,
        unitPrice: Number(line.unitPrice) || 0,
        netAmount: lineAmounts[idx]?.net ?? 0,
        taxCodeId: line.taxCodeId,
      })),
    [lines, lineAmounts],
  );
  async function checkDuplicates() {
    if (!supplierId || (!supplierInvoiceNo.trim() && !deliveryNoteNo.trim())) {
      setDupMatches([]);
      return;
    }
    const result = await checkSupplierInvoiceDuplicate({
      supplierId,
      supplierInvoiceNo,
      deliveryNoteNo: isDeliveryNote ? deliveryNoteNo : "",
      documentType,
      excludeId: invoice?.id,
    });
    const matches = result.ok ? result.matches : [];
    setDupMatches(matches);
    if (matches.length && !dupAccepted) setDupDialog({ fromSave: false });
  }

  /** Editing a reference clears an earlier "keep both". */
  function onReferenceChange() {
    setDupAccepted(false);
    setDupMatches([]);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      emptyLine({
        accountId: selectedSupplier?.default_expense_account_id ?? "",
        taxCodeId: selectedSupplier?.default_tax_code_id ?? defaultTax,
      }),
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  function createSupplier() {
    if (!newSupplierName.trim()) {
      toast.error("Supplier name is required.");
      return;
    }
    startTransition(async () => {
      const result = await upsertSupplier({
        name: newSupplierName.trim(),
        trn: newSupplierTrn.trim() || null,
        paymentTermsDays: Number(newSupplierTerms) || 30,
        defaultExpenseAccountId: accounts[0]?.id ?? null,
        defaultTaxCodeId: defaultTax || null,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not create supplier.");
        return;
      }
      const created = result.supplier as Supplier;
      setSuppliers((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSupplierId(created.id);
      setShowNewSupplier(false);
      setNewSupplierName("");
      setNewSupplierTrn("");
      toast.saved("Supplier created.");
    });
  }

  function save(allowDuplicate = dupAccepted) {
    if (!canEdit) {
      toast.error("You do not have permission to edit invoices.");
      return;
    }
    if (!entity) {
      toast.error("This venue is not mapped to a legal entity.");
      return;
    }
    if (isDeliveryNote && !deliveryNoteNo.trim()) {
      toast.error("Delivery note number is required.");
      return;
    }
    if (!supplierInvoiceNo.trim() && !isDeliveryNote) {
      toast.error("Invoice number is required.");
      return;
    }
    if (!invoiceDate) {
      toast.error("Invoice date is required.");
      return;
    }
    const hasLine = lines.some(
      (l, idx) => l.accountId && (lineAmounts[idx]?.net ?? 0) > 0,
    );
    if (!hasLine) {
      toast.error("Add at least one line with an account and amount.");
      return;
    }

    const fd = new FormData();
    if (invoice?.id) fd.set("id", invoice.id);
    fd.set("documentType", documentType);
    fd.set("supplierId", supplierId);
    fd.set("supplierInvoiceNo", supplierInvoiceNo);
    if (isDeliveryNote) fd.set("deliveryNoteNo", deliveryNoteNo);
    fd.set("invoiceDate", invoiceDate);
    fd.set("dueDate", dueDate);
    fd.set("currency", currency || "AED");
    if (currency.toUpperCase() !== "AED") fd.set("fxRate", fxRate);
    fd.set("memo", memo);
    fd.set("lines", JSON.stringify(lineInputs));
    if (allowDuplicate) fd.set("allowDuplicate", "1");
    if (attachment) fd.set("attachment", attachment);

    startTransition(async () => {
      const result = await saveApInvoiceForm(fd);
      if (!result.ok) {
        const duplicates = (result as { duplicates?: ApDuplicateDoc[] }).duplicates;
        if (duplicates?.length) {
          setDupMatches(duplicates);
          setDupDialog({ fromSave: true });
          return;
        }
        toast.error(result.error ?? "Save failed.");
        return;
      }
      toast.saved(`Saved and posted ${result.invoiceNo}.`);
      router.push(toScopedHref(`/accounting/invoices/${result.id}`, scope, slug));
      router.refresh();
    });
  }

  const supplierOptions = suppliers.map((s) => {
    const nickname = s.nickname || "—";
    const category = supplierKindPickerLabel(s.kind);
    return {
      value: s.id,
      label: `${nickname} | ${s.name} | ${category}`,
      dropdownLabel: (
        <span className="min-w-0">
          <span className="underline underline-offset-2">{nickname}</span>
          <span className="mx-1.5 text-black/30">|</span>
          <span>{s.name}</span>
          <span className="mx-1.5 text-black/30">|</span>
          <span className="font-bold text-[#3D421F]">{category}</span>
        </span>
      ),
      searchText: `${s.nickname ?? ""} ${s.name} ${s.trn ?? ""} ${category}`,
    };
  });
  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
  }));
  const taxOptions = taxCodes.map((t) => {
    let percentage = "—";
    try {
      percentage = `${resolveTaxRate(taxRates, t.id, invoiceDate) * 100}%`;
    } catch {
      // Keep the code selectable even when no rate is configured for this date.
    }
    return {
      value: t.id,
      label: `${t.code} ${percentage}`,
      searchText: t.label,
    };
  });

  const fieldClass = "space-y-1.5";
  const selectClass =
    "flex h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]";

  return (
    <div>
      <div className="space-y-5">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-[#3D421F]">
          <span className="font-semibold">{venue.name}</span>
          <span className="text-black/30">·</span>
          {entity ? (
            <span className="text-black/60">
              {entity.entity_code} — {entity.name}
            </span>
          ) : (
            <span className="text-amber-700">
              Entity not mapped — configure Accounting Settings
            </span>
          )}
        </p>

        <div className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-4 sm:flex-row">
          <fieldset
            className="shrink-0 space-y-2 sm:w-40 sm:border-r sm:border-black/10 sm:pr-4"
            disabled={!canEdit}
          >
            <legend className="mb-2 text-sm font-medium text-[#3D421F]">
              Document
            </legend>
            {(Object.keys(AP_DOCUMENT_TYPE_LABELS) as ApDocumentType[]).map(
              (type) => (
                <label
                  key={type}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                    documentType === type
                      ? type === "credit_note"
                        ? "bg-red-50 font-medium text-red-800"
                        : "bg-[var(--venue-secondary,#F0F3DD)] font-medium text-[#3D421F]"
                      : "text-black/60 hover:bg-black/[0.03]"
                  }`}
                >
                  <input
                    type="radio"
                    name="document-type"
                    value={type}
                    checked={documentType === type}
                    onChange={() => {
                      setDocumentType(type);
                      onReferenceChange();
                    }}
                    className="size-4 accent-[var(--venue-primary,#818a40)]"
                  />
                  {AP_DOCUMENT_TYPE_LABELS[type]}
                </label>
              ),
            )}
            {documentType === "credit_note" ? (
              <p className="px-2 text-[11px] leading-snug text-red-700">
                Line amounts are recorded as negatives.
              </p>
            ) : null}
          </fieldset>
          <div className="min-w-0 flex-1 space-y-4">
            <div
              className={`grid gap-4 sm:grid-cols-2 ${isDeliveryNote ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
            >
              <div className={fieldClass}>
                <Label>Supplier</Label>
                <div className="relative">
                  <SearchableSelect
                    value={supplierId}
                    onChange={(v) => {
                      setSupplierId(v);
                      onReferenceChange();
                    }}
                    options={supplierOptions}
                    placeholder="Select supplier…"
                    disabled={!canEdit}
                    triggerClassName="pr-16"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      className="absolute right-8 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-black/35 transition hover:bg-black/5 hover:text-[var(--venue-primary)]"
                      onClick={() => setShowNewSupplier((v) => !v)}
                      aria-label={showNewSupplier ? "Cancel new supplier" : "New supplier"}
                      title={showNewSupplier ? "Cancel new supplier" : "New supplier"}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {isDeliveryNote ? (
                <div className={fieldClass}>
                  <Label htmlFor="delivery-note-no">Delivery note no</Label>
                  <Input
                    id="delivery-note-no"
                    value={deliveryNoteNo}
                    onChange={(e) => {
                      setDeliveryNoteNo(e.target.value);
                      onReferenceChange();
                    }}
                    onBlur={checkDuplicates}
                    disabled={!canEdit}
                    className="h-10"
                  />
                </div>
              ) : null}
              <div className={fieldClass}>
                <Label htmlFor="supplier-inv-no">
                  {isDeliveryNote ? (
                    <>
                      Invoice no{" "}
                      <span className="font-normal text-black/45">
                        (can be added later)
                      </span>
                    </>
                  ) : (
                    <>Supplier {docLabel} no</>
                  )}
                </Label>
                <Input
                  id="supplier-inv-no"
                  value={supplierInvoiceNo}
                  onChange={(e) => {
                    setSupplierInvoiceNo(e.target.value);
                    onReferenceChange();
                  }}
                  onBlur={checkDuplicates}
                  disabled={!canEdit}
                  className="h-10"
                />
                {dupMatches.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDupDialog({ fromSave: false })}
                    className="text-left text-xs text-amber-700 underline-offset-2 hover:underline"
                  >
                    {dupAccepted ? "Duplicate kept — " : "Already used on "}
                    {dupMatches.length} document{dupMatches.length === 1 ? "" : "s"} · view
                  </button>
                )}
              </div>
              <div className={fieldClass}>
                <Label>Invoice date</Label>
                <DateInput
                  value={invoiceDate}
                  onChange={setInvoiceDate}
                  disabled={!canEdit}
                  className="w-full"
                />
              </div>
              <div className={fieldClass}>
                <Label>Due date</Label>
                <DateInput
                  value={dueDate}
                  onChange={(v) => {
                    setDueManual(true);
                    setDueDate(v);
                  }}
                  disabled={!canEdit}
                  className="w-full"
                />
              </div>
              <div className={`${fieldClass} sm:col-span-2 lg:col-span-4`}>
                <Label htmlFor="attachment">
                  Attachment {invoice?.attachment_url ? "(replace)" : "(optional)"}
                </Label>
                <Input
                  id="attachment"
                  type="file"
                  accept="application/pdf,image/*"
                  disabled={!canEdit}
                  className="h-10"
                  onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                />
                {invoice?.attachment_url && !attachment && (
                  <a
                    href={invoice.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[var(--venue-primary)] underline"
                  >
                    View existing attachment
                  </a>
                )}
              </div>
            </div>

            {showNewSupplier && (
              <div className="grid gap-3 rounded-md border border-dashed border-black/15 bg-black/[0.02] p-3 sm:grid-cols-4">
                <div className={`${fieldClass} sm:col-span-2`}>
                  <Label>Name</Label>
                  <Input
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className={fieldClass}>
                  <Label>TRN</Label>
                  <Input
                    value={newSupplierTrn}
                    onChange={(e) => setNewSupplierTrn(e.target.value)}
                    className="h-10"
                    placeholder="15 digits"
                  />
                </div>
                <div className={fieldClass}>
                  <Label>Terms (days)</Label>
                  <Input
                    value={newSupplierTerms}
                    onChange={(e) => setNewSupplierTerms(e.target.value)}
                    className="h-10"
                    type="number"
                    min={0}
                  />
                </div>
                <div className="sm:col-span-4">
                  <Button type="button" size="sm" disabled={pending} onClick={createSupplier}>
                    Add supplier
                  </Button>
                </div>
              </div>
            )}

        
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-black/10 bg-white p-4">
          <h2 className="font-serif text-lg text-[#3D421F]">Lines</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-black/45">
                <tr>
                  <th className="px-2 py-2 text-left">Memo</th>
                  <th className="px-2 py-2 text-left">Account</th>
                  <th className="px-2 py-2 text-left">Currency</th>
                  <th className="px-2 py-2 text-right">Net</th>
                  <th className="px-2 py-2 text-left">Tax</th>
                  <th className="px-2 py-2 text-right">VAT</th>
                  <th className="px-2 py-2 text-right">Gross</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => {
                  const amt = lineAmounts[idx];
                  return (
                    <tr key={line.key} className="border-t border-black/5 align-top">
                      <td className="px-2 py-2 min-w-[160px]">
                        <Input
                          value={line.description}
                          onChange={(e) =>
                            updateLine(line.key, { description: e.target.value })
                          }
                          disabled={!canEdit}
                          className="h-9"
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[220px]">
                        <SearchableSelect
                          value={line.accountId}
                          onChange={(v) => updateLine(line.key, { accountId: v })}
                          options={accountOptions}
                          placeholder="Account…"
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="w-28 px-2 py-2">
                        <select
                          aria-label="Currency"
                          className={`${selectClass} h-9`}
                          value={currency}
                          disabled={!canEdit}
                          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                        >
                          <option value="AED">AED</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                        </select>
                        {currency.toUpperCase() !== "AED" && (
                          <Input
                            aria-label="FX rate to AED"
                            value={fxRate}
                            onChange={(e) => setFxRate(e.target.value)}
                            disabled={!canEdit}
                            className="mt-2 h-9"
                            type="number"
                            step="0.00000001"
                            min="0"
                            placeholder="FX → AED"
                          />
                        )}
                      </td>
                      <td className="w-36 px-2 py-2">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-black/45">
                            {currency}
                          </span>
                          <Input
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateLine(line.key, {
                                quantity: "1",
                                unitPrice: e.target.value,
                              })
                            }
                            disabled={!canEdit}
                            className="h-9 pl-11 text-right"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            aria-label="Net amount"
                          />
                        </div>
                      </td>
                      <td className="w-32 px-2 py-2">
                        <SearchableSelect
                          value={line.taxCodeId}
                          onChange={(v) => updateLine(line.key, { taxCodeId: v })}
                          options={taxOptions}
                          placeholder="Tax…"
                          disabled={!canEdit}
                          clearable={false}
                          triggerClassName="h-9"
                        />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-black/70">
                        {formatAedAccounting(signed(amt?.tax ?? 0))}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {formatAedAccounting(signed(amt?.gross ?? 0))}
                      </td>
                      <td className="px-2 py-2">
                        {canEdit && lines.length > 1 && (
                          <button
                            type="button"
                            className="rounded p-1.5 text-black/40 hover:bg-black/5 hover:text-red-700"
                            onClick={() => removeLine(line.key)}
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {canEdit && (
                  <tr>
                    <td />
                    <td className="px-2 pb-1 pt-1" colSpan={7}>
                      <Button type="button" size="sm" variant="secondary" onClick={addLine}>
                        <Plus className="h-4 w-4" />
                        Add line
                      </Button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-baseline justify-end gap-x-8 gap-y-1 rounded-lg bg-black/[0.05] px-4 py-3 text-base">
            <div>
              <span className="text-black/45">Net </span>
              <span className="font-medium tabular-nums">
                {formatAedAccounting(signed(totals.net))}
              </span>
            </div>
            <div>
              <span className="text-black/45">VAT </span>
              <span className="font-medium tabular-nums">
                {formatAedAccounting(signed(totals.tax))}
              </span>
            </div>
            <div>
              <span className="text-black/45">Gross </span>
              <span className="text-lg font-semibold tabular-nums text-[#3D421F]">
                {formatAedAccounting(signed(totals.gross))}
              </span>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-xs text-black/50">
              {invoice?.status === "posted"
                ? "Saving reverses the posted journal and posts the corrected document."
                : "Saving posts this document to the ledger."}
            </p>
            <Button type="button" disabled={pending} onClick={() => save()}>
              {pending ? "Saving…" : invoice ? "Save changes" : "Save & post"}
            </Button>
          </div>
        )}
      </div>

      <ApDuplicateDialog
        open={dupDialog != null && dupMatches.length > 0}
        docs={dupMatches}
        supplierName={selectedSupplier?.name ?? "This supplier"}
        number={
          [supplierInvoiceNo.trim(), isDeliveryNote ? deliveryNoteNo.trim() : ""]
            .filter(Boolean)
            .join(" / ")
        }
        keepLabel={dupDialog?.fromSave ? "Keep both & save" : "Keep both"}
        pending={pending}
        hrefFor={(id) => toScopedHref(`/accounting/invoices/${id}`, scope, slug)}
        onChangeNumber={() => {
          setDupDialog(null);
          document.getElementById("supplier-inv-no")?.focus();
        }}
        onKeepBoth={() => {
          const fromSave = dupDialog?.fromSave;
          setDupAccepted(true);
          setDupDialog(null);
          if (fromSave) save(true);
        }}
      />
    </div>
  );
}
