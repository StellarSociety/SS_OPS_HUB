"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ChevronsUpDown, Pencil, Plus } from "lucide-react";
import { SuppliersSubNav } from "@/components/accounting/suppliers-sub-nav";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/components/ui/toast";
import { upsertSupplier } from "@/lib/actions/accounting-ap";
import {
  isSupplierKind,
  supplierKindHref,
  SUPPLIER_KIND_OPTIONS,
  type Supplier,
  type SupplierKind,
  type TaxCode,
} from "@/lib/accounting/ap-types";
import type { Account } from "@/lib/accounting/types";
import { toScopedHref } from "@/lib/venue/scope-routing";
import { cn } from "@/lib/utils";

type Props = {
  kind: SupplierKind;
  suppliers: Supplier[];
  accounts: Account[];
  taxCodes: TaxCode[];
  canEdit: boolean;
};

type FormState = {
  id?: string;
  nickname: string;
  name: string;
  kind: SupplierKind;
  trn: string;
  defaultExpenseAccountId: string;
  defaultTaxCodeId: string;
  paymentTermsDays: string;
  active: boolean;
  notes: string;
};

function standardPurchaseTaxId(taxCodes: TaxCode[]) {
  return taxCodes.find((tax) => tax.code.toUpperCase() === "SP")?.id ?? "";
}

function accountLabel(accounts: Account[], id: string | null) {
  const account = accounts.find((item) => item.id === id);
  if (!account) return "—";
  return `${account.code} · ${account.name}`;
}

type SupplierSortKey =
  | "nickname"
  | "name"
  | "list"
  | "terms"
  | "account"
  | "status";

type SortDir = "asc" | "desc";

function compareText(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function supplierSortValue(
  supplier: Supplier,
  key: SupplierSortKey,
  accounts: Account[],
) {
  switch (key) {
    case "nickname":
      return supplier.nickname ?? "";
    case "name":
      return supplier.name;
    case "list":
      return (
        SUPPLIER_KIND_OPTIONS.find((option) => option.kind === supplier.kind)
          ?.label ?? supplier.kind
      );
    case "terms":
      return supplier.payment_terms_days;
    case "account": {
      const label = accountLabel(accounts, supplier.default_expense_account_id);
      return label === "—" ? "" : label;
    }
    case "status":
      return supplier.active ? "Active" : "Inactive";
  }
}

function SortLabel({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKey: SupplierSortKey;
  activeKey: SupplierSortKey | null;
  sortDir: SortDir;
  onSort: (key: SupplierSortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide transition-colors hover:text-[#3D421F]"
      aria-label={`Sort by ${label}`}
    >
      <span>{label}</span>
      {active ? (
        sortDir === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-black/25" />
      )}
    </button>
  );
}

function emptyForm(taxCodes: TaxCode[], kind: SupplierKind): FormState {
  return {
    nickname: "",
    name: "",
    kind,
    trn: "",
    defaultExpenseAccountId: "",
    defaultTaxCodeId: standardPurchaseTaxId(taxCodes),
    paymentTermsDays: "30",
    active: true,
    notes: "",
  };
}

export function ApSuppliersTable({
  kind,
  suppliers,
  accounts,
  taxCodes,
  canEdit,
}: Props) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const kindMeta =
    SUPPLIER_KIND_OPTIONS.find((option) => option.kind === kind) ??
    SUPPLIER_KIND_OPTIONS[0];
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SupplierSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(taxCodes, kind));
  const listOptions = SUPPLIER_KIND_OPTIONS.map((option) => ({
    value: option.kind,
    label: option.label,
  }));
  const [pending, startTransition] = useTransition();

  const searching = search.trim().length > 0;
  const kindSuppliers = useMemo(
    () => suppliers.filter((s) => s.kind === kind),
    [suppliers, kind],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = searching
      ? suppliers
      : kindSuppliers;
    if (!q) return pool;
    return pool.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.nickname ?? "").toLowerCase().includes(q) ||
        (s.trn ?? "").includes(q) ||
        (s.notes ?? "").toLowerCase().includes(q) ||
        (SUPPLIER_KIND_OPTIONS.find((option) => option.kind === s.kind)?.label ?? "")
          .toLowerCase()
          .includes(q),
    );
  }, [suppliers, kindSuppliers, search, searching]);

  const rows = useMemo(() => {
    if (!sortKey) return filtered;
    const direction = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = supplierSortValue(a, sortKey, accounts);
      const right = supplierSortValue(b, sortKey, accounts);
      const leftEmpty = left === "";
      const rightEmpty = right === "";
      if (leftEmpty && rightEmpty) return compareText(a.name, b.name);
      if (leftEmpty) return 1;
      if (rightEmpty) return -1;
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction;
      }
      const byText = compareText(String(left), String(right));
      if (byText !== 0) return byText * direction;
      return compareText(a.name, b.name);
    });
  }, [filtered, sortKey, sortDir, accounts]);

  const colCount = searching ? 7 : 6;

  function toggleSort(key: SupplierSortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.code} · ${a.name}`,
  }));
  const taxOptions = taxCodes.map((t) => ({
    value: t.id,
    label: `${t.code} · ${t.label}`,
  }));

  function openCreate() {
    setForm(emptyForm(taxCodes, kind));
    setOpen(true);
  }

  function openEdit(s: Supplier) {
    setForm({
      id: s.id,
      nickname: s.nickname ?? "",
      name: s.name,
      kind: s.kind,
      trn: s.trn ?? "",
      defaultExpenseAccountId: s.default_expense_account_id ?? "",
      defaultTaxCodeId: s.default_tax_code_id || standardPurchaseTaxId(taxCodes),
      paymentTermsDays: String(s.payment_terms_days ?? 30),
      active: s.active,
      notes: s.notes ?? "",
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function save() {
    startTransition(async () => {
      const result = await upsertSupplier({
        id: form.id,
        nickname: form.nickname,
        name: form.name,
        kind: form.kind,
        trn: form.trn || null,
        defaultExpenseAccountId: form.defaultExpenseAccountId || null,
        defaultTaxCodeId: form.defaultTaxCodeId || null,
        paymentTermsDays: Number(form.paymentTermsDays) || 30,
        active: form.active,
        notes: form.notes || null,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Save failed.");
        return;
      }
      toast.saved(
        form.kind !== kind
          ? "Supplier moved."
          : form.id
            ? "Supplier updated."
            : "Supplier created.",
      );
      setOpen(false);
      if (form.kind !== kind) {
        router.push(toScopedHref(supplierKindHref(form.kind), scope, slug));
      }
    });
  }

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search all suppliers…"
        className="max-w-sm"
      />

      <SuppliersSubNav
        trailing={
          canEdit ? (
            <Button type="button" onClick={openCreate} className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" />
              {kindMeta.createLabel}
            </Button>
          ) : null
        }
      />

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel
                  label="Nickname"
                  sortKey="nickname"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel
                  label="Company name"
                  sortKey="name"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>
              {searching ? (
                <th className="px-3 py-2.5 font-medium">
                  <SortLabel
                    label="List"
                    sortKey="list"
                    activeKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                </th>
              ) : null}
              <th className="px-3 py-2.5 font-medium">
                <SortLabel
                  label="Default account"
                  sortKey="account"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel
                  label="Status"
                  sortKey="status"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>
              <th className="px-3 py-2.5 font-medium">
                <SortLabel
                  label="Terms"
                  sortKey="terms"
                  activeKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>
              <th className="px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-3 py-8 text-center text-black/45"
                >
                  {searching
                    ? "No suppliers match your search."
                    : kindSuppliers.length === 0
                      ? kindMeta.empty
                      : "No suppliers match your search."}
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="border-t border-black/5">
                  <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                    {s.nickname || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[#3D421F]">{s.name}</td>
                  {searching ? (
                    <td className="px-3 py-2.5 text-black/60">
                      {SUPPLIER_KIND_OPTIONS.find(
                        (option) => option.kind === s.kind,
                      )?.shortLabel ?? s.kind}
                    </td>
                  ) : null}
                  <td className="px-3 py-2.5 text-black/70">
                    {accountLabel(accounts, s.default_expense_account_id)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        s.active
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-black/5 text-black/55",
                      )}
                    >
                      {s.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-black/60">
                    {s.payment_terms_days} days
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="inline-flex items-center gap-1 text-sm text-[var(--venue-primary)] hover:underline"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg space-y-4 rounded-xl border border-black/10 bg-white p-5 shadow-xl"
          >
            <h2 className="font-serif text-xl text-[#3D421F]">
              {form.id ? kindMeta.editLabel : kindMeta.createLabel}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="sup-nickname">Nickname</Label>
                <Input
                  id="sup-nickname"
                  value={form.nickname}
                  onChange={(e) =>
                    setForm({ ...form, nickname: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="sup-name">Company name & designation</Label>
                <Input
                  id="sup-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>List</Label>
                <SearchableSelect
                  value={form.kind}
                  onChange={(value) => {
                    if (isSupplierKind(value)) setForm({ ...form, kind: value });
                  }}
                  options={listOptions}
                  placeholder="Select list…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-trn">TRN</Label>
                <Input
                  id="sup-trn"
                  value={form.trn}
                  onChange={(e) => setForm({ ...form, trn: e.target.value })}
                  placeholder="15 digits"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-terms">Payment terms (days)</Label>
                <Input
                  id="sup-terms"
                  type="number"
                  min={0}
                  value={form.paymentTermsDays}
                  onChange={(e) =>
                    setForm({ ...form, paymentTermsDays: e.target.value })
                  }
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Default expense account</Label>
                <SearchableSelect
                  value={form.defaultExpenseAccountId}
                  onChange={(v) =>
                    setForm({ ...form, defaultExpenseAccountId: v })
                  }
                  options={accountOptions}
                  placeholder="Select account…"
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Default tax code</Label>
                <SearchableSelect
                  value={form.defaultTaxCodeId}
                  onChange={(v) => setForm({ ...form, defaultTaxCodeId: v })}
                  options={taxOptions}
                  placeholder="Select tax code…"
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="sup-notes">Notes</Label>
                <Input
                  id="sup-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-[#3D421F]">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />
                Active
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="border border-black/10"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
