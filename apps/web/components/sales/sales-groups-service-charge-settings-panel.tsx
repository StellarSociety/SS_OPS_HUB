"use client";

import { useState, useTransition } from "react";
import { saveVenueWaiterSalesSettings } from "@/lib/actions/sales";
import { formatPct } from "@/lib/sales/daily-sales-calculations";
import type { VenueWaiterSalesSettings } from "@/lib/sales/waiter-sales-settings-types";
import { Card } from "@/components/ui/card";

type SalesGroupsServiceChargeSettingsPanelProps = {
  settings: VenueWaiterSalesSettings;
  canEdit: boolean;
};

export function SalesGroupsServiceChargeSettingsPanel({
  settings,
  canEdit,
}: SalesGroupsServiceChargeSettingsPanelProps) {
  const [groupsAddedServiceChargePct, setGroupsAddedServiceChargePct] =
    useState(settings.groups_added_service_charge_pct);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveVenueWaiterSalesSettings({
        groups_added_service_charge_pct: groupsAddedServiceChargePct,
      });
      setMessage(result.error ?? result.success ?? null);
    });
  }

  return (
    <Card className="space-y-6 p-6">
      <div>
        <h2 className="font-serif text-xl text-[#3D421F]">Groups service charge</h2>
        <p className="mt-1 text-sm text-black/60">
          Configure the percentage shown on the waiter sales entry form for
          groups total collected service charge.
        </p>
      </div>

      <label className="block max-w-md text-sm text-black/70">
        <span className="font-medium text-[#3D421F]">
          Groups Added Service Charge %
        </span>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={0.001}
            disabled={!canEdit || isPending}
            value={groupsAddedServiceChargePct}
            onChange={(e) =>
              setGroupsAddedServiceChargePct(Number(e.target.value) || 0)
            }
            className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]"
          />
          <span className="text-sm text-black/50">%</span>
        </div>
      </label>

      <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary)]/20 p-4 text-sm">
        <p>
          <span className="text-black/50">Entry form label: </span>
          <span className="font-medium text-[#3D421F]">
            Groups Total Collected Service Charge Value{" "}
            {formatPct(groupsAddedServiceChargePct)}%
          </span>
        </p>
      </div>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={handleSave}
            className="h-10 rounded-md bg-[var(--venue-primary)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Save settings
          </button>
          {message ? <p className="text-sm text-black/60">{message}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-black/50">
          You have view-only access to groups service charge settings.
        </p>
      )}
    </Card>
  );
}
