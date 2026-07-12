"use client";

import { useMemo, useTransition } from "react";
import { setVenueModuleEnabled } from "@/lib/actions/users";
import { VENUE_TOGGLEABLE_MODULES } from "@/lib/modules-catalog";
import type { Venue } from "@/lib/types/database";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

type VenueModulesPanelProps = {
  venue: Venue;
  venueModules: {
    id: string;
    venue_id: string;
    module_key: string;
    enabled: boolean;
  }[];
};

export function VenueModulesPanel({
  venue,
  venueModules,
}: VenueModulesPanelProps) {
  const [isPending, startTransition] = useTransition();

  const enabledMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of venueModules) {
      map.set(`${row.venue_id}:${row.module_key}`, row.enabled);
    }
    return map;
  }, [venueModules]);

  function isEnabled(moduleKey: string) {
    return enabledMap.get(`${venue.id}:${moduleKey}`) ?? true;
  }

  function handleToggle(moduleKey: string, enabled: boolean) {
    startTransition(async () => {
      const result = await setVenueModuleEnabled(venue.id, moduleKey, enabled);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Saved.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {VENUE_TOGGLEABLE_MODULES.map((mod) => {
          const enabled = isEnabled(mod.key);
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
                  enabled ? "bg-[var(--venue-primary,#818a40)]" : "bg-black/20"
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
    </div>
  );
}
