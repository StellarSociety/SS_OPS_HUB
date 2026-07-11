"use client";

import { useMemo, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  removeVenueMonthlyForecast,
  saveVenueMonthlyForecast,
} from "@/lib/actions/sales";
import {
  formatMonthLabel,
  getCurrentMonthKey,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueMonthlyForecast } from "@/lib/sales/daily-snap-types";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

type MonthlyForecastPanelProps = {
  forecasts: VenueMonthlyForecast[];
  canEdit: boolean;
};

const inputClass =
  "w-full rounded border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#3D421F]/40";

export function MonthlyForecastPanel({
  forecasts,
  canEdit,
}: MonthlyForecastPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newMonthKey, setNewMonthKey] = useState(getCurrentMonthKey());
  const [newForecastGs, setNewForecastGs] = useState("");

  const sortedForecasts = useMemo(
    () => [...forecasts].sort((a, b) => b.month_key.localeCompare(a.month_key)),
    [forecasts],
  );

  function handleSave(id: string | undefined, monthKey: string, value: string) {
    startTransition(async () => {
      const formData = new FormData();
      if (id) formData.set("id", id);
      formData.set("month_key", monthKey);
      formData.set("forecast_revenue_gs", value);
      const result = await saveVenueMonthlyForecast(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Forecast saved.");
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      const result = await removeVenueMonthlyForecast(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Forecast removed.");
      router.refresh();
    });
  }

  function handleAddNew() {
    handleSave(undefined, newMonthKey, newForecastGs);
    setNewForecastGs("");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        Set the total revenue forecast for each month. Daily Snap uses these
        values to calculate daily, weekly, and monthly deviations.
      </p>

      {canEdit ? (
        <Card className="p-4">
          <h3 className="font-serif text-lg text-[#3D421F]">Add forecast</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
            <input
              type="month"
              className={inputClass}
              value={newMonthKey}
              onChange={(e) => setNewMonthKey(e.target.value)}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Forecast revenue (gross)"
              className={inputClass}
              value={newForecastGs}
              onChange={(e) => setNewForecastGs(e.target.value)}
            />
            <button
              type="button"
              disabled={isPending || !newForecastGs}
              onClick={handleAddNew}
              className="rounded-md bg-[var(--venue-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-black/5 px-4 py-2">
          <h3 className="font-serif text-lg text-[#3D421F]">Monthly forecasts</h3>
        </div>
        {sortedForecasts.length === 0 ? (
          <p className="p-4 text-sm text-black/50">No forecasts configured yet.</p>
        ) : (
          <div className="divide-y divide-black/5">
            {sortedForecasts.map((forecast) => (
              <ForecastRow
                key={forecast.id}
                forecast={forecast}
                canEdit={canEdit}
                isPending={isPending}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ForecastRow({
  forecast,
  canEdit,
  isPending,
  onSave,
  onDelete,
}: {
  forecast: VenueMonthlyForecast;
  canEdit: boolean;
  isPending: boolean;
  onSave: (id: string | undefined, monthKey: string, value: string) => void;
  onDelete: (id: string) => void;
}) {
  const [value, setValue] = useState(String(forecast.forecast_revenue_gs));

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-[10rem] font-medium text-[#3D421F]">
        {formatMonthLabel(forecast.month_key)}
      </div>
      {canEdit ? (
        <>
          <input
            type="number"
            min="0"
            step="0.01"
            className={`${inputClass} max-w-[14rem]`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() => onSave(forecast.id, forecast.month_key, value)}
            className="rounded-md border border-black/10 px-3 py-2 text-sm hover:bg-black/[0.03] disabled:opacity-50"
          >
            Update
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onDelete(forecast.id)}
            className="rounded-md border border-red-200 p-2 text-red-700 hover:bg-red-50 disabled:opacity-50"
            title="Remove forecast"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      ) : (
        <span className="tabular-nums text-sm">
          {Number(forecast.forecast_revenue_gs).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      )}
    </div>
  );
}
