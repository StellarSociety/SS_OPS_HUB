"use client";

import { useMemo, useState, useTransition } from "react";
import { saveVenueSalesTaxSettings } from "@/lib/actions/sales";
import {
  formatPct,
  totalTaxRatePct,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueSalesTaxSettings } from "@/lib/sales/daily-sales-types";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

type SalesTaxSettingsPanelProps = {
  settings: VenueSalesTaxSettings;
  canEdit: boolean;
};

type TaxField =
  | "municipality_fee_pct"
  | "vat_pct"
  | "service_charge_pct"
  | "vat_on_service_charge_pct";

const TAX_FIELDS: {
  key: TaxField;
  label: string;
  hint?: string;
}[] = [
  { key: "municipality_fee_pct", label: "Municipality fees" },
  { key: "vat_pct", label: "VAT" },
  { key: "service_charge_pct", label: "Service charge" },
  {
    key: "vat_on_service_charge_pct",
    label: "VAT over service charge",
    hint: "Applied as a percentage of the service charge (e.g. 5% of 10% = 0.5%)",
  },
];

export function SalesTaxSettingsPanel({
  settings,
  canEdit,
}: SalesTaxSettingsPanelProps) {
  const [values, setValues] = useState({
    municipality_fee_pct: settings.municipality_fee_pct,
    vat_pct: settings.vat_pct,
    service_charge_pct: settings.service_charge_pct,
    vat_on_service_charge_pct: settings.vat_on_service_charge_pct,
  });
  const [isPending, startTransition] = useTransition();

  const totalTax = useMemo(() => totalTaxRatePct(values), [values]);
  const vatOnServiceEffective =
    values.service_charge_pct * (values.vat_on_service_charge_pct / 100);

  function handleSave() {
    startTransition(async () => {
      const result = await saveVenueSalesTaxSettings(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Tax settings saved.");
    });
  }

  return (
    <Card className="space-y-6 p-6">
      <div>
        <h2 className="font-serif text-xl text-[#3D421F]">Sales tax</h2>
        <p className="mt-1 text-sm text-black/60">
          Configure how gross sales convert to net sales for this venue. NET =
          Gross ÷ (1 + total tax rate).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TAX_FIELDS.map((field) => (
          <label key={field.key} className="block text-sm text-black/70">
            <span className="font-medium text-[#3D421F]">{field.label}</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={0.001}
                disabled={!canEdit || isPending}
                value={values[field.key]}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: Number(e.target.value) || 0,
                  }))
                }
                className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]"
              />
              <span className="text-sm text-black/50">%</span>
            </div>
            {field.hint ? (
              <span className="mt-1 block text-xs text-black/45">
                {field.hint}
              </span>
            ) : null}
          </label>
        ))}
      </div>

      <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary)]/20 p-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <p>
            <span className="text-black/50">VAT on service (effective): </span>
            <span className="font-medium text-[#3D421F]">
              {formatPct(vatOnServiceEffective)}%
            </span>
          </p>
          <p>
            <span className="text-black/50">Total tax: </span>
            <span className="font-medium text-[#3D421F]">
              {formatPct(totalTax)}%
            </span>
          </p>
        </div>
      </div>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={handleSave}
            className="h-10 rounded-md bg-[var(--venue-primary)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Save tax settings
          </button>
        </div>
      ) : (
        <p className="text-sm text-black/50">
          You have view-only access to sales tax settings.
        </p>
      )}
    </Card>
  );
}
