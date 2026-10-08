"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/components/ui/toast";
import {
  deleteCosAdjustmentKindAction,
  saveCosAdjustmentKindAction,
} from "@/lib/actions/cos";
import type {
  CosAdjustmentSide,
  VenueCosAdjustmentKind,
} from "@/lib/sales/cos-types";
import { cn } from "@/lib/utils";

type Draft = {
  id?: string;
  name: string;
  ledger_account_id: string | null;
  default_side: CosAdjustmentSide;
  active: boolean;
};

const SIDES: { value: CosAdjustmentSide; label: string; hint: string }[] = [
  { value: "DB", label: "DB · (+) Addition", hint: "Raises cost of sales" },
  { value: "CR", label: "CR · (-) Deduction", hint: "Lowers cost of sales" },
  {
    value: "NEU",
    label: "NEU · (=) Neutral",
    hint: "Recorded on the run, no effect on cost of sales",
  },
];

const SIDE_ACTIVE: Record<CosAdjustmentSide, string> = {
  DB: "bg-emerald-600 text-white",
  CR: "bg-red-600 text-white",
  NEU: "bg-slate-500 text-white",
};

const inputClass =
  "h-9 w-full rounded-md border border-black/10 bg-white px-2.5 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:opacity-60";

export function CosAdjustmentKindsEditor({
  kinds,
  ledgerOptions,
  canEdit,
}: {
  kinds: VenueCosAdjustmentKind[];
  ledgerOptions: { value: string; label: string; searchText?: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Draft[]>(() =>
    kinds.map((k) => ({
      id: k.id,
      name: k.name,
      ledger_account_id: k.ledger_account_id,
      default_side: k.default_side,
      active: k.active,
    })),
  );
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<number | null>(null);

  function patch(i: number, change: Partial<Draft>) {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...change } : x)));
    setDirty((d) => new Set(d).add(i));
  }

  function saveAll() {
    startTransition(async () => {
      const next = [...rows];
      for (const i of dirty) {
        const row = rows[i];
        if (!row || !row.name.trim()) continue;
        const res = await saveCosAdjustmentKindAction(row);
        if (!res.ok) {
          toast.error(`${row.name || "Adjustment kind"}: ${res.error}`);
          return;
        }
        next[i] = { ...row, id: res.kind.id };
      }
      setRows(next);
      setDirty(new Set());
      toast.saved("Adjustment kinds saved.");
      router.refresh();
    });
  }

  async function confirmDelete() {
    if (toDelete == null) return;
    const row = rows[toDelete];
    if (row?.id) await deleteCosAdjustmentKindAction(row.id);
    setRows((r) => r.filter((_, j) => j !== toDelete));
    setDirty(new Set());
    setToDelete(null);
    toast.saved("Adjustment kind deleted.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg text-[#3D421F]">
            Adjustment kinds
          </h3>
          <p className="text-sm text-black/55">
            Names offered in the cost run Adjustments table, with the ledger
            account they record to and their default side.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setRows((r) => [
                ...r,
                {
                  name: "",
                  ledger_account_id: null,
                  default_side: "CR",
                  active: true,
                },
              ]);
              setDirty((d) => new Set(d).add(rows.length));
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--venue-primary,#818a40)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Add kind
          </button>
        ) : null}
      </div>

      <Card className="overflow-visible p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/60 text-xs font-bold uppercase tracking-wide text-black/70">
              <th className="px-4 py-2.5 text-left">Name</th>
              <th className="px-3 py-2.5 text-left">Ledger account</th>
              <th className="w-80 px-3 py-2.5 text-left">Default (DB / CR / NEU)</th>
              <th className="w-20 px-3 py-2.5 text-center">Active</th>
              {canEdit ? <th className="w-10" aria-label="Remove" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-black/45">
                  No adjustment kinds yet. Add e.g. “Staff meals”, “Breakages”,
                  “Wastage”.
                </td>
              </tr>
            ) : null}
            {rows.map((row, i) => (
              <tr
                key={row.id ?? `new-${i}`}
                className="border-b border-black/5 last:border-0"
              >
                <td className="px-4 py-1.5">
                  <input
                    value={row.name}
                    disabled={!canEdit}
                    placeholder="Adjustment name"
                    onChange={(e) => patch(i, { name: e.target.value })}
                    className={inputClass}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <SearchableSelect
                    value={row.ledger_account_id ?? ""}
                    onChange={(v) => patch(i, { ledger_account_id: v || null })}
                    options={ledgerOptions}
                    placeholder="Select ledger…"
                    searchPlaceholder="Search code or name…"
                    disabled={!canEdit}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <div className="inline-flex rounded-md bg-black/[0.04] p-0.5 text-xs font-semibold">
                    {SIDES.map((side) => (
                      <button
                        key={side.value}
                        type="button"
                        title={side.hint}
                        disabled={!canEdit}
                        onClick={() => patch(i, { default_side: side.value })}
                        className={cn(
                          "whitespace-nowrap rounded px-2 py-1 transition",
                          row.default_side === side.value
                            ? SIDE_ACTIVE[side.value]
                            : "text-black/55 hover:text-black",
                        )}
                      >
                        {side.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.active}
                    disabled={!canEdit}
                    onChange={(e) => patch(i, { active: e.target.checked })}
                    aria-label={`${row.name || "Kind"} active`}
                  />
                </td>
                {canEdit ? (
                  <td className="text-center">
                    <button
                      type="button"
                      aria-label="Delete adjustment kind"
                      onClick={() => setToDelete(i)}
                      className="text-black/30 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit ? (
          <div className="flex justify-end border-t border-black/5 px-4 py-3">
            <button
              type="button"
              disabled={pending || dirty.size === 0}
              onClick={saveAll}
              className="rounded-lg bg-[var(--venue-primary,#818a40)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save adjustment kinds"}
            </button>
          </div>
        ) : null}
      </Card>

      <ConfirmDeleteDialog
        open={toDelete != null}
        title="Delete this adjustment kind?"
        description="Cost runs that already used it keep their saved adjustments."
        subject={
          toDelete != null ? (
            <p className="font-medium">{rows[toDelete]?.name || "Unnamed"}</p>
          ) : null
        }
        onClose={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
