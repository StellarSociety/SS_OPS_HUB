"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { VisaProviderDialog } from "@/components/hr/visa-provider-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  reorderVisaProProvidersAction,
  setVisaProProviderArchived,
} from "@/lib/actions/hr-visa";
import type { VisaProProvider } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type VisaProvidersTableProps = {
  providers: VisaProProvider[];
  canManage?: boolean;
};

export function VisaProvidersTable({
  providers,
  canManage = false,
}: VisaProvidersTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editProvider, setEditProvider] = useState<VisaProProvider | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);
  const [ordered, setOrdered] = useState(providers);
  const [dragId, setDragId] = useState<string | null>(null);
  const [reorderPending, startReorder] = useTransition();

  useEffect(() => {
    setOrdered(providers);
  }, [providers]);

  const q = search.trim().toLowerCase();
  const isFiltering = q.length > 0;

  const filtered = useMemo(() => {
    return ordered.filter((p) => {
      if (!showArchived && p.archived_at) return false;
      if (!isFiltering) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.contact_person.toLowerCase().includes(q) ||
        p.contact_email.toLowerCase().includes(q) ||
        p.contact_phone.toLowerCase().includes(q)
      );
    });
  }, [ordered, isFiltering, q, showArchived]);

  const canDrag = canManage && !isFiltering && !reorderPending;

  function refresh() {
    startTransition(() => router.refresh());
  }

  function reorder(draggedId: string, targetId: string) {
    if (draggedId === targetId || isFiltering) return;
    const from = ordered.findIndex((item) => item.id === draggedId);
    const to = ordered.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;

    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setOrdered(next);

    startReorder(async () => {
      const result = await reorderVisaProProvidersAction(
        next.map((item) => item.id),
      );
      if (!result.ok) {
        toast.error(result.error);
        setOrdered(providers);
        return;
      }
      refresh();
    });
  }

  async function handleArchiveToggle(provider: VisaProProvider) {
    const archived = Boolean(provider.archived_at);
    const confirmMsg = archived
      ? `Restore "${provider.name}" to the active PRO providers list?`
      : `Archive "${provider.name}"? It will be hidden from request emails.`;
    if (!window.confirm(confirmMsg)) return;

    setArchiveBusyId(provider.id);
    try {
      const result = await setVisaProProviderArchived({
        id: provider.id,
        archived: !archived,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(archived ? "Provider restored." : "Provider archived.");
      refresh();
    } finally {
      setArchiveBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-[220px] max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PRO providers…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-black/40">
          {canManage && !isFiltering ? (
            <span>Drag rows to reorder</span>
          ) : null}
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#3D421F]">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-black/20"
            />
            Show archived
          </label>
          {canManage ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setEditProvider(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add PRO provider
            </Button>
          ) : null}
          {pending || reorderPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-black/40" aria-hidden />
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
          <p className="text-center text-sm text-muted-foreground">
            {providers.length === 0
              ? "No PRO providers configured yet."
              : "No providers match your search."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white/70">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-black/10 bg-black/[0.02] text-left text-xs uppercase tracking-wide text-black/45">
                <tr>
                  {canManage ? (
                    <th className="w-10 px-2 py-3" aria-label="Reorder" />
                  ) : null}
                  <th className="px-4 py-3 font-medium">PRO Provider</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  {canManage ? (
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((provider) => {
                  const archived = Boolean(provider.archived_at);
                  const archiveBusy = archiveBusyId === provider.id;
                  return (
                    <tr
                      key={provider.id}
                      onDragOver={(e) => {
                        if (!canDrag || !dragId) return;
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!dragId) return;
                        reorder(dragId, provider.id);
                        setDragId(null);
                      }}
                      className={cn(
                        "border-b border-black/5 last:border-0",
                        archived && "bg-black/[0.02] opacity-70",
                        dragId === provider.id && "opacity-50",
                      )}
                    >
                      {canManage ? (
                        <td className="px-2 py-3 align-top">
                          <button
                            type="button"
                            draggable={canDrag}
                            onDragStart={() => setDragId(provider.id)}
                            onDragEnd={() => setDragId(null)}
                            className={cn(
                              "rounded p-1 text-black/30",
                              canDrag
                                ? "cursor-grab hover:bg-black/5 hover:text-[#3D421F] active:cursor-grabbing"
                                : "cursor-not-allowed opacity-40",
                            )}
                            aria-label={`Reorder ${provider.name}`}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                        </td>
                      ) : null}
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-[#3D421F]">
                          {provider.name}
                        </div>
                        {archived ? (
                          <div className="mt-0.5 text-[11px] uppercase tracking-wide text-black/40">
                            Archived
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top text-[#3D421F]">
                        {provider.contact_person || "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-[#3D421F]">
                        {provider.contact_phone || "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-[#3D421F]">
                        {provider.contact_email || "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-[#3D421F]">
                        {provider.lead_days}d
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setCreateOpen(false);
                                setEditProvider(provider);
                              }}
                              aria-label={`Edit ${provider.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={archiveBusy}
                              onClick={() => handleArchiveToggle(provider)}
                              aria-label={
                                archived
                                  ? `Restore ${provider.name}`
                                  : `Archive ${provider.name}`
                              }
                            >
                              {archiveBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : archived ? (
                                <ArchiveRestore className="h-4 w-4" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                            </Button>
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

      <VisaProviderDialog
        provider={editProvider}
        open={Boolean(editProvider) || createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditProvider(null);
            setCreateOpen(false);
          }
        }}
        onSaved={refresh}
      />
    </div>
  );
}
