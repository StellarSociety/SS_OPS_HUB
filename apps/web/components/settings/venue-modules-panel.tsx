"use client";

import { useMemo, useState, useTransition } from "react";
import { setVenueModuleEnabled } from "@/lib/actions/users";
import { VENUE_TOGGLEABLE_MODULES } from "@/lib/modules-catalog";
import type { Venue } from "@/lib/types/database";
import { Card } from "@/components/ui/card";

type VenueModulesPanelProps = {
  venues: Venue[];
  venueModules: {
    id: string;
    venue_id: string;
    module_key: string;
    enabled: boolean;
  }[];
};

export function VenueModulesPanel({
  venues,
  venueModules,
}: VenueModulesPanelProps) {
  const realVenues = useMemo(
    () => venues.filter((v) => !v.is_global),
    [venues],
  );
  const [selectedVenueId, setSelectedVenueId] = useState(
    realVenues[0]?.id ?? "",
  );
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const enabledMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of venueModules) {
      map.set(`${row.venue_id}:${row.module_key}`, row.enabled);
    }
    return map;
  }, [venueModules]);

  function isEnabled(venueId: string, moduleKey: string) {
    return enabledMap.get(`${venueId}:${moduleKey}`) ?? true;
  }

  function handleToggle(moduleKey: string, enabled: boolean) {
    if (!selectedVenueId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await setVenueModuleEnabled(
        selectedVenueId,
        moduleKey,
        enabled,
      );
      setMessage(result.error ?? result.success ?? null);
    });
  }

  const selectedVenue = realVenues.find((v) => v.id === selectedVenueId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="text-sm text-black/60">
          Venue
          <select
            value={selectedVenueId}
            onChange={(e) => setSelectedVenueId(e.target.value)}
            className="ml-2 h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]"
          >
            {realVenues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        {message ? <p className="text-sm text-black/60">{message}</p> : null}
      </div>

      {selectedVenue ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {VENUE_TOGGLEABLE_MODULES.map((mod) => {
            const enabled = isEnabled(selectedVenue.id, mod.key);
            return (
              <Card
                key={mod.key}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-medium text-[#3D421F]">{mod.label}</p>
                  {mod.description ? (
                    <p className="text-xs text-black/50">{mod.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => handleToggle(mod.key, !enabled)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    enabled ? "bg-[var(--venue-primary,#808A3E)]" : "bg-black/20"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                      enabled ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-black/50">No venues configured yet.</p>
      )}
    </div>
  );
}
