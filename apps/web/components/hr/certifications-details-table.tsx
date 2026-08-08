"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  GripVertical,
  Loader2,
  Pencil,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { CertificationTypeDialog } from "@/components/hr/certification-type-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  reorderCertificationTypesAction,
  setCertificationTypeArchived,
} from "@/lib/actions/hr-certifications";
import { formatAed } from "@/lib/hr/derived";
import { ensureCertificationCostBreakdown } from "@/lib/hr/certification-costs";
import type { CertificationType } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type CertificationsDetailsTableProps = {
  types: CertificationType[];
  canManage?: boolean;
};

export function CertificationsDetailsTable({
  types,
  canManage = false,
}: CertificationsDetailsTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editType, setEditType] = useState<CertificationType | null>(null);
  const [archiveBusyId, setArchiveBusyId] = useState<string | null>(null);
  const [ordered, setOrdered] = useState(types);
  const [dragId, setDragId] = useState<string | null>(null);
  const [reorderPending, startReorder] = useTransition();

  useEffect(() => {
    setOrdered(types);
  }, [types]);

  const q = search.trim().toLowerCase();
  const isFiltering = q.length > 0;

  const filtered = useMemo(() => {
    return ordered.filter((t) => {
      if (!showArchived && t.archived_at) return false;
      if (!isFiltering) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.label.toLowerCase().includes(q) ||
        t.provider_company.toLowerCase().includes(q) ||
        t.contact_person.toLowerCase().includes(q) ||
        t.contact_email.toLowerCase().includes(q) ||
        t.contact_phone.toLowerCase().includes(q)
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
      const result = await reorderCertificationTypesAction(
        next.map((item) => item.id),
      );
      if (!result.ok) {
        toast.error(result.error);
        setOrdered(types);
        return;
      }
      refresh();
    });
  }

  async function handleArchiveToggle(cert: CertificationType) {
    const archived = Boolean(cert.archived_at);
    const confirmMsg = archived
      ? `Restore "${cert.name}" to the active certifications list?`
      : `Archive "${cert.name}"? It will be hidden from employee tracking.`;
    if (!window.confirm(confirmMsg)) return;

    setArchiveBusyId(cert.id);
    try {
      const result = await setCertificationTypeArchived({
        id: cert.id,
        archived: !archived,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(archived ? "Certification restored." : "Certification archived.");
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
            placeholder="Search certifications…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-black/40">
          {canManage && !isFiltering ? (
            <span>Drag rows to change column order</span>
          ) : null}
          {isFiltering ? <span>Clear search to reorder</span> : null}
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#3D421F]">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-black/20"
            />
            Show archived
          </label>
          {pending || reorderPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-black/40" aria-hidden />
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
          <p className="text-center text-sm text-muted-foreground">
            {types.length === 0
              ? "No certification types configured yet."
              : "No certifications match your search."}
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
                  <th className="px-4 py-3 font-medium">Certification</th>
                  <th className="px-4 py-3 font-medium">Label</th>
                  <th className="px-4 py-3 font-medium">Validity</th>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Net</th>
                  <th className="px-4 py-3 font-medium">VAT</th>
                  <th className="px-4 py-3 font-medium">Gross</th>
                  {canManage ? (
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((cert) => {
                  const validityLabel = `${cert.renewal_months} month${
                    cert.renewal_months === 1 ? "" : "s"
                  }`;
                  const costs = ensureCertificationCostBreakdown(cert);
                  const archived = Boolean(cert.archived_at);
                  const archiveBusy = archiveBusyId === cert.id;
                  return (
                    <tr
                      key={cert.id}
                      onDragOver={(e) => {
                        if (!canDrag || !dragId) return;
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!dragId) return;
                        reorder(dragId, cert.id);
                        setDragId(null);
                      }}
                      className={cn(
                        "border-b border-black/5 last:border-0",
                        archived && "bg-black/[0.02] opacity-70",
                        dragId === cert.id && "bg-[var(--venue-secondary,#F0F3DD)]/40",
                      )}
                    >
                      {canManage ? (
                        <td className="px-2 py-3 align-middle">
                          <button
                            type="button"
                            draggable={canDrag}
                            disabled={!canDrag}
                            onDragStart={() => setDragId(cert.id)}
                            onDragEnd={() => setDragId(null)}
                            className={cn(
                              "cursor-grab rounded p-1 text-black/35 transition hover:bg-black/5 hover:text-[#3D421F] active:cursor-grabbing",
                              !canDrag && "cursor-not-allowed opacity-40",
                            )}
                            title={
                              isFiltering
                                ? "Clear search to reorder"
                                : "Drag to reorder"
                            }
                            aria-label={`Reorder ${cert.name}`}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                        </td>
                      ) : null}
                      <td className="px-4 py-3 font-medium text-[#3D421F]">
                        {cert.name}
                        {archived ? (
                          <span className="ml-2 inline-flex rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/45">
                            Archived
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-[#3D421F]">
                        {cert.label || "—"}
                      </td>
                      <td className="px-4 py-3 text-[#3D421F]">
                        {validityLabel}
                        <span className="mt-0.5 block text-xs text-black/40">
                          Remind {cert.lead_days}d before
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#3D421F]">
                        {cert.provider_company || "—"}
                      </td>
                      <td className="px-4 py-3 text-[#3D421F]">
                        {cert.contact_person || "—"}
                      </td>
                      <td className="px-4 py-3 text-[#3D421F]">
                        {cert.contact_phone ? (
                          <a
                            href={`tel:${cert.contact_phone.replace(/\s+/g, "")}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {cert.contact_phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#3D421F]">
                        {cert.contact_email ? (
                          <a
                            href={`mailto:${cert.contact_email}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {cert.contact_email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#3D421F]">
                        {costs.cost_net > 0 ? formatAed(costs.cost_net) : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#3D421F]">
                        {costs.cost_vat > 0 ? formatAed(costs.cost_vat) : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#3D421F]">
                        {costs.cost_value > 0
                          ? formatAed(costs.cost_value)
                          : "—"}
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => setEditType(cert)}
                              aria-label={`Edit ${cert.name}`}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit
                            </Button>
                            <button
                              type="button"
                              disabled={archiveBusy}
                              onClick={() => handleArchiveToggle(cert)}
                              className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
                              title={
                                archived
                                  ? "Restore to active list"
                                  : "Archive certification"
                              }
                              aria-label={
                                archived
                                  ? `Restore ${cert.name}`
                                  : `Archive ${cert.name}`
                              }
                            >
                              {archiveBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : archived ? (
                                <ArchiveRestore className="h-4 w-4" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                            </button>
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

      {editType ? (
        <CertificationTypeDialog
          key={editType.id}
          certification={editType}
          open
          onOpenChange={(open) => {
            if (!open) setEditType(null);
          }}
          onSaved={() => {
            setEditType(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
