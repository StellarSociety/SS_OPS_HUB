"use client";

import { useMemo, useTransition } from "react";
import { toast } from "@/components/ui/toast";

async function runAction<T extends { ok: boolean; error?: string }>(
  action: () => Promise<T>,
  successMessage: string,
): Promise<T | null> {
  try {
    const result = await action();
    if (!result.ok) {
      toast.error(result.error ?? "Something went wrong.");
      return null;
    }
    toast.saved(successMessage);
    return result;
  } catch {
    toast.error("Network error — check your connection and try again.");
    return null;
  }
}

import { updateDimensionStatus } from "@/lib/actions/accounting-settings";
import type {
  AccDimensionStatus,
  Dimension,
  DimensionRequirement,
} from "@/lib/accounting/types";

type Props = {
  dimensions: Dimension[];
  requirements: DimensionRequirement[];
  canEdit: boolean;
};

const selectClass =
  "h-9 rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F]";

export function DimensionsSettingsSection({
  dimensions,
  requirements,
  canEdit,
}: Props) {
  const [pending, startTransition] = useTransition();

  const reqByDim = useMemo(() => {
    const map = new Map<string, DimensionRequirement[]>();
    for (const r of requirements) {
      const list = map.get(r.dimension_id) ?? [];
      list.push(r);
      map.set(r.dimension_id, list);
    }
    return map;
  }, [requirements]);

  function onStatusChange(id: string, status: AccDimensionStatus) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", status);
    startTransition(async () => {
      await runAction(() => updateDimensionStatus(fd), "Dimension updated");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-[#3D421F]">
          Dimensions
        </h2>
        <p className="mt-1 text-sm text-black/55">
          Analytical tags on journal lines — not extra GL accounts. Required
          dimensions are enforced by the posting engine (Phase 2).
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-3 py-2 font-medium">Dimension</th>
              <th className="px-3 py-2 font-medium">Key</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Required on (ranges)</th>
            </tr>
          </thead>
          <tbody>
            {dimensions.map((d) => {
              const ranges = reqByDim.get(d.id) ?? [];
              return (
                <tr key={d.id} className="border-t border-black/5">
                  <td className="px-3 py-2 font-medium text-[#3D421F]">
                    {d.label}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-black/55">
                    {d.key}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={selectClass}
                      disabled={!canEdit || pending}
                      value={d.status}
                      onChange={(e) =>
                        onStatusChange(
                          d.id,
                          e.target.value as AccDimensionStatus,
                        )
                      }
                    >
                      <option value="off">Off</option>
                      <option value="optional">Optional</option>
                      <option value="required">Required</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-black/60">
                    {ranges.length === 0
                      ? d.status === "required"
                        ? "All posting accounts"
                        : "—"
                      : ranges
                          .map(
                            (r) =>
                              `${r.account_range_from}–${r.account_range_to}`,
                          )
                          .join(", ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
