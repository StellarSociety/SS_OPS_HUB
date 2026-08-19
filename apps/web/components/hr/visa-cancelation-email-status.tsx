"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Mail, Trash2 } from "lucide-react";
import { VisaRequestEmailDialog } from "@/components/hr/visa-request-email-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  getVisaEmployeeRequestEmailContext,
  listVisaRequestEmailSends,
  type VisaRequestEmailSendRecord,
} from "@/lib/actions/hr-visa";
import type { VisaEmployeeRow, VisaProProvider } from "@/lib/hr/types";
import {
  deleteVisaRequestDraftUnit,
  listStaffVisaCancelDrafts,
  type SavedVisaRequestDraftBatch,
  type SavedVisaRequestDraftUnit,
} from "@/lib/hr/visa-request-drafts-storage";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString("en-AE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function VisaCancelationEmailStatus({
  staffId,
  canSend,
}: {
  staffId: string;
  canSend: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState<{
    row: VisaEmployeeRow;
    providers: VisaProProvider[];
    venueId: string;
  } | null>(null);
  const [drafts, setDrafts] = useState<
    Array<SavedVisaRequestDraftBatch & { unit: SavedVisaRequestDraftUnit }>
  >([]);
  const [sends, setSends] = useState<VisaRequestEmailSendRecord[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftBatchId, setDraftBatchId] = useState<string | null>(null);

  const refreshRecords = useCallback(
    (venueId: string) => {
      setDrafts(listStaffVisaCancelDrafts(venueId, staffId));
      void listVisaRequestEmailSends().then((result) => {
        if (!result.ok) return;
        setSends(
          result.sends.filter(
            (row) =>
              row.staffId === staffId &&
              String(row.requestType ?? "").toLowerCase() === "cancel",
          ),
        );
      });
    },
    [staffId],
  );

  useEffect(() => {
    let cancelled = false;
    void getVisaEmployeeRequestEmailContext(staffId).then((result) => {
      if (cancelled) return;
      if (!result.ok) return;
      setCtx({
        row: result.row,
        providers: result.providers,
        venueId: result.venueId,
      });
      refreshRecords(result.venueId);
    });
    return () => {
      cancelled = true;
    };
  }, [staffId, refreshRecords]);

  async function openDialog(batchId: string | null) {
    if (loading) return;
    setLoading(true);
    let next = ctx;
    if (!next) {
      const result = await getVisaEmployeeRequestEmailContext(staffId);
      if (!result.ok) {
        setLoading(false);
        toast.error(result.error);
        return;
      }
      next = {
        row: result.row,
        providers: result.providers,
        venueId: result.venueId,
      };
      setCtx(next);
      refreshRecords(next.venueId);
    }
    setLoading(false);
    setDraftBatchId(batchId);
    setDialogOpen(true);
  }

  function deleteDraft(batchId: string) {
    const venueId = ctx?.venueId;
    if (!venueId) return;
    deleteVisaRequestDraftUnit(venueId, batchId, staffId);
    refreshRecords(venueId);
    toast.saved("Cancelation draft deleted.");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-right text-sm text-black/55">
          Send the PRO cancelation request using the template under Visa request
          emails.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 gap-2"
          disabled={!canSend || loading}
          onClick={() => void openDialog(null)}
        >
          <Mail className="h-4 w-4" aria-hidden />
          {loading ? "Opening…" : "Email visa cancelation"}
        </Button>
      </div>

      {drafts.length > 0 || sends.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
            Email records
          </p>
          <ul className="space-y-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <div className="flex items-start gap-1 rounded-lg border border-amber-200 bg-amber-50/80 pr-1.5 transition hover:border-amber-300 hover:bg-amber-50">
                  <button
                    type="button"
                    onClick={() => void openDialog(draft.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-900">
                      <FileText className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[#3D421F]">
                        Cancelation draft
                      </span>
                      <span className="mt-0.5 block text-xs text-black/50">
                        Saved {formatWhen(draft.savedAt)}
                        {draft.unit.to ? ` · ${draft.unit.to}` : ""}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mt-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-600 transition hover:bg-red-50"
                    aria-label="Delete cancelation draft"
                    onClick={() => deleteDraft(draft.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
            {sends.map((send) => (
              <li key={send.id}>
                <div
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5",
                  )}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                    <Mail className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[#3D421F]">
                      Cancelation sent
                    </span>
                    <span className="mt-0.5 block text-xs text-black/50">
                      {formatWhen(send.sentAt)}
                      {send.to ? ` · ${send.to}` : ""}
                      {send.providerName ? ` · ${send.providerName}` : ""}
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dialogOpen && ctx ? (
        <VisaRequestEmailDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setDialogOpen(false);
              setDraftBatchId(null);
              refreshRecords(ctx.venueId);
            }
          }}
          rows={[ctx.row]}
          providers={ctx.providers}
          venueId={ctx.venueId}
          lockedRequestType="cancel"
          initialDraftBatchId={draftBatchId}
          onSent={() => {
            setDialogOpen(false);
            setDraftBatchId(null);
            refreshRecords(ctx.venueId);
          }}
        />
      ) : null}
    </div>
  );
}
