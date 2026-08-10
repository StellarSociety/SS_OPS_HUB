"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/components/ui/toast";
import { upsertSupplier } from "@/lib/actions/accounting-ap";
import type { Supplier, TaxCode } from "@/lib/accounting/ap-types";
import type { Account } from "@/lib/accounting/types";
import { cn } from "@/lib/utils";

type Props = {
  suppliers: Supplier[];
  accounts: Account[];
  taxCodes: TaxCode[];
  canEdit: boolean;
};

type FormState = {
  id?: string;
  name: string;
  trn: string;
  defaultExpenseAccountId: string;
  defaultTaxCodeId: string;
  paymentTermsDays: string;
  active: boolean;
  notes: string;
};

const emptyForm = (): FormState => ({
  name: "",
  trn: "",
  defaultExpenseAccountId: "",
  defaultTaxCodeId: "",
  paymentTermsDays: "30",
  active: true,
  notes: "",
});

export function ApSuppliersTable({
  suppliers,
  accounts,
  taxCodes,
  canEdit,
}: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.trn ?? "").includes(q) ||
        (s.notes ?? "").toLowerCase().includes(q),
    );
  }, [suppliers, search]);

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.code} · ${a.name}`,
  }));
  const taxOptions = taxCodes.map((t) => ({
    value: t.id,
    label: `${t.code} · ${t.label}`,
  }));

  function openCreate() {
    setForm(emptyForm());
    setOpen(true);
  }

  function openEdit(s: Supplier) {
    setForm({
      id: s.id,
      name: s.name,
      trn: s.trn ?? "",
      defaultExpenseAccountId: s.default_expense_account_id ?? "",
      defaultTaxCodeId: s.default_tax_code_id ?? "",
      paymentTermsDays: String(s.payment_terms_days ?? 30),
      active: s.active,
      notes: s.notes ?? "",
    });
    setOpen(true);
  }

  function save() {
    startTransition(async () => {
      const result = await upsertSupplier({
        id: form.id,
        name: form.name,
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
      toast.saved(form.id ? "Supplier updated." : "Supplier created.");
      setOpen(false);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search suppliers…"
          className="max-w-sm"
        />
        {canEdit ? (
          <Button type="button" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New supplier
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">TRN</th>
              <th className="px-3 py-2.5 font-medium">Terms</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-black/45">
                  {suppliers.length === 0
                    ? "No suppliers yet."
                    : "No suppliers match your search."}
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="border-t border-black/5">
                  <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                    {s.name}
                  </td>
                  <td className="px-3 py-2.5 text-black/60">{s.trn || "—"}</td>
                  <td className="px-3 py-2.5 text-black/60">
                    {s.payment_terms_days} days
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
              {form.id ? "Edit supplier" : "New supplier"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="sup-name">Name</Label>
                <Input
                  id="sup-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
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
