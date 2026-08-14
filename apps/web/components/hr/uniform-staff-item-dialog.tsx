"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Shirt, Trash2, X } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { UniformPieceDialog } from "@/components/hr/uniform-piece-dialog";
import {
  assignUniformsToStaff,
  updateUniformStaffItem,
} from "@/lib/actions/hr-uniforms";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import type {
  Department,
  Position,
  StaffWithLookups,
  UniformPieceRow,
  UniformStaffItemRow,
  UniformSupplierRow,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 w-full min-w-[10rem] rounded-md border border-black/10 bg-white px-2.5 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

type LineDraft = {
  key: string;
  pieceId: string;
  quantity: string;
  providedAt: string;
  notes: string;
};

type CreatedPieceOption = {
  id: string;
  name: string;
  unit_value: number;
};

type UniformStaffItemDialogProps = {
  open: boolean;
  staff: StaffWithLookups | null;
  pieces: UniformPieceRow[];
  suppliers?: UniformSupplierRow[];
  departments?: Department[];
  positions?: Position[];
  item?: UniformStaffItemRow | null;
  onClose: () => void;
  onSaved?: () => void;
};

function newKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(defaultPieceId = ""): LineDraft {
  return {
    key: newKey(),
    pieceId: defaultPieceId,
    quantity: "1",
    providedAt: todayIso(),
    notes: "",
  };
}

export function UniformStaffItemDialog({
  open,
  staff,
  pieces,
  suppliers = [],
  departments = [],
  positions = [],
  item,
  onClose,
  onSaved,
}: UniformStaffItemDialogProps) {
  const isEdit = Boolean(item);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [pending, setPending] = useState(false);
  const [createPieceOpen, setCreatePieceOpen] = useState(false);
  const [createdPieces, setCreatedPieces] = useState<CreatedPieceOption[]>([]);

  useEffect(() => {
    if (!open) return;
    setCreatePieceOpen(false);
    setCreatedPieces([]);
    if (item) {
      setLines([
        {
          key: item.id,
          pieceId: item.piece_id,
          quantity: String(item.quantity ?? 1),
          providedAt: item.provided_at ?? todayIso(),
          notes: item.notes ?? "",
        },
      ]);
      return;
    }
    setLines([emptyLine(pieces[0]?.id ?? "")]);
    // Reset drafts when the dialog opens, not when the catalog refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (createPieceOpen) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, createPieceOpen]);

  const selectablePieces = useMemo(() => {
    const extras = createdPieces.filter(
      (extra) => !pieces.some((piece) => piece.id === extra.id),
    );
    if (extras.length === 0) return pieces;
    return [...pieces, ...extras];
  }, [pieces, createdPieces]);

  const pieceById = useMemo(() => {
    const map = new Map<string, Pick<UniformPieceRow, "id" | "name" | "unit_value">>();
    for (const piece of selectablePieces) map.set(piece.id, piece);
    return map;
  }, [selectablePieces]);

  const lineSubtotals = useMemo(
    () =>
      lines.map((line) => {
        const piece = pieceById.get(line.pieceId);
        const qty = Number.parseInt(line.quantity, 10);
        if (!piece || Number.isNaN(qty) || qty < 1) return 0;
        return piece.unit_value * qty;
      }),
    [lines, pieceById],
  );

  const totalValue = lineSubtotals.reduce((sum, value) => sum + value, 0);

  if (!open || !staff) return null;

  function updateLine(key: string, patch: Partial<Omit<LineDraft, "key">>) {
    setLines((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function addLine() {
    setLines((rows) => [...rows, emptyLine()]);
  }

  function selectCreatedPiece(created: {
    id: string;
    name: string;
    unitValue: number;
  }) {
    setCreatedPieces((rows) =>
      rows.some((row) => row.id === created.id)
        ? rows
        : [...rows, { id: created.id, name: created.name, unit_value: created.unitValue }],
    );
    setLines((rows) => {
      const empty = rows.find((row) => !row.pieceId);
      if (empty) {
        return rows.map((row) =>
          row.key === empty.key ? { ...row, pieceId: created.id } : row,
        );
      }
      return [...rows, emptyLine(created.id)];
    });
  }

  function removeLine(key: string) {
    setLines((rows) => (rows.length <= 1 ? rows : rows.filter((row) => row.key !== key)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsedItems: Array<{
      pieceId: string;
      quantity: number;
      providedAt: string;
      notes: string;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.pieceId) {
        toast.error(`Row ${i + 1}: select a uniform piece.`);
        return;
      }
      const qty = Number.parseInt(line.quantity, 10);
      if (Number.isNaN(qty) || qty < 1) {
        toast.error(`Row ${i + 1}: enter a valid quantity.`);
        return;
      }
      if (!line.providedAt) {
        toast.error(`Row ${i + 1}: date provided is required.`);
        return;
      }
      parsedItems.push({
        pieceId: line.pieceId,
        quantity: qty,
        providedAt: line.providedAt,
        notes: line.notes.trim(),
      });
    }

    setPending(true);
    try {
      if (isEdit && item) {
        const only = parsedItems[0]!;
        await updateUniformStaffItem({
          itemId: item.id,
          staffId: staff!.id,
          ...only,
        });
        toast.saved("Uniform assignment updated.");
      } else {
        const result = await assignUniformsToStaff({
          staffId: staff!.id,
          items: parsedItems,
        });
        toast.saved(
          result.count === 1
            ? "Uniform piece assigned."
            : `${result.count} uniform pieces assigned.`,
        );
      }
      onClose();
      onSaved?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save assignment.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit uniform assignment" : "Assign uniform pieces"}
      onMouseDown={(e) => {
        if (createPieceOpen) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "w-full overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl",
          isEdit ? "max-w-lg" : "max-w-5xl",
        )}
      >
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Uniform · Employees
            </p>
            <h2 className="font-serif text-xl text-[#3D421F]">
              {isEdit ? "Edit assignment" : "Assign uniform pieces"}
            </h2>
            <p className="mt-1 text-sm text-black/55">
              {staff.full_name}
              {staff.emp_no ? ` · ${staff.emp_no}` : ""}
              {staff.joining_date
                ? ` · Joined ${formatDateOnly(staff.joining_date)}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {isEdit ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="uniform-piece">Uniform piece</Label>
                <select
                  id="uniform-piece"
                  className={selectClass}
                  value={lines[0]?.pieceId ?? ""}
                  disabled
                >
                  {pieces.map((piece) => (
                    <option key={piece.id} value={piece.id}>
                      {piece.name}
                      {piece.unit_value > 0
                        ? ` (${formatAed(piece.unit_value)})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="uniform-qty">Quantity</Label>
                  <Input
                    id="uniform-qty"
                    type="number"
                    min={1}
                    max={999}
                    value={lines[0]?.quantity ?? "1"}
                    onChange={(e) =>
                      updateLine(lines[0]!.key, { quantity: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uniform-date">Date provided</Label>
                  <DateInput
                    id="uniform-date"
                    value={lines[0]?.providedAt ?? todayIso()}
                    onChange={(value) =>
                      updateLine(lines[0]!.key, { providedAt: value })
                    }
                    className="w-full"
                    inputClassName="h-10"
                  />
                </div>
              </div>
              <div className="rounded-lg border border-black/10 bg-white/60 px-4 py-3 text-sm">
                <div className="flex items-center justify-between text-black/65">
                  <span>Subtotal value</span>
                  <span className="font-medium tabular-nums text-[#3D421F]">
                    {lineSubtotals[0] && lineSubtotals[0] > 0
                      ? formatAed(lineSubtotals[0])
                      : "—"}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="uniform-notes">Notes</Label>
                <Input
                  id="uniform-notes"
                  value={lines[0]?.notes ?? ""}
                  onChange={(e) =>
                    updateLine(lines[0]!.key, { notes: e.target.value })
                  }
                  placeholder="Optional"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-black/55">
                  Add one or more uniform pieces for this employee.
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-[#3D421F]"
                    onClick={() => setCreatePieceOpen(true)}
                  >
                    <Shirt className="h-4 w-4" />
                    Create uniform
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-[#3D421F]"
                    onClick={addLine}
                    disabled={selectablePieces.length === 0}
                  >
                    <Plus className="h-4 w-4" />
                    Add row
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-black/10 bg-white/70">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-black/10 bg-black/[0.03] text-left text-xs uppercase tracking-wide text-black/45">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Uniform piece</th>
                      <th className="w-24 px-3 py-2.5 font-medium">Qty</th>
                      <th className="w-40 px-3 py-2.5 font-medium">
                        Date provided
                      </th>
                      <th className="w-28 px-3 py-2.5 font-medium text-right">
                        Subtotal
                      </th>
                      <th className="min-w-[8rem] px-3 py-2.5 font-medium">
                        Notes
                      </th>
                      <th className="w-12 px-2 py-2.5 font-medium">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {lines.map((line, index) => (
                      <tr key={line.key} className="align-top text-[#3D421F]">
                        <td className="px-3 py-2">
                          <select
                            className={selectClass}
                            value={line.pieceId}
                            onChange={(e) =>
                              updateLine(line.key, { pieceId: e.target.value })
                            }
                            aria-label={`Uniform piece row ${index + 1}`}
                          >
                            <option value="">Select piece</option>
                            {selectablePieces.map((piece) => (
                              <option key={piece.id} value={piece.id}>
                                {piece.name}
                                {piece.unit_value > 0
                                  ? ` (${formatAed(piece.unit_value)})`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={1}
                            max={999}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, { quantity: e.target.value })
                            }
                            className="h-9"
                            aria-label={`Quantity row ${index + 1}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <DateInput
                            value={line.providedAt}
                            onChange={(value) =>
                              updateLine(line.key, { providedAt: value })
                            }
                            className="w-full"
                            inputClassName="h-9"
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-black/65">
                          <span className="inline-flex h-9 items-center">
                            {lineSubtotals[index] && lineSubtotals[index]! > 0
                              ? formatAed(lineSubtotals[index]!)
                              : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={line.notes}
                            onChange={(e) =>
                              updateLine(line.key, { notes: e.target.value })
                            }
                            placeholder="Optional"
                            className="h-9"
                            aria-label={`Notes row ${index + 1}`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => removeLine(line.key)}
                            disabled={lines.length <= 1}
                            className="flex h-9 w-9 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-rose-700 disabled:opacity-30"
                            aria-label={`Remove row ${index + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-black/10 bg-white/60 px-4 py-3 text-sm">
                <span className="text-black/65">
                  {lines.length} line{lines.length === 1 ? "" : "s"} · Total value
                </span>
                <span className="font-medium tabular-nums text-[#3D421F]">
                  {totalValue > 0 ? formatAed(totalValue) : "—"}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-black/10 pt-4">
            <Button
              type="button"
              variant="ghost"
              className="text-[#3D421F]"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || selectablePieces.length === 0}>
              {pending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : lines.length > 1
                    ? `Assign ${lines.length} pieces`
                    : "Assign pieces"}
            </Button>
          </div>
        </form>
      </div>
    </div>

    <UniformPieceDialog
      open={createPieceOpen}
      suppliers={suppliers}
      departments={departments}
      positions={positions}
      overlayClassName="z-[210]"
      onClose={() => setCreatePieceOpen(false)}
      onSaved={(created) => {
        if (created) selectCreatedPiece(created);
        onSaved?.();
      }}
    />
    </>
  );
}
