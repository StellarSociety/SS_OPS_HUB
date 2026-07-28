"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  normalizePointTierPositionIds,
  type BenefitPointTier,
} from "@/lib/hr/benefits";

export type BenefitsPositionOption = {
  id: string;
  label: string;
};

function benefitsListInputClass(className?: string) {
  return cn("h-8 bg-white", className);
}

type BenefitsPointTiersEditorProps = {
  tiers: BenefitPointTier[];
  onChange: (next: BenefitPointTier[]) => void;
  positions: BenefitsPositionOption[];
};

export function BenefitsPointTiersEditor({
  tiers,
  onChange,
  positions,
}: BenefitsPointTiersEditorProps) {
  const labelToId = new Map(positions.map((p) => [p.label, p.id]));
  const idToLabel = new Map(positions.map((p) => [p.id, p.label]));

  function updateTier(index: number, patch: Partial<BenefitPointTier>) {
    onChange(tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)));
  }

  function setTierPositionIds(index: number, positionIds: string[]) {
    onChange(
      normalizePointTierPositionIds(
        tiers.map((tier, i) => {
          if (i === index) {
            return { ...tier, positionIds };
          }
          return {
            ...tier,
            positionIds: (tier.positionIds ?? []).filter(
              (id) => !positionIds.includes(id),
            ),
          };
        }),
      ),
    );
  }

  const assignedElsewhereByTier = useMemo(() => {
    const map = new Map<number, Set<string>>();
    tiers.forEach((tier, index) => {
      const elsewhere = new Set<string>();
      tiers.forEach((other, i) => {
        if (i === index) return;
        for (const id of other.positionIds ?? []) {
          elsewhere.add(id);
        }
      });
      map.set(index, elsewhere);
    });
    return map;
  }, [tiers]);

  function removeTier(index: number) {
    onChange(tiers.filter((_, i) => i !== index));
  }

  function addTier() {
    onChange([
      ...tiers,
      {
        key: `tier_${tiers.length + 1}`,
        label: "New tier",
        points: 1,
        positionIds: [],
      },
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="hidden gap-2 px-3 text-[11px] font-medium uppercase tracking-wide text-black/45 lg:grid lg:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.4fr)_2.25rem]">
        <span>Tier</span>
        <span className="text-right">Points</span>
        <span>Positions</span>
        <span aria-hidden />
      </div>

      <div className="space-y-2">
        {tiers.map((tier, index) => {
          const selectedIds = tier.positionIds ?? [];
          const selectedLabels = selectedIds
            .map((id) => idToLabel.get(id))
            .filter((label): label is string => Boolean(label));
          const assignedElsewhere = assignedElsewhereByTier.get(index) ?? new Set();
          const availableLabels = positions
            .filter(
              (position) =>
                selectedIds.includes(position.id) ||
                !assignedElsewhere.has(position.id),
            )
            .map((position) => position.label);

          return (
            <div
              key={tier.key || `tier-${index}`}
              className="grid gap-2 rounded-lg border border-black/8 bg-white/90 p-3 shadow-sm lg:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1.4fr)_2.25rem] lg:items-start"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-black/45 lg:hidden">
                  Tier
                </p>
                <Input
                  value={tier.label}
                  onChange={(e) => updateTier(index, { label: e.target.value })}
                  className={benefitsListInputClass()}
                  placeholder="Tier name"
                />
              </div>

              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-black/45 lg:hidden">
                  Points
                </p>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={tier.points}
                  onChange={(e) =>
                    updateTier(index, {
                      points: Number(e.target.value) || 0,
                    })
                  }
                  className={benefitsListInputClass("text-right tabular-nums")}
                />
              </div>

              <div className="min-w-0 space-y-1 lg:col-span-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-black/45 lg:hidden">
                  Positions
                </p>
                {positions.length > 0 ? (
                  <MultiSelect
                    options={availableLabels}
                    selected={selectedLabels}
                    onChange={(labels) => {
                      const ids = labels
                        .map((label) => labelToId.get(label))
                        .filter((id): id is string => Boolean(id));
                      setTierPositionIds(index, ids);
                    }}
                    placeholder="Select positions…"
                    searchPlaceholder="Search positions…"
                    className="h-8"
                  />
                ) : (
                  <p className="rounded-md border border-dashed border-black/10 bg-white px-2 py-1.5 text-xs text-black/45">
                    No HR positions configured yet.
                  </p>
                )}
                {selectedLabels.length > 0 ? (
                  <p className="text-[11px] leading-snug text-black/45">
                    {selectedLabels.join(", ")}
                  </p>
                ) : (
                  <p className="text-[11px] leading-snug text-black/45">
                    Unassigned positions fall back to tier name matching during
                    calculation.
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={tiers.length <= 1}
                onClick={() => removeTier(index)}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-black/45 transition-colors lg:mt-0",
                  tiers.length > 1
                    ? "hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                    : "cursor-not-allowed opacity-30",
                )}
                aria-label="Remove tier"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-0.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={addTier}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add tier
        </Button>
      </div>
    </div>
  );
}
