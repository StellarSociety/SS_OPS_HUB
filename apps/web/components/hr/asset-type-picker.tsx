"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createAssetType,
  deleteAssetType,
  updateAssetType,
} from "@/lib/actions/hr-assets";
import type { AssetType } from "@/lib/hr/types";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type AssetTypePickerProps = {
  id?: string;
  value: string;
  types: AssetType[];
  onChange: (typeId: string) => void;
  onTypesChange: (types: AssetType[]) => void;
  disabled?: boolean;
  canManage?: boolean;
};

export function AssetTypePicker({
  id,
  value,
  types,
  onChange,
  onTypesChange,
  disabled = false,
  canManage = false,
}: AssetTypePickerProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const selected = types.find((t) => t.id === value);

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setDraftName("");
      setAdding(false);
      setAddName("");
      return;
    }

    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  function startEdit(type: AssetType, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAdding(false);
    setEditingId(type.id);
    setDraftName(type.name);
  }

  async function saveEdit(typeId: string) {
    const name = draftName.trim();
    if (!name) {
      toast.error("Type name is required.");
      return;
    }
    setBusy(true);
    try {
      const updated = await updateAssetType({ id: typeId, name });
      onTypesChange(
        types
          .map((t) => (t.id === typeId ? { ...t, ...updated } : t))
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
      );
      setEditingId(null);
      setDraftName("");
      toast.saved("Type updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update type.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeType(type: AssetType, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        `Delete type "${type.name}"? This only works if no assets use it.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteAssetType({ id: type.id });
      const next = types.filter((t) => t.id !== type.id);
      onTypesChange(next);
      if (value === type.id) {
        onChange(next[0]?.id ?? "");
      }
      toast.saved("Type deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete type.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveNewType() {
    const name = addName.trim();
    if (!name) {
      toast.error("Type name is required.");
      return;
    }
    setBusy(true);
    try {
      const created = await createAssetType({ name });
      const next = [...types, created].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
      );
      onTypesChange(next);
      onChange(created.id);
      setAdding(false);
      setAddName("");
      setOpen(false);
      toast.saved("Type added.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add type.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-left text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-black/45")}>
          {selected?.name ?? "Select type"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-black/40" aria-hidden />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 z-[220] mt-1 overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg"
          role="listbox"
          aria-label="Asset types"
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul className="max-h-56 overflow-y-auto py-1">
            {types.length === 0 ? (
              <li className="px-3 py-3 text-sm text-black/45">No types yet.</li>
            ) : (
              types.map((type) => {
                const isSelected = type.id === value;
                const isEditing = editingId === type.id;

                if (isEditing) {
                  return (
                    <li
                      key={type.id}
                      className="flex items-center gap-1 px-2 py-1.5"
                    >
                      <input
                        ref={editInputRef}
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveEdit(type.id);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingId(null);
                          }
                        }}
                        disabled={busy}
                        className="h-8 min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveEdit(type.id)}
                        className="rounded-md p-1.5 text-[#3D421F] transition hover:bg-black/5 disabled:opacity-40"
                        aria-label="Save type"
                        title="Save"
                      >
                        <Check className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                        className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 disabled:opacity-40"
                        aria-label="Cancel edit"
                        title="Cancel"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  );
                }

                return (
                  <li key={type.id}>
                    <div
                      className={cn(
                        "flex items-center gap-1 px-1 py-0.5",
                        isSelected && "bg-[var(--venue-primary)]/10",
                      )}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={busy}
                        onClick={() => {
                          onChange(type.id);
                          setOpen(false);
                        }}
                        className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm text-[#3D421F] hover:bg-black/[0.03]"
                      >
                        {type.name}
                      </button>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => startEdit(type, e)}
                            className="rounded-md p-1.5 text-black/40 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
                            aria-label={`Edit ${type.name}`}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(e) => void removeType(type, e)}
                            className="rounded-md p-1.5 text-black/40 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                            aria-label={`Delete ${type.name}`}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          {canManage ? (
            <div className="border-t border-black/10">
              {adding ? (
                <div className="flex items-center gap-1 px-2 py-2">
                  <input
                    ref={addInputRef}
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveNewType();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setAdding(false);
                        setAddName("");
                      }
                    }}
                    disabled={busy}
                    placeholder="New type name"
                    className="h-8 min-w-0 flex-1 rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveNewType()}
                    className="rounded-md p-1.5 text-[#3D421F] transition hover:bg-black/5 disabled:opacity-40"
                    aria-label="Save new type"
                    title="Save"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setAdding(false);
                      setAddName("");
                    }}
                    className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 disabled:opacity-40"
                    aria-label="Cancel add"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditingId(null);
                    setAdding(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-[#3D421F] transition hover:bg-[var(--venue-secondary,#F0F3DD)]/50 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add Type
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
