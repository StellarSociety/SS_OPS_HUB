"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { UniformSupplierDialog } from "@/components/hr/uniform-supplier-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { deleteUniformSupplier } from "@/lib/actions/hr-uniform-suppliers";
import type { UniformSupplierRow } from "@/lib/hr/types";

type UniformSuppliersTableProps = {
  suppliers: UniformSupplierRow[];
  canManage?: boolean;
};

export function UniformSuppliersTable({
  suppliers,
  canManage = false,
}: UniformSuppliersTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<UniformSupplierRow | null>(
    null,
  );
  const [actionId, setActionId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (supplier) =>
        supplier.name.toLowerCase().includes(q) ||
        supplier.orders_email.toLowerCase().includes(q) ||
        supplier.contact_person.toLowerCase().includes(q) ||
        supplier.contact_phone.toLowerCase().includes(q) ||
        supplier.notes.toLowerCase().includes(q),
    );
  }, [suppliers, search]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleDelete(supplier: UniformSupplierRow) {
    if (
      !window.confirm(
        `Delete "${supplier.name}" from suppliers? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionId(supplier.id);
    startTransition(async () => {
      try {
        await deleteUniformSupplier({ supplierId: supplier.id });
        toast.saved("Supplier deleted.");
        refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not delete supplier.",
        );
      } finally {
        setActionId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers…"
            className="pl-9"
          />
        </div>
        {canManage ? (
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4" />
            Add supplier
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              {suppliers.length === 0
                ? "No suppliers in the catalog yet."
                : "No suppliers match your search."}
            </p>
            {canManage && suppliers.length === 0 ? (
              <Button onClick={() => setCreateOpen(true)} className="mt-2">
                Add first supplier
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white/70">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-black/10 bg-black/[0.02] text-left text-xs uppercase tracking-wide text-black/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Orders email</th>
                  <th className="px-4 py-3 font-medium">Contact person</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  {canManage ? (
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map((supplier) => {
                  const busy = pending && actionId === supplier.id;
                  return (
                    <tr key={supplier.id} className="text-[#3D421F]">
                      <td className="px-4 py-3 font-medium">{supplier.name}</td>
                      <td className="px-4 py-3 text-black/65">
                        {supplier.orders_email || "—"}
                      </td>
                      <td className="px-4 py-3 text-black/65">
                        {supplier.contact_person || "—"}
                      </td>
                      <td className="px-4 py-3 text-black/65">
                        {supplier.contact_phone || "—"}
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditSupplier(supplier)}
                              className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
                              aria-label={`Edit ${supplier.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDelete(supplier)}
                              className="rounded-md p-1.5 text-black/45 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                              aria-label={`Delete ${supplier.name}`}
                            >
                              {busy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <UniformSupplierDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          refresh();
        }}
      />

      <UniformSupplierDialog
        open={Boolean(editSupplier)}
        supplier={editSupplier}
        onClose={() => {
          setEditSupplier(null);
          refresh();
        }}
      />
    </div>
  );
}
