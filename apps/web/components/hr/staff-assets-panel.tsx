"use client";

import { useEffect, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { listStaffAssets } from "@/lib/actions/hr-assets";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import {
  ASSET_STATUS_LABELS,
  type StaffAssignedAssetRow,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type StaffAssetsPanelProps = {
  staffId: string | null | undefined;
};

function statusBadgeClass(
  status: StaffAssignedAssetRow["status"],
): string {
  switch (status) {
    case "assigned":
      return "bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F]";
    case "lost":
      return "bg-red-500/10 text-red-800";
    case "retired":
      return "bg-black/5 text-black/55";
    default:
      return "bg-emerald-500/10 text-emerald-800";
  }
}

export function StaffAssetsPanel({ staffId }: StaffAssetsPanelProps) {
  const [loading, setLoading] = useState(Boolean(staffId));
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<StaffAssignedAssetRow[]>([]);

  useEffect(() => {
    if (!staffId) {
      setLoading(false);
      setError(null);
      setAssets([]);
      return;
    }

    setLoading(true);
    setError(null);
    void listStaffAssets({ staffId })
      .then((rows) => setAssets(rows))
      .catch((err) => {
        setAssets([]);
        setError(
          err instanceof Error ? err.message : "Could not load assigned assets.",
        );
      })
      .finally(() => setLoading(false));
  }, [staffId]);

  if (!staffId) {
    return (
      <Card className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center">
        <Package
          className="mb-3 h-8 w-8 text-[var(--venue-primary,#818a40)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="max-w-md text-sm text-black/50">
          Save this employee first to see their assigned assets.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex w-full flex-col p-5">
      <div className="mb-4 flex items-center gap-2">
        <Package
          className="h-3.5 w-3.5 text-[#3D421F]/70"
          strokeWidth={2}
          aria-hidden
        />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#3D421F]">
          Assigned assets
        </h3>
        {!loading && !error ? (
          <span className="ml-auto text-[11px] tabular-nums text-black/45">
            {assets.length} item{assets.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex min-h-[160px] items-center justify-center text-black/45">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="sr-only">Loading assets…</span>
        </div>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : assets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/10 bg-white/40 px-4 py-10 text-center">
          <p className="text-sm text-black/50">
            No company assets are currently assigned to this employee.
          </p>
          <ScopedLink
            href="/hr/assets"
            className="mt-3 inline-block text-sm font-medium text-[#3D421F] hover:underline"
          >
            Open asset catalog
          </ScopedLink>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-black/10">
          <table className="min-w-full text-sm">
            <thead className="border-b border-black/10 bg-black/[0.02] text-left text-xs uppercase tracking-wide text-black/45">
              <tr>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Serial</th>
                <th className="px-3 py-2.5 font-medium text-right">Value</th>
                <th className="px-3 py-2.5 font-medium">Issued</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 bg-white/60">
              {assets.map((asset) => (
                <tr key={asset.assignment_id} className="text-[#3D421F]">
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{asset.name}</div>
                    {asset.description ? (
                      <div className="text-xs text-black/45">
                        {asset.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    {asset.asset_type?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-black/65">
                    {asset.serial_no || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-black/65">
                    {asset.asset_value > 0
                      ? formatAed(asset.asset_value)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-black/65">
                    {formatDateOnly(asset.assigned_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                        statusBadgeClass(asset.status),
                      )}
                    >
                      {ASSET_STATUS_LABELS[asset.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
