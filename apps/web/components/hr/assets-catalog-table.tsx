"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Package, Pencil, Plus, Search, Shirt, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { AssignAssetDialog } from "@/components/hr/assign-asset-dialog";
import { CreateAssetDialog } from "@/components/hr/create-asset-dialog";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  deleteAsset,
  markAssetLost,
  retireAsset,
  returnAsset,
} from "@/lib/actions/hr-assets";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import {
  ASSET_STATUS_LABELS,
  type AssetRow,
  type AssetStatus,
  type AssetType,
  type Department,
  type EmploymentStatus,
  type Position,
  type StaffWithLookups,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type AssetsCatalogTableProps = {
  mode?: "assets" | "uniform";
  uniformTypeId?: string | null;
  assets: AssetRow[];
  assetTypes: AssetType[];
  staff: StaffWithLookups[];
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  canManage?: boolean;
};

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

const STATUS_FILTER_OPTIONS: Array<"" | AssetStatus> = [
  "",
  "available",
  "assigned",
  "lost",
  "retired",
];

function statusBadgeClass(status: AssetStatus): string {
  switch (status) {
    case "available":
      return "bg-emerald-500/10 text-emerald-800";
    case "assigned":
      return "bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F]";
    case "lost":
      return "bg-red-500/10 text-red-800";
    case "retired":
      return "bg-black/5 text-black/55";
    default:
      return "bg-black/5 text-black/55";
  }
}

export function AssetsCatalogTable({
  mode = "assets",
  uniformTypeId = null,
  assets,
  assetTypes,
  staff,
  departments,
  positions,
  statuses,
  canManage = false,
}: AssetsCatalogTableProps) {
  const isUniform = mode === "uniform";
  const itemLabel = isUniform ? "uniform" : "asset";
  const itemLabelPlural = isUniform ? "uniforms" : "assets";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | AssetStatus>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<AssetRow | null>(null);
  const [assignAsset, setAssignAsset] = useState<AssetRow | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [localTypes, setLocalTypes] = useState(assetTypes);

  useEffect(() => {
    setLocalTypes(assetTypes);
  }, [assetTypes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (typeFilter && asset.asset_type_id !== typeFilter) return false;
      if (statusFilter && asset.status !== statusFilter) return false;
      if (!q) return true;
      return (
        asset.name.toLowerCase().includes(q) ||
        asset.serial_no.toLowerCase().includes(q) ||
        asset.description.toLowerCase().includes(q) ||
        (asset.assigned_staff_name?.toLowerCase().includes(q) ?? false) ||
        (asset.assigned_staff_emp_no?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [assets, search, statusFilter, typeFilter]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleDelete(asset: AssetRow) {
    if (
      !window.confirm(
        `Delete "${asset.name}" from the catalog? This cannot be undone.`,
      )
    ) {
      return;
    }
    runAction(
      asset.id,
      () => deleteAsset({ assetId: asset.id }),
      "Asset deleted.",
    );
  }

  function runAction(
    assetId: string,
    action: () => Promise<void>,
    successMessage: string,
  ) {
    setActionId(assetId);
    startTransition(async () => {
      try {
        await action();
        toast.saved(successMessage);
        refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Action failed.",
        );
      } finally {
        setActionId(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {isUniform && !uniformTypeId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Uniform type is not configured in the asset catalog. Add a type named
          &quot;Uniform&quot; on the Assets tab first.
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isUniform
                  ? "Search uniforms or assignee…"
                  : "Search assets or assignee…"
              }
              className="pl-9"
            />
          </div>
          {!isUniform ? (
            <select
              className={selectClass}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              {localTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            className={selectClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | AssetStatus)}
            aria-label="Filter by status"
          >
            {STATUS_FILTER_OPTIONS.map((status) => (
              <option key={status || "all"} value={status}>
                {status ? ASSET_STATUS_LABELS[status] : "All statuses"}
              </option>
            ))}
          </select>
        </div>

        {canManage ? (
          <Button
            onClick={() => setCreateOpen(true)}
            className="shrink-0"
            disabled={isUniform && !uniformTypeId}
          >
            <Plus className="h-4 w-4" />
            Add {itemLabel}
          </Button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
          <div className="flex flex-col items-center gap-3 text-center">
            {isUniform ? (
              <Shirt
                className="h-8 w-8 text-[var(--venue-primary,#818a40)]"
                strokeWidth={1.5}
                aria-hidden
              />
            ) : (
              <Package
                className="h-8 w-8 text-[var(--venue-primary,#818a40)]"
                strokeWidth={1.5}
                aria-hidden
              />
            )}
            <p className="text-sm text-muted-foreground">
              {assets.length === 0
                ? `No ${itemLabelPlural} in the catalog yet.`
                : `No ${itemLabelPlural} match your filters.`}
            </p>
            {canManage && assets.length === 0 ? (
              <Button onClick={() => setCreateOpen(true)} className="mt-2">
                Add first {itemLabel}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white/70">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-black/10 bg-black/[0.02] text-left text-xs uppercase tracking-wide text-black/45">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  {!isUniform ? (
                    <th className="px-4 py-3 font-medium">Type</th>
                  ) : null}
                  <th className="px-4 py-3 font-medium">Serial</th>
                  <th className="px-4 py-3 font-medium text-right">Value</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Assigned to</th>
                  <th className="px-4 py-3 font-medium">Issued</th>
                  {canManage ? (
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map((asset) => {
                  const busy = pending && actionId === asset.id;
                  return (
                    <tr key={asset.id} className="text-[#3D421F]">
                      <td className="px-4 py-3">
                        <div className="font-medium">{asset.name}</div>
                        {asset.description ? (
                          <div className="text-xs text-black/45">
                            {asset.description}
                          </div>
                        ) : null}
                      </td>
                      {!isUniform ? (
                        <td className="px-4 py-3">
                          {asset.asset_type?.name ?? "—"}
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-black/65">
                        {asset.serial_no || "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-black/65">
                        {asset.asset_value > 0 ? formatAed(asset.asset_value) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                            statusBadgeClass(asset.status),
                          )}
                        >
                          {ASSET_STATUS_LABELS[asset.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {asset.assigned_staff_id ? (
                          <ScopedLink
                            href={`/hr/${asset.assigned_staff_id}`}
                            className="font-medium hover:underline"
                          >
                            {asset.assigned_staff_name}
                          </ScopedLink>
                        ) : (
                          <span className="text-black/45">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-black/65">
                        {asset.assigned_at
                          ? formatDateOnly(asset.assigned_at)
                          : "—"}
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {asset.status === "available" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-[#3D421F]"
                                disabled={busy}
                                onClick={() => setAssignAsset(asset)}
                              >
                                Assign
                              </Button>
                            ) : null}
                            {asset.status === "assigned" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-[#3D421F]"
                                disabled={busy}
                                onClick={() =>
                                  runAction(
                                    asset.id,
                                    () => returnAsset({ assetId: asset.id }),
                                    "Asset returned.",
                                  )
                                }
                              >
                                {busy ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Return"
                                )}
                              </Button>
                            ) : null}
                            {asset.status === "assigned" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-red-700"
                                disabled={busy}
                                onClick={() =>
                                  runAction(
                                    asset.id,
                                    () => markAssetLost({ assetId: asset.id }),
                                    "Asset marked as lost.",
                                  )
                                }
                              >
                                Lost
                              </Button>
                            ) : null}
                            {asset.status === "available" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-black/45"
                                disabled={busy}
                                onClick={() =>
                                  runAction(
                                    asset.id,
                                    () => retireAsset({ assetId: asset.id }),
                                    "Asset retired.",
                                  )
                                }
                              >
                                Retire
                              </Button>
                            ) : null}

                            {asset.status !== "retired" ? (
                              <>
                                <span
                                  className="mx-0.5 text-black/20"
                                  aria-hidden
                                >
                                  |
                                </span>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setEditAsset(asset)}
                                  className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:cursor-not-allowed disabled:opacity-40"
                                  title="Edit asset"
                                  aria-label={`Edit ${asset.name}`}
                                >
                                  <Pencil className="h-4 w-4" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || asset.status === "assigned"}
                                  onClick={() => handleDelete(asset)}
                                  className="rounded-md p-1.5 text-black/45 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                                  title={
                                    asset.status === "assigned"
                                      ? "Return the asset before deleting"
                                      : "Delete asset"
                                  }
                                  aria-label={`Delete ${asset.name}`}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateAssetDialog
        open={createOpen}
        assetTypes={localTypes}
        fixedTypeId={isUniform ? uniformTypeId ?? undefined : undefined}
        hideTypeField={isUniform}
        dialogTitle={isUniform ? "Add uniform" : "Add asset"}
        canManageTypes={canManage && !isUniform}
        onTypesChange={setLocalTypes}
        onClose={() => {
          setCreateOpen(false);
          refresh();
        }}
      />

      <CreateAssetDialog
        open={Boolean(editAsset)}
        assetTypes={localTypes}
        asset={editAsset}
        fixedTypeId={isUniform ? uniformTypeId ?? undefined : undefined}
        hideTypeField={isUniform}
        dialogTitle={isUniform ? "Edit uniform" : "Edit asset"}
        canManageTypes={canManage && !isUniform}
        onTypesChange={setLocalTypes}
        onClose={() => {
          setEditAsset(null);
          refresh();
        }}
      />

      <AssignAssetDialog
        open={Boolean(assignAsset)}
        asset={assignAsset}
        staff={staff}
        departments={departments}
        positions={positions}
        statuses={statuses}
        onClose={() => {
          setAssignAsset(null);
          refresh();
        }}
      />
    </div>
  );
}
