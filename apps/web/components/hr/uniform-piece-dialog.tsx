"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  createUniformPiece,
  removeUniformPieceImage,
  updateUniformPiece,
  uploadUniformPieceImage,
} from "@/lib/actions/hr-uniforms";
import {
  UNIFORM_PRODUCT_STATUS_LABELS,
  type Department,
  type Position,
  type UniformPieceRow,
  type UniformProductStatus,
  type UniformSupplierRow,
} from "@/lib/hr/types";
import { ScopedLink } from "@/components/layout/scoped-link";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

type EntitlementDraft = {
  key: string;
  departmentId: string;
  positionId: string;
};

type StockDraft = {
  key: string;
  receivedAt: string;
  quantity: string;
  notes: string;
};

type UniformPieceDialogProps = {
  open: boolean;
  piece?: UniformPieceRow | null;
  suppliers: UniformSupplierRow[];
  departments: Department[];
  positions: Position[];
  onClose: () => void;
  /** Called after a successful save so the parent can refresh the list. */
  onSaved?: () => void;
};

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function UniformPieceDialog({
  open,
  piece,
  suppliers,
  departments,
  positions,
  onClose,
  onSaved,
}: UniformPieceDialogProps) {
  const isEdit = Boolean(piece);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [unitValue, setUnitValue] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [productStatus, setProductStatus] =
    useState<UniformProductStatus>("active");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [entitlements, setEntitlements] = useState<EntitlementDraft[]>([]);
  const [stocks, setStocks] = useState<StockDraft[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(piece?.name ?? "");
    setDetails(piece?.details ?? "");
    setUnitValue(
      piece?.unit_value != null && piece.unit_value > 0
        ? String(piece.unit_value)
        : "",
    );
    setSupplierId(piece?.supplier_id ?? "");
    setProductStatus(piece?.product_status ?? "active");
    setImagePreview(piece?.image_url || null);
    setImageFile(null);
    setRemoveImage(false);
    setEntitlements(
      piece?.entitlements.length
        ? piece.entitlements.map((ent) => ({
            key: ent.id,
            departmentId: ent.department_id,
            positionId: ent.position_id ?? "",
          }))
        : [{ key: newKey("ent"), departmentId: "", positionId: "" }],
    );
    setStocks(
      piece?.stock_receipts.length
        ? piece.stock_receipts.map((receipt) => ({
            key: receipt.id,
            receivedAt: receipt.received_at,
            quantity: String(receipt.quantity),
            notes: receipt.notes,
          }))
        : [],
    );
  }, [open, piece]);

  useEffect(() => {
    return () => {
      if (imageFile && imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imageFile, imagePreview]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const positionsByDept = useMemo(() => {
    const map = new Map<string, Position[]>();
    for (const pos of positions) {
      const list = map.get(pos.department_id) ?? [];
      list.push(pos);
      map.set(pos.department_id, list);
    }
    return map;
  }, [positions]);

  const stockReceived = useMemo(
    () =>
      stocks.reduce((sum, row) => {
        const qty = Number.parseInt(row.quantity, 10);
        return sum + (Number.isNaN(qty) || qty < 0 ? 0 : qty);
      }, 0),
    [stocks],
  );

  const stockAssigned = piece?.stock_assigned ?? 0;
  const stockBalance = stockReceived - stockAssigned;

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  if (!open) return null;

  function handleImageSelect(file: File | null) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be 2 MB or smaller.");
      return;
    }
    if (file.type && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Image must be PNG, JPEG, or WebP.");
      return;
    }
    if (imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  }

  function handleRemoveImage() {
    if (imagePreview?.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function addEntitlementRow() {
    setEntitlements((rows) => [
      ...rows,
      { key: newKey("ent"), departmentId: "", positionId: "" },
    ]);
  }

  function removeEntitlementRow(key: string) {
    setEntitlements((rows) => rows.filter((row) => row.key !== key));
  }

  function updateEntitlement(
    key: string,
    patch: Partial<Pick<EntitlementDraft, "departmentId" | "positionId">>,
  ) {
    setEntitlements((rows) =>
      rows.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.departmentId != null && patch.departmentId !== row.departmentId) {
          next.positionId = "";
        }
        return next;
      }),
    );
  }

  function addStockRow() {
    setStocks((rows) => [
      { key: newKey("stock"), receivedAt: todayIso(), quantity: "1", notes: "" },
      ...rows,
    ]);
  }

  function removeStockRow(key: string) {
    setStocks((rows) => rows.filter((row) => row.key !== key));
  }

  function updateStock(
    key: string,
    patch: Partial<Pick<StockDraft, "receivedAt" | "quantity" | "notes">>,
  ) {
    setStocks((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  async function syncImage(pieceId: string) {
    if (removeImage && piece?.image_url) {
      await removeUniformPieceImage({ pieceId });
      return;
    }
    if (!imageFile) return;

    const formData = new FormData();
    formData.set("pieceId", pieceId);
    formData.set("image", imageFile);
    await uploadUniformPieceImage(formData);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }

    const parsedEntitlements = entitlements
      .filter((row) => row.departmentId)
      .map((row) => ({
        departmentId: row.departmentId,
        positionId: row.positionId || null,
      }));

    const parsedValue =
      unitValue.trim() === "" ? 0 : Number.parseFloat(unitValue);
    if (Number.isNaN(parsedValue) || parsedValue < 0) {
      toast.error("Enter a valid value.");
      return;
    }

    const parsedStocks: Array<{
      receivedAt: string;
      quantity: number;
      notes?: string;
    }> = [];

    for (const row of stocks) {
      if (!row.receivedAt) {
        toast.error("Each stock entry needs a date.");
        return;
      }
      const qty = Number.parseInt(row.quantity, 10);
      if (Number.isNaN(qty) || qty < 1) {
        toast.error("Each stock entry needs a quantity of at least 1.");
        return;
      }
      parsedStocks.push({
        receivedAt: row.receivedAt,
        quantity: qty,
        notes: row.notes.trim(),
      });
    }

    const shouldSyncImage = Boolean(imageFile || removeImage);
    const fileForUpload = imageFile;
    const shouldRemove = removeImage && Boolean(piece?.image_url);

    setPending(true);
    try {
      const payload = {
        name: name.trim(),
        details: details.trim(),
        supplierId: supplierId || null,
        productStatus,
        unitValue: parsedValue,
        entitlements: parsedEntitlements,
        stockReceipts: parsedStocks,
      };

      let pieceId = piece?.id;
      if (isEdit && piece) {
        await updateUniformPiece({ pieceId: piece.id, ...payload });
        pieceId = piece.id;
      } else {
        const created = await createUniformPiece(payload);
        pieceId = created.id;
      }

      // Close immediately after the fast DB save; photo upload is slower (WorkDrive).
      toast.saved(isEdit ? "Uniform piece updated." : "Uniform piece added.");
      onClose();
      onSaved?.();

      if (pieceId && shouldSyncImage) {
        try {
          if (shouldRemove) {
            await removeUniformPieceImage({ pieceId });
          } else if (fileForUpload) {
            const formData = new FormData();
            formData.set("pieceId", pieceId);
            formData.set("image", fileForUpload);
            await uploadUniformPieceImage(formData);
          }
          onSaved?.();
        } catch (imageError) {
          toast.error(
            imageError instanceof Error
              ? `Piece saved, but photo failed: ${imageError.message}`
              : "Piece saved, but photo upload failed.",
          );
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save uniform piece.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Edit uniform piece" : "Add uniform piece"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-black/45">
              Uniform
            </p>
            <h2 className="font-serif text-xl text-[#3D421F]">
              {isEdit ? "Edit uniform piece" : "Add uniform piece"}
            </h2>
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
          <div className="flex items-start gap-6">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="uniform-name">Name</Label>
                <Input
                  id="uniform-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Chef jacket, Apron, Trousers"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="uniform-details">Details</Label>
                <Input
                  id="uniform-details"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Size range, colour, material"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="uniform-value">Value (AED)</Label>
                <Input
                  id="uniform-value"
                  type="number"
                  min={0}
                  step="0.01"
                  value={unitValue}
                  onChange={(e) => setUnitValue(e.target.value)}
                  placeholder="Unit value per piece"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="uniform-supplier">Supplier</Label>
                  <select
                    id="uniform-supplier"
                    className={selectClass}
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                  {suppliers.length === 0 ? (
                    <p className="text-xs text-black/45">
                      No suppliers yet.{" "}
                      <ScopedLink
                        href="/hr/assets/uniform/suppliers"
                        className="font-medium text-[var(--venue-primary,#818a40)] hover:underline"
                      >
                        Add a supplier
                      </ScopedLink>
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uniform-orders-email">Supplier orders email</Label>
                  <Input
                    id="uniform-orders-email"
                    value={selectedSupplier?.orders_email ?? ""}
                    readOnly
                    placeholder="Select a supplier"
                    className="bg-black/[0.03] text-black/65"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="uniform-contact-person">Contact person</Label>
                  <Input
                    id="uniform-contact-person"
                    value={selectedSupplier?.contact_person ?? ""}
                    readOnly
                    placeholder="Select a supplier"
                    className="bg-black/[0.03] text-black/65"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uniform-contact-phone">Phone number</Label>
                  <Input
                    id="uniform-contact-phone"
                    type="tel"
                    value={selectedSupplier?.contact_phone ?? ""}
                    readOnly
                    placeholder="Select a supplier"
                    className="bg-black/[0.03] text-black/65"
                  />
                </div>
              </div>
            </div>

            <div className="w-44 shrink-0 space-y-2">
              <Label>Photo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="sr-only"
                onChange={(e) => handleImageSelect(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative flex h-44 w-44 items-center justify-center overflow-hidden rounded-xl border border-dashed border-black/15 bg-white transition hover:border-[var(--venue-primary,#818a40)]/40 hover:bg-[var(--venue-primary,#818a40)]/5",
                  imagePreview && "border-solid",
                )}
                aria-label="Upload uniform photo"
              >
                {imagePreview ? (
                  <Image
                    src={imagePreview}
                    alt=""
                    fill
                    unoptimized={imagePreview.startsWith("blob:")}
                    className="object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 px-2 text-center text-black/45">
                    <ImagePlus className="h-6 w-6" aria-hidden />
                    <span className="text-xs leading-tight">Upload photo</span>
                  </div>
                )}
              </button>
              {imagePreview ? (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="flex w-44 items-center justify-center gap-1 text-xs text-black/45 transition hover:text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Remove
                </button>
              ) : null}

              <div className="space-y-2 pt-1">
                <Label htmlFor="uniform-product-status">Product status</Label>
                <select
                  id="uniform-product-status"
                  className={selectClass}
                  value={productStatus}
                  onChange={(e) =>
                    setProductStatus(e.target.value as UniformProductStatus)
                  }
                >
                  {(Object.keys(UNIFORM_PRODUCT_STATUS_LABELS) as UniformProductStatus[]).map(
                    (status) => (
                      <option key={status} value={status}>
                        {UNIFORM_PRODUCT_STATUS_LABELS[status]}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-black/10 bg-white/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-[#3D421F]">
                  Department / position
                </p>
                <p className="text-xs text-black/45">
                  Optional. Who receives this uniform piece. Leave position blank
                  for all roles in the department.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 text-[#3D421F]"
                onClick={addEntitlementRow}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            <div className="space-y-2">
              {entitlements.length === 0 ? (
                <p className="text-xs text-black/40">
                  No departments assigned yet.
                </p>
              ) : null}
              {entitlements.map((row) => {
                const deptPositions = row.departmentId
                  ? (positionsByDept.get(row.departmentId) ?? [])
                  : [];
                return (
                  <div
                    key={row.key}
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <select
                      className={selectClass}
                      value={row.departmentId}
                      onChange={(e) =>
                        updateEntitlement(row.key, {
                          departmentId: e.target.value,
                        })
                      }
                      aria-label="Department"
                    >
                      <option value="">Select department</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className={selectClass}
                      value={row.positionId}
                      onChange={(e) =>
                        updateEntitlement(row.key, {
                          positionId: e.target.value,
                        })
                      }
                      disabled={!row.departmentId}
                      aria-label="Position"
                    >
                      <option value="">All positions</option>
                      {deptPositions.map((pos) => (
                        <option key={pos.id} value={pos.id}>
                          {pos.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeEntitlementRow(row.key)}
                      className="flex h-10 w-10 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-rose-700"
                      aria-label="Remove assignment row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-black/15 bg-[#e8e9dc] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-[#3D421F]">
                  Uniform stocks
                </p>
                <p className="text-xs text-black/45">
                  Record stock received by date. Assigned quantity depletes
                  automatically from employee assignments.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="shrink-0 text-[#3D421F]"
                onClick={addStockRow}
              >
                <Plus className="h-4 w-4" />
                Add stock
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-black/10 bg-white px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-black/45">
                  Received
                </p>
                <p className="mt-0.5 text-lg font-medium tabular-nums text-[#3D421F]">
                  {stockReceived}
                </p>
              </div>
              <div className="rounded-lg border border-black/10 bg-white px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-black/45">
                  Assigned to employees
                </p>
                <p className="mt-0.5 text-lg font-medium tabular-nums text-[#3D421F]">
                  {stockAssigned}
                </p>
              </div>
              <div className="rounded-lg border border-black/10 bg-white px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-black/45">
                  Remaining balance
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-lg font-medium tabular-nums",
                    stockBalance < 0 ? "text-rose-700" : "text-[#3D421F]",
                  )}
                >
                  {stockBalance}
                </p>
              </div>
            </div>

            {stocks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-black/10 px-4 py-6 text-center text-sm text-black/45">
                No stock receipts yet. Add a date and quantity when inventory
                arrives.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-black/10 bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-black/10 bg-black/[0.02] text-left text-xs uppercase tracking-wide text-black/45">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Date received</th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Quantity
                        </th>
                        <th className="px-3 py-2.5 font-medium">Notes</th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {stocks.map((row) => (
                        <tr key={row.key} className="text-[#3D421F]">
                          <td className="px-3 py-2">
                            <DateInput
                              value={row.receivedAt}
                              onChange={(value) =>
                                updateStock(row.key, { receivedAt: value })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={1}
                              className="ml-auto w-24 text-right"
                              value={row.quantity}
                              onChange={(e) =>
                                updateStock(row.key, {
                                  quantity: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={row.notes}
                              onChange={(e) =>
                                updateStock(row.key, { notes: e.target.value })
                              }
                              placeholder="Optional"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => removeStockRow(row.key)}
                                className="rounded-md p-1.5 text-black/45 transition hover:bg-rose-50 hover:text-rose-700"
                                aria-label="Remove stock row"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

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
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add uniform piece"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
