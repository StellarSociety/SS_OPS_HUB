"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/components/ui/toast";
import {
  checkSupplierInvoiceDuplicate,
  previewApJournal,
  saveApInvoiceForm,
  upsertSupplier,
} from "@/lib/actions/accounting-ap";
import type {
  ApInvoice,
  ApInvoiceLineInput,
  Supplier,
  TaxCode,
  TaxRate,
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

type PreviewLine = {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
  account?: { id: string; code: string; name: string } | null;
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
  const [memo, setMemo] = useState(invoice?.memo ?? "");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
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
        quantity: String(l.quantity),
        unitPrice: String(l.unit_price),
        taxCodeId: l.tax_code_id,
      }));
    }
    return [emptyLine({ taxCodeId: defaultTax })];
  });

  const [preview, setPreview] = useState<{
    lines: PreviewLine[];
    subtotalNet: number;
    taxTotal: number;
    totalGross: number;
  } | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      const valid = lineInputs.filter((l) => l.accountId && l.taxCodeId);
      if (!valid.length || !invoiceDate) {
        setPreview(null);
        return;
      }
      const result = await previewApJournal({
        invoiceDate,
        memo: memo || undefined,
        supplierId: supplierId || undefined,
        lines: valid,
      });
      if (result.ok) {
        setPreview({
          lines: result.lines as PreviewLine[],
          subtotalNet: result.subtotalNet,
          taxTotal: result.taxTotal,
          totalGross: result.totalGross,
        });
      }
    }, 400);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [lineInputs, invoiceDate, memo, supplierId]);

  async function onSupplierInvoiceBlur() {
    if (!supplierId || !supplierInvoiceNo.trim()) {
      setDupWarning(null);
      return;
    }
    const result = await checkSupplierInvoiceDuplicate({
      supplierId,
      supplierInvoiceNo,
      excludeId: invoice?.id,
    });
    if (result.ok && result.duplicate) {
      setDupWarning(
        `Duplicate — already exists as ${result.existing?.invoice_no ?? "another invoice"}.`,
      );
    } else {
      setDupWarning(null);
    }
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

  function save(submit: boolean) {
    if (!canEdit) {
      toast.error("You do not have permission to edit invoices.");
      return;
    }
    if (!entity) {
      toast.error("This venue is not mapped to a legal entity.");
      return;
    }
    if (dupWarning) {
      toast.error(dupWarning);
      return;
    }
    if (submit && !attachment && !invoice?.attachment_url) {
      toast.error("Attachment is required to submit for approval.");
      return;
    }

    const fd = new FormData();
    if (invoice?.id) fd.set("id", invoice.id);
    fd.set("supplierId", supplierId);
    fd.set("supplierInvoiceNo", supplierInvoiceNo);
    fd.set("invoiceDate", invoiceDate);
    fd.set("dueDate", dueDate);
    fd.set("currency", currency || "AED");
    if (currency.toUpperCase() !== "AED") fd.set("fxRate", fxRate);
    fd.set("memo", memo);
    fd.set("lines", JSON.stringify(lineInputs));
    fd.set("submit", submit ? "1" : "0");
    if (attachment) fd.set("attachment", attachment);

    startTransition(async () => {
      const result = await saveApInvoiceForm(fd);
      if (!result.ok) {
        toast.error(result.error ?? "Save failed.");
        return;
      }
      toast.saved(
        submit
          ? `Submitted ${result.invoiceNo}.`
          : `Saved draft ${result.invoiceNo}.`,
      );
      router.push(toScopedHref(`/accounting/invoices/${result.id}`, scope, slug));
      router.refresh();
    });
  }

  const supplierOptions = suppliers.map((s) => ({
    value: s.id,
    label: s.name,
    searchText: s.trn ?? "",
  }));
  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.code} — ${a.name}`,
  }));
  const taxOptions = taxCodes.map((t) => ({
    value: t.id,
    label: `${t.code} — ${t.label}`,
  }));

  const fieldClass = "space-y-1.5";
  const selectClass =
    "flex h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={fieldClass}>
              <Label>Venue</Label>
              <Input value={venue.name} disabled className="h-10" />
            </div>
            <div className={fieldClass}>
              <Label>Legal entity</Label>
              <Input
                value={
                  entity
                    ? `${entity.entity_code} — ${entity.name}`
                    : "Not mapped — configure Accounting Settings"
                }
                disabled
                className="h-10"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-black/10 bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={fieldClass}>
              <Label>Supplier</Label>
              <SearchableSelect
                value={supplierId}
                onChange={setSupplierId}
                options={supplierOptions}
                placeholder="Select supplier…"
                disabled={!canEdit}
              />
              {canEdit && (
                <button
                  type="button"
                  className="mt-1 text-xs text-[var(--venue-primary)] underline"
                  onClick={() => setShowNewSupplier((v) => !v)}
                >
                  {showNewSupplier ? "Cancel new supplier" : "New supplier"}
                </button>
              )}
            </div>
            <div className={fieldClass}>
              <Label htmlFor="supplier-inv-no">Supplier invoice no</Label>
              <Input
                id="supplier-inv-no"
                value={supplierInvoiceNo}
                onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                onBlur={onSupplierInvoiceBlur}
                disabled={!canEdit}
                className="h-10"
              />
              {dupWarning && (
                <p className="text-xs text-red-700">{dupWarning}</p>
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className={fieldClass}>
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                className={selectClass}
                value={currency}
                disabled={!canEdit}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              >
                <option value="AED">AED</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            {currency.toUpperCase() !== "AED" && (
              <div className={fieldClass}>
                <Label htmlFor="fx-rate">FX rate → AED</Label>
                <Input
                  id="fx-rate"
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  disabled={!canEdit}
                  className="h-10"
                  type="number"
                  step="0.00000001"
                  min="0"
                />
              </div>
            )}
          </div>

          <div className={fieldClass}>
            <Label htmlFor="memo">Memo</Label>
            <Input
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              disabled={!canEdit}
              className="h-10"
            />
          </div>

          <div className={fieldClass}>
            <Label htmlFor="attachment">
              Attachment {invoice?.attachment_url ? "(replace)" : "(required to submit)"}
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

        <div className="space-y-3 rounded-lg border border-black/10 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg text-[#3D421F]">Lines</h2>
            {canEdit && (
              <Button type="button" size="sm" variant="secondary" onClick={addLine}>
                <Plus className="h-4 w-4" />
                Add line
              </Button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-black/45">
                <tr>
                  <th className="px-2 py-2 text-left">Description</th>
                  <th className="px-2 py-2 text-left">Account</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Unit</th>
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
                      <td className="px-2 py-2 w-20">
                        <Input
                          value={line.quantity}
                          onChange={(e) =>
                            updateLine(line.key, { quantity: e.target.value })
                          }
                          disabled={!canEdit}
                          className="h-9 text-right"
                          type="number"
                          step="0.001"
                        />
                      </td>
                      <td className="px-2 py-2 w-28">
                        <Input
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(line.key, { unitPrice: e.target.value })
                          }
                          disabled={!canEdit}
                          className="h-9 text-right"
                          type="number"
                          step="0.001"
                        />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-black/70">
                        {formatAedAccounting(amt?.net ?? 0)}
                      </td>
                      <td className="px-2 py-2 min-w-[140px]">
                        <SearchableSelect
                          value={line.taxCodeId}
                          onChange={(v) => updateLine(line.key, { taxCodeId: v })}
                          options={taxOptions}
                          placeholder="Tax…"
                          disabled={!canEdit}
                          clearable={false}
                        />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-black/70">
                        {formatAedAccounting(amt?.tax ?? 0)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {formatAedAccounting(amt?.gross ?? 0)}
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
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-6 border-t border-black/10 pt-3 text-sm">
            <div>
              <span className="text-black/45">Net </span>
              <span className="font-medium tabular-nums">
                {formatAedAccounting(totals.net)}
              </span>
            </div>
            <div>
              <span className="text-black/45">VAT </span>
              <span className="font-medium tabular-nums">
                {formatAedAccounting(totals.tax)}
              </span>
            </div>
            <div>
              <span className="text-black/45">Gross </span>
              <span className="font-semibold tabular-nums text-[#3D421F]">
                {formatAedAccounting(totals.gross)}
              </span>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={pending} onClick={() => save(false)}>
              Save draft
            </Button>
            <Button type="button" disabled={pending} onClick={() => save(true)}>
              Submit for approval
            </Button>
          </div>
        )}
      </div>

      <aside className="h-fit space-y-3 rounded-lg border border-black/10 bg-white p-4 lg:sticky lg:top-4">
        <h2 className="font-serif text-lg text-[#3D421F]">Journal preview</h2>
        {!preview?.lines?.length ? (
          <p className="text-sm text-black/45">
            Add lines with account and tax code to preview the posting.
          </p>
        ) : (
          <>
            <table className="w-full text-xs">
              <thead className="text-black/45">
                <tr>
                  <th className="py-1 text-left">Account</th>
                  <th className="py-1 text-right">Dr</th>
                  <th className="py-1 text-right">Cr</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l, i) => (
                  <tr key={`${l.accountId}-${i}`} className="border-t border-black/5">
                    <td className="py-1.5 pr-2">
                      {l.account
                        ? `${l.account.code} ${l.account.name}`
                        : l.description || l.accountId.slice(0, 8)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {l.debit ? formatAedAccounting(l.debit) : ""}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {l.credit ? formatAedAccounting(l.credit) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-black/45">
              Totals: {formatAedAccounting(preview.subtotalNet)} net ·{" "}
              {formatAedAccounting(preview.taxTotal)} VAT ·{" "}
              {formatAedAccounting(preview.totalGross)} gross
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
