"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Search, Shirt, Trash2, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { UniformPieceDialog } from "@/components/hr/uniform-piece-dialog";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { deleteUniformPiece } from "@/lib/actions/hr-uniforms";
import { formatAed } from "@/lib/hr/derived";
import {
  UNIFORM_PRODUCT_STATUS_LABELS,
  type Department,
  type Position,
  type UniformPieceRow,
  type UniformSupplierRow,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type UniformDetailsTableProps = {
  pieces: UniformPieceRow[];
  suppliers: UniformSupplierRow[];
  departments: Department[];
  positions: Position[];
  canManage?: boolean;
};

function UniformPiecePhoto({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = imageUrl.trim();
  const showImage = Boolean(src) && !failed;

  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-black/10 bg-black/[0.04]">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- WorkDrive / storage URL
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-black/35"
          aria-hidden
        >
          <Shirt className="h-5 w-5" />
        </span>
      )}
      <span className="sr-only">
        {showImage ? `Photo of ${name}` : `No photo for ${name}`}
      </span>
    </div>
  );
}

function formatEntitlementLabel(
  departmentId: string,
  positionId: string | null,
  departments: Department[],
  positions: Position[],
): string {
  const dept = departments.find((d) => d.id === departmentId);
  if (!positionId) {
    return dept ? `${dept.name} · All positions` : "Unknown department";
  }
  const pos = positions.find((p) => p.id === positionId);
  if (dept && pos) return `${dept.name} · ${pos.name}`;
  return dept?.name ?? "Unknown";
}

export function UniformDetailsTable({
  pieces,
  suppliers,
  departments,
  positions,
  canManage = false,
}: UniformDetailsTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editPiece, setEditPiece] = useState<UniformPieceRow | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pieces;
    return pieces.filter(
      (piece) =>
        piece.name.toLowerCase().includes(q) ||
        piece.details.toLowerCase().includes(q) ||
        piece.supplier.toLowerCase().includes(q) ||
        piece.supplier_orders_email.toLowerCase().includes(q) ||
        piece.contact_person.toLowerCase().includes(q) ||
        piece.contact_phone.toLowerCase().includes(q),
    );
  }, [pieces, search]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleDelete(piece: UniformPieceRow) {
    if (piece.stock_assigned > 0) {
      toast.error(
        "This uniform piece is assigned to employees and cannot be deleted.",
      );
      return;
    }
    if (
      !window.confirm(
        `Delete "${piece.name}" from the uniform catalog? This cannot be undone.`,
      )
    ) {
      return;
    }
    setActionId(piece.id);
    startTransition(async () => {
      try {
        await deleteUniformPiece({ pieceId: piece.id });
        toast.saved("Uniform piece deleted.");
        refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not delete piece.",
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
            placeholder="Search uniform pieces…"
            className="pl-9"
          />
        </div>
        {canManage ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Add uniform piece
            </Button>
            <ScopedLink
              href="/hr/assets/uniform/suppliers"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-black/15 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-black/[0.03]"
            >
              <Truck className="h-4 w-4" />
              Suppliers
            </ScopedLink>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              {pieces.length === 0
                ? "No uniform pieces in the catalog yet."
                : "No uniform pieces match your search."}
            </p>
            {canManage && pieces.length === 0 ? (
              <Button onClick={() => setCreateOpen(true)} className="mt-2">
                Add first uniform piece
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
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium text-right">Value</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Stock</th>
                  <th className="px-4 py-3 font-medium">Assigned to</th>
                  {canManage ? (
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map((piece) => {
                  const busy = pending && actionId === piece.id;
                  const assignedToEmployees = piece.stock_assigned > 0;
                  return (
                    <tr key={piece.id} className="text-[#3D421F]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <UniformPiecePhoto
                            name={piece.name}
                            imageUrl={piece.image_url}
                          />
                          <span className="font-medium">{piece.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-black/65">
                        {piece.details || "—"}
                      </td>
                      <td className="px-4 py-3 text-black/65">
                        {piece.supplier ||
                        piece.contact_person ||
                        piece.contact_phone ||
                        piece.supplier_orders_email ? (
                          <div>
                            {piece.supplier ? <div>{piece.supplier}</div> : null}
                            {piece.contact_person || piece.contact_phone ? (
                              <div className="text-xs text-black/45">
                                {[piece.contact_person, piece.contact_phone]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            ) : null}
                            {piece.supplier_orders_email ? (
                              <div className="text-xs text-black/45">
                                {piece.supplier_orders_email}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-black/65">
                        {piece.unit_value > 0 ? formatAed(piece.unit_value) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                            piece.product_status === "active"
                              ? "bg-emerald-500/10 text-emerald-800"
                              : "bg-black/5 text-black/55",
                          )}
                        >
                          {UNIFORM_PRODUCT_STATUS_LABELS[piece.product_status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-black/65">
                        <div className="font-medium text-[#3D421F]">
                          {piece.stock_balance}
                        </div>
                        <div className="text-xs text-black/45">
                          {piece.stock_received} in · {piece.stock_assigned} out
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {piece.entitlements.length === 0 ? (
                          <span className="text-black/45">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {piece.entitlements.map((ent) => (
                              <span
                                key={ent.id}
                                className="inline-flex rounded-full bg-[var(--venue-primary,#818a40)]/10 px-2.5 py-1 text-xs font-medium text-[#3D421F]"
                              >
                                {formatEntitlementLabel(
                                  ent.department_id,
                                  ent.position_id,
                                  departments,
                                  positions,
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditPiece(piece)}
                              className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
                              aria-label={`Edit ${piece.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={busy || assignedToEmployees}
                              onClick={() => handleDelete(piece)}
                              className="rounded-md p-1.5 text-black/45 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                              title={
                                assignedToEmployees
                                  ? "Assigned to employees — return the pieces before deleting"
                                  : "Delete uniform piece"
                              }
                              aria-label={
                                assignedToEmployees
                                  ? `${piece.name} is assigned to employees and cannot be deleted`
                                  : `Delete ${piece.name}`
                              }
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

      <UniformPieceDialog
        open={createOpen}
        suppliers={suppliers}
        departments={departments}
        positions={positions}
        onClose={() => setCreateOpen(false)}
        onSaved={refresh}
      />

      <UniformPieceDialog
        open={Boolean(editPiece)}
        piece={editPiece}
        suppliers={suppliers}
        departments={departments}
        positions={positions}
        onClose={() => setEditPiece(null)}
        onSaved={refresh}
      />
    </div>
  );
}
