"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { saveUserPermissions } from "@/lib/actions/users";
import type { PermissionGrantInput } from "@/lib/access/types";
import type { AccessLevel } from "@/lib/role-permissions";
import {
  getModuleCatalog,
  getModuleLabel,
  getFeaturesForModule,
} from "@/lib/modules-catalog";
import type { Venue } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";

const ACCESS_LEVELS: AccessLevel[] = ["submit", "view", "edit", "admin"];

type GrantRow = PermissionGrantInput & { key: string };

type UserPermissionsGridProps = {
  userId: string;
  initialGrants: PermissionGrantInput[];
  venues: Venue[];
};

function toRows(grants: PermissionGrantInput[]): GrantRow[] {
  return grants.map((g, i) => ({
    ...g,
    key: `${g.venue_id ?? "global"}-${g.module_key}-${g.feature_key}-${i}`,
  }));
}

export function UserPermissionsGrid({
  userId,
  initialGrants,
  venues,
}: UserPermissionsGridProps) {
  const [rows, setRows] = useState<GrantRow[]>(() => toRows(initialGrants));
  const [isPending, startTransition] = useTransition();

  const moduleCatalog = useMemo(() => getModuleCatalog(), []);
  const realVenues = useMemo(
    () => venues.filter((v) => !v.is_global),
    [venues],
  );

  function addRow() {
    const firstMod = moduleCatalog[0];
    const firstFeature = firstMod?.features[0];
    if (!firstMod || !firstFeature) return;

    setRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        module_key: firstMod.key,
        feature_key: firstFeature.key,
        access_level: "view",
        venue_id: null,
      },
    ]);
  }

  function updateRow(key: string, patch: Partial<PermissionGrantInput>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        if (patch.module_key && patch.module_key !== row.module_key) {
          const features = getFeaturesForModule(patch.module_key);
          next.feature_key = features[0]?.key ?? row.feature_key;
        }
        return next;
      }),
    );
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function handleSave() {
    startTransition(async () => {
      const grants: PermissionGrantInput[] = rows.map(
        ({ module_key, feature_key, access_level, venue_id }) => ({
          module_key,
          feature_key,
          access_level,
          venue_id,
        }),
      );
      const result = await saveUserPermissions(userId, grants);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Saved.");
    });
  }

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="font-serif text-xl text-[#3D421F]">Permissions</h2>
        <p className="mt-1 text-sm text-black/60">
          Grant module/feature access per venue. Choose &quot;All venues&quot;
          for group-wide access — separate from the user&apos;s home venue.
        </p>
      </div>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-black/50">No permissions yet.</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.key}
              className="grid gap-2 rounded-lg border border-black/10 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5"
            >
              <label className="space-y-1 text-xs">
                <span className="text-black/50">Module</span>
                <select
                  value={row.module_key}
                  onChange={(e) =>
                    updateRow(row.key, { module_key: e.target.value })
                  }
                  className="h-10 w-full rounded-md border border-black/10 px-2 text-sm"
                >
                  {moduleCatalog.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="text-black/50">Feature</span>
                <select
                  value={row.feature_key}
                  onChange={(e) =>
                    updateRow(row.key, { feature_key: e.target.value })
                  }
                  className="h-10 w-full rounded-md border border-black/10 px-2 text-sm"
                >
                  {getFeaturesForModule(row.module_key).map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="text-black/50">Access</span>
                <select
                  value={row.access_level}
                  onChange={(e) =>
                    updateRow(row.key, {
                      access_level: e.target.value as AccessLevel,
                    })
                  }
                  className="h-10 w-full rounded-md border border-black/10 px-2 text-sm"
                >
                  {ACCESS_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs sm:col-span-2 lg:col-span-1">
                <span className="text-black/50">Venue scope</span>
                <select
                  value={row.venue_id ?? ""}
                  onChange={(e) =>
                    updateRow(row.key, {
                      venue_id: e.target.value ? e.target.value : null,
                    })
                  }
                  className="h-10 w-full rounded-md border border-black/10 px-2 text-sm"
                >
                  <option value="">All venues (group-wide)</option>
                  {realVenues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end justify-end sm:col-span-2 lg:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRow(row.key)}
                  aria-label="Remove grant"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Add grant
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={handleSave}>
          {isPending ? "Saving…" : "Save permissions"}
        </Button>
      </div>

      {rows.length > 0 ? (
        <p className="text-xs text-black/40">
          Modules:{" "}
          {[...new Set(rows.map((r) => getModuleLabel(r.module_key)))].join(
            ", ",
          )}
        </p>
      ) : null}
    </Card>
  );
}
