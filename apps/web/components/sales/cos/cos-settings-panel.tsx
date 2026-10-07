"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { saveCosSettingsAction } from "@/lib/actions/cos";
import { COST_CENTRE_LABELS, type CostCentre } from "@/lib/sales/cos-types";

type Row = {
  cost_centre: CostCentre;
  target_cost_pct: number;
  purchase_target_gs: number;
  closing_stock_target_gs: number;
  auto_adjustment_pct: number;
};

export function CosSettingsPanel({
  rows: initial,
  canEdit,
}: {
  rows: Row[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  function saveRow(row: Row) {
    setSaved(null);
    startTransition(async () => {
      await saveCosSettingsAction(row);
      setSaved(row.cost_centre);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {rows.map((row, i) => (
        <Card key={row.cost_centre} className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-serif text-lg text-[#3D421F]">
              {COST_CENTRE_LABELS[row.cost_centre]}
            </h3>
            {saved === row.cost_centre ? (
              <span className="text-xs font-semibold text-emerald-600">Saved</span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumField label="Target cost %" value={row.target_cost_pct} onChange={(v) => update(i, { target_cost_pct: v })} disabled={!canEdit} />
            <NumField label="Auto adj %" value={row.auto_adjustment_pct} onChange={(v) => update(i, { auto_adjustment_pct: v })} disabled={!canEdit} />
            <NumField label="Purchase target" value={row.purchase_target_gs} onChange={(v) => update(i, { purchase_target_gs: v })} disabled={!canEdit} />
            <NumField label="Closing stock target" value={row.closing_stock_target_gs} onChange={(v) => update(i, { closing_stock_target_gs: v })} disabled={!canEdit} />
          </div>
          {canEdit ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={() => saveRow(row)}
                className="rounded-lg bg-[var(--venue-primary,#818a40)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                Save {COST_CENTRE_LABELS[row.cost_centre]}
              </button>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-black/50">{label}</label>
      <Input
        type="number"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="mt-1 text-right"
      />
    </div>
  );
}
