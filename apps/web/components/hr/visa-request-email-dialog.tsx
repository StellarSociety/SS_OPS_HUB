"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Mail, Paperclip, Save, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  previewVisaRequestEmails,
  sendVisaRequestEmails,
  type VisaRequestEmailPreview,
} from "@/lib/actions/hr-visa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import {
  deleteVisaRequestDraftBatch,
  deleteVisaRequestDraftUnit,
  listVisaRequestDraftBatches,
  upsertVisaRequestDraftBatch,
  type SavedVisaRequestDraftBatch,
} from "@/lib/hr/visa-request-drafts-storage";
import type { VisaEmployeeRow, VisaProProvider } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type DialogStep = "compose" | "preview" | "drafts-list";

type VisaRequestEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: VisaEmployeeRow[];
  providers: VisaProProvider[];
  venueId: string;
  initialStep?: DialogStep;
  onSent: () => void;
  onDraftsChanged?: () => void;
};

function defaultRequestType(
  row: VisaEmployeeRow,
): "issue" | "renew" {
  if (row.status === "missing") return "issue";
  return "renew";
}

function requestTypeLabel(type: "issue" | "renew" | "cancel"): string {
  if (type === "renew") return "Renew";
  if (type === "cancel") return "Cancelation";
  return "Issue";
}

function requestTypeChipClass(type: "issue" | "renew" | "cancel"): string {
  if (type === "renew") return "border-sky-200 bg-sky-100 text-sky-900";
  if (type === "cancel") return "border-red-200 bg-red-100 text-red-900";
  return "border-emerald-200 bg-emerald-100 text-emerald-900";
}

function formatDraftSavedAt(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function draftBatchTypeCounts(batch: SavedVisaRequestDraftBatch) {
  return {
    issue: batch.units.filter((u) => u.requestType === "issue").length,
    renew: batch.units.filter((u) => u.requestType === "renew").length,
    cancel: batch.units.filter((u) => u.requestType === "cancel").length,
  };
}

const providerSelectClass =
  "h-9 w-full rounded-md border border-black/15 bg-white px-2 text-xs font-medium text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

export function VisaRequestEmailDialog({
  open,
  onOpenChange,
  rows,
  providers,
  venueId,
  initialStep = "compose",
  onSent,
  onDraftsChanged,
}: VisaRequestEmailDialogProps) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<DialogStep>(initialStep);
  const [requestTypes, setRequestTypes] = useState<
    Record<string, "issue" | "renew" | "cancel">
  >({});
  const [previews, setPreviews] = useState<VisaRequestEmailPreview[]>([]);
  const [activeStaffId, setActiveStaffId] = useState<string | null>(null);
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);
  const [savedBatches, setSavedBatches] = useState<
    SavedVisaRequestDraftBatch[]
  >([]);

  const activeProviders = useMemo(
    () =>
      providers
        .filter((p) => !p.archived_at)
        .sort(
          (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
        ),
    [providers],
  );

  function refreshSavedBatches() {
    setSavedBatches(listVisaRequestDraftBatches(venueId));
    onDraftsChanged?.();
  }

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setPreviews([]);
    setActiveStaffId(null);
    setSavedBatchId(null);
    setSavedBatches(listVisaRequestDraftBatches(venueId));
    const next: Record<string, "issue" | "renew" | "cancel"> = {};
    for (const row of rows) {
      next[row.staff.id] = defaultRequestType(row);
    }
    setRequestTypes(next);
  }, [open, rows, venueId, initialStep]);

  const active =
    previews.find((p) => p.staffId === activeStaffId) ?? previews[0] ?? null;

  const showSidePanel = step === "preview" && previews.length > 0;
  const hasMissingAttachments =
    active?.attachments?.some((a) => !a.ok) ?? false;
  const attachmentGap =
    Boolean(active?.requireAttachments) && hasMissingAttachments;
  const blockedDraftCount = previews.filter(
    (p) =>
      p.requireAttachments && (p.attachments?.some((a) => !a.ok) ?? false),
  ).length;

  const requestTypeGroups = useMemo(() => {
    const issue = previews
      .filter((p) => p.requestType === "issue")
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    const renew = previews
      .filter((p) => p.requestType === "renew")
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    const cancel = previews
      .filter((p) => p.requestType === "cancel")
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    return [
      { id: "issue" as const, label: "Issuing", entries: issue },
      { id: "renew" as const, label: "Renewing", entries: renew },
      { id: "cancel" as const, label: "Canceling", entries: cancel },
    ].filter((g) => g.entries.length > 0);
  }, [previews]);

  if (!open || typeof document === "undefined") return null;

  function applyProviderToDrafts(staffIds: string[], providerId: string) {
    const provider = activeProviders.find((p) => p.id === providerId) ?? null;
    setPreviews((prev) =>
      prev.map((p) => {
        if (!staffIds.includes(p.staffId)) return p;
        return {
          ...p,
          providerId: provider?.id ?? null,
          providerName: provider?.name ?? "",
          to: provider?.contact_email?.trim() || p.to,
        };
      }),
    );
  }

  function handlePreview() {
    startTransition(async () => {
      const result = await previewVisaRequestEmails({
        units: rows.map((row) => ({
          staffId: row.staff.id,
          requestType: requestTypes[row.staff.id] ?? defaultRequestType(row),
          providerId: row.providerId,
        })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPreviews(result.previews);
      setActiveStaffId(result.previews[0]?.staffId ?? null);
      setSavedBatchId(null);
      setStep("preview");
    });
  }

  function handleSaveDraft() {
    if (previews.length === 0) {
      toast.error("Nothing to save — preview drafts first.");
      return;
    }
    const batchId = savedBatchId ?? crypto.randomUUID();
    upsertVisaRequestDraftBatch(venueId, {
      id: batchId,
      savedAt: new Date().toISOString(),
      units: previews.map((p) => ({
        staffId: p.staffId,
        empNo: p.empNo,
        fullName: p.fullName,
        requestType: p.requestType,
        providerId: p.providerId,
        providerName: p.providerName,
        to: p.to,
        subject: p.subject,
        body: p.body,
      })),
    });
    setSavedBatchId(batchId);
    refreshSavedBatches();
    toast.saved(
      `Saved ${previews.length} draft${previews.length === 1 ? "" : "s"}.`,
    );
  }

  function applyBatchToPreview(batch: SavedVisaRequestDraftBatch) {
    startTransition(async () => {
      const result = await previewVisaRequestEmails({
        units: batch.units.map((u) => ({
          staffId: u.staffId,
          requestType: u.requestType,
          providerId: u.providerId,
          to: u.to,
          subject: u.subject,
          body: u.body,
        })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Keep draft edits; refresh attachment status from WorkDrive.
      const byStaff = new Map(result.previews.map((p) => [p.staffId, p]));
      const next: VisaRequestEmailPreview[] = batch.units.map((u) => {
        const fresh = byStaff.get(u.staffId);
        return {
          staffId: u.staffId,
          empNo: u.empNo,
          fullName: u.fullName,
          requestType: u.requestType,
          providerId: u.providerId,
          providerName: u.providerName,
          to: u.to,
          subject: u.subject,
          body: u.body,
          attachments: fresh?.attachments ?? [],
          requireAttachments: fresh?.requireAttachments ?? true,
        };
      });
      setPreviews(next);
      setActiveStaffId(next[0]?.staffId ?? null);
      setSavedBatchId(batch.id);
      setStep("preview");
    });
  }

  function handleDeleteBatch(batchId: string) {
    deleteVisaRequestDraftBatch(venueId, batchId);
    if (savedBatchId === batchId) setSavedBatchId(null);
    refreshSavedBatches();
  }

  function handleSend() {
    startTransition(async () => {
      const result = await sendVisaRequestEmails({
        units: previews.map((p) => ({
          staffId: p.staffId,
          requestType: p.requestType,
          providerId: p.providerId,
          to: p.to,
          subject: p.subject,
          body: p.body,
        })),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (savedBatchId) {
        deleteVisaRequestDraftBatch(venueId, savedBatchId);
        setSavedBatchId(null);
        refreshSavedBatches();
      }
      toast.saved(
        result.sent === 1
          ? "Visa request email sent."
          : `${result.sent} visa request emails sent.`,
      );
      onSent();
      onOpenChange(false);
    });
  }

  function handleDeleteDraft(staffId: string) {
    setPreviews((prev) => {
      const next = prev.filter((p) => p.staffId !== staffId);
      setActiveStaffId((current) => {
        if (current !== staffId) return current;
        return next[0]?.staffId ?? null;
      });
      if (savedBatchId) {
        const nextBatch = deleteVisaRequestDraftUnit(
          venueId,
          savedBatchId,
          staffId,
        );
        refreshSavedBatches();
        if (!nextBatch) {
          setSavedBatchId(null);
          if (next.length === 0) setStep("drafts-list");
        }
      } else if (next.length === 0) {
        setStep("compose");
      }
      return next;
    });
  }

  function updateActive(
    patch: Partial<
      Pick<
        VisaRequestEmailPreview,
        "to" | "subject" | "body" | "providerId" | "providerName"
      >
    >,
  ) {
    if (!active) return;
    const id = active.staffId;
    setPreviews((prev) =>
      prev.map((p) => (p.staffId === id ? { ...p, ...patch } : p)),
    );
  }

  function handleActiveProviderChange(providerId: string) {
    const provider = activeProviders.find((p) => p.id === providerId) ?? null;
    updateActive({
      providerId: provider?.id ?? null,
      providerName: provider?.name ?? "",
      to: provider?.contact_email?.trim() || "",
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        className={cn(
          "flex w-full items-stretch gap-3",
          "h-[min(90vh,52rem)]",
          showSidePanel ? "max-w-5xl flex-row-reverse" : "max-w-3xl",
        )}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="visa-request-email-title"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
            <div>
              <h2
                id="visa-request-email-title"
                className="font-nav text-base font-semibold text-[#3D421F]"
              >
                {step === "drafts-list"
                  ? "Saved visa drafts"
                  : "Email visa request"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {step === "drafts-list"
                  ? "Reopen a saved batch to edit or send provider requests."
                  : step === "preview" && active
                    ? `${requestTypeLabel(active.requestType)} · ${active.fullName} (${active.empNo})`
                    : "Issue or renew medical visa with the provider."}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
              disabled={pending}
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {step === "drafts-list" ? (
              <div className="space-y-3">
                {savedBatches.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-black/15 px-4 py-12 text-center text-sm text-black/45">
                    No saved drafts yet. Preview a request and tap Save draft.
                  </div>
                ) : (
                  savedBatches.map((batch) => {
                    const counts = draftBatchTypeCounts(batch);
                    const providers = [
                      ...new Set(
                        batch.units
                          .map((u) => u.providerName.trim())
                          .filter(Boolean),
                      ),
                    ];
                    const recipients = [
                      ...new Set(
                        batch.units
                          .map((u) => u.to.trim())
                          .filter(Boolean),
                      ),
                    ];
                    const names = batch.units.map((u) => u.fullName.trim());
                    const single = batch.units.length === 1 ? batch.units[0] : null;
                    const namePreview =
                      names.length <= 3
                        ? names.join(", ")
                        : `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;

                    return (
                      <div
                        key={batch.id}
                        className="flex items-start gap-2 rounded-xl border border-black/10 bg-black/[0.015] p-3"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition hover:bg-white"
                          onClick={() => applyBatchToPreview(batch)}
                          disabled={pending}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(
                              [
                                ["issue", counts.issue],
                                ["renew", counts.renew],
                                ["cancel", counts.cancel],
                              ] as const
                            )
                              .filter(([, n]) => n > 0)
                              .map(([type, n]) => (
                                <span
                                  key={type}
                                  className={cn(
                                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                    requestTypeChipClass(type),
                                  )}
                                >
                                  {requestTypeLabel(type)}
                                  {batch.units.length > 1 ? ` · ${n}` : ""}
                                </span>
                              ))}
                            <span className="text-[11px] text-black/40">
                              {batch.units.length} draft
                              {batch.units.length === 1 ? "" : "s"}
                            </span>
                          </div>

                          {single ? (
                            <>
                              <p className="mt-2 text-sm font-medium text-[#3D421F]">
                                {single.fullName}
                                {single.empNo ? (
                                  <span className="ml-1.5 font-normal text-black/40">
                                    {single.empNo}
                                  </span>
                                ) : null}
                              </p>
                              <p className="mt-1 truncate text-xs text-black/55">
                                {single.providerName.trim() ||
                                  "No provider selected"}
                                {single.to.trim()
                                  ? ` · ${single.to.trim()}`
                                  : ""}
                              </p>
                              {single.subject.trim() ? (
                                <p className="mt-1 truncate text-xs text-black/45">
                                  {single.subject.trim()}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <p className="mt-2 text-sm font-medium text-[#3D421F]">
                                {namePreview}
                              </p>
                              <p className="mt-1 truncate text-xs text-black/55">
                                {providers.length > 0
                                  ? providers.join(", ")
                                  : "No provider selected"}
                                {recipients.length === 1
                                  ? ` · ${recipients[0]}`
                                  : recipients.length > 1
                                    ? ` · ${recipients.length} recipients`
                                    : ""}
                              </p>
                              {(() => {
                                const subjects = [
                                  ...new Set(
                                    batch.units
                                      .map((u) => u.subject.trim())
                                      .filter(Boolean),
                                  ),
                                ];
                                if (subjects.length === 0) return null;
                                return (
                                  <p className="mt-1 truncate text-xs text-black/45">
                                    {subjects.length === 1
                                      ? subjects[0]
                                      : `${subjects.length} different subjects`}
                                  </p>
                                );
                              })()}
                            </>
                          )}

                          <p className="mt-2 text-[11px] text-black/40">
                            Saved {formatDraftSavedAt(batch.savedAt)}
                          </p>
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-red-600 transition hover:bg-red-50"
                          aria-label="Delete draft batch"
                          onClick={() => handleDeleteBatch(batch.id)}
                          disabled={pending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            ) : step === "compose" ? (
              <div className="space-y-3">
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Select employees first.
                  </p>
                ) : (
                  rows.map((row) => {
                    const type =
                      requestTypes[row.staff.id] ?? defaultRequestType(row);
                    return (
                      <div
                        key={row.staff.id}
                        className="flex flex-col gap-2 rounded-lg border border-black/10 bg-[#f7f7f2] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-[#3D421F]">
                            {row.staff.full_name}
                          </p>
                          <p className="text-xs text-black/45">
                            Emp. {row.staff.emp_no}
                            {row.visaStatus ? ` · ${row.visaStatus}` : ""}
                            {row.providerName ? ` · ${row.providerName}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-1 rounded-lg border border-black/10 bg-white p-1">
                          {(["issue", "renew"] as const).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() =>
                                setRequestTypes((prev) => ({
                                  ...prev,
                                  [row.staff.id]: opt,
                                }))
                              }
                              className={cn(
                                "rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
                                type === opt
                                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                                  : "text-black/50 hover:bg-black/5 hover:text-[#3D421F]",
                              )}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : active ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="visa-email-request-type">Request</Label>
                    <p
                      id="visa-email-request-type"
                      className="flex h-10 items-center rounded-md border border-black/10 bg-[#f7f7f2] px-3 text-sm text-[#3D421F]"
                    >
                      {requestTypeLabel(active.requestType)}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="visa-email-provider">Provider</Label>
                    <select
                      id="visa-email-provider"
                      className={cn(providerSelectClass, "h-10 text-sm")}
                      value={active.providerId ?? ""}
                      onChange={(e) =>
                        handleActiveProviderChange(e.target.value)
                      }
                      disabled={pending || activeProviders.length === 0}
                    >
                      <option value="">Select provider…</option>
                      {activeProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.contact_email.trim()
                            ? ` · ${p.contact_email}`
                            : " · no email"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-xs",
                    active.attachments?.length === 0
                      ? "border-black/10 bg-black/[0.02] text-black/55"
                      : attachmentGap
                        ? "border-red-200 bg-red-50 text-red-950"
                        : hasMissingAttachments
                          ? "border-amber-200 bg-amber-50/80 text-amber-950"
                          : "border-emerald-200 bg-emerald-50/70 text-emerald-900",
                  )}
                >
                  <p className="flex items-center gap-1.5 font-medium">
                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                    Attachments from WorkDrive
                    {!active.requireAttachments &&
                    (active.attachments?.length ?? 0) > 0 ? (
                      <span className="font-normal text-black/45">
                        (optional)
                      </span>
                    ) : null}
                  </p>
                  {active.attachments?.length === 0 ? (
                    <p className="mt-1.5 text-[11px] leading-snug text-black/45">
                      No documents configured for{" "}
                      {requestTypeLabel(active.requestType).toLowerCase()}{" "}
                      emails. Choose them under HR → Settings → Emails → Visa
                      request.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {(active.attachments ?? []).map((a) => (
                        <li
                          key={a.key}
                          className="flex items-start justify-between gap-2"
                        >
                          {a.ok ? (
                            <span
                              className="min-w-0 break-all text-emerald-900"
                              title={a.fileName ?? undefined}
                            >
                              {a.label}:{" "}
                              <span className="font-medium text-emerald-950">
                                {a.fileName}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  "font-medium",
                                  active.requireAttachments
                                    ? "text-red-950"
                                    : "text-amber-950",
                                )}
                              >
                                {a.label}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white",
                                  active.requireAttachments
                                    ? "bg-red-600"
                                    : "bg-amber-600",
                                )}
                              >
                                Missing
                              </span>
                              <span
                                className={
                                  active.requireAttachments
                                    ? "text-red-800/80"
                                    : "text-amber-800/80"
                                }
                              >
                                {active.requireAttachments
                                  ? "Upload before sending"
                                  : "Will be skipped"}
                              </span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="visa-email-to">To</Label>
                    <Input
                      id="visa-email-to"
                      type="email"
                      value={active.to}
                      onChange={(e) => updateActive({ to: e.target.value })}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="visa-email-subject">Subject</Label>
                    <Input
                      id="visa-email-subject"
                      value={active.subject}
                      onChange={(e) =>
                        updateActive({ subject: e.target.value })
                      }
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Message</Label>
                    <EmailMessageEditor
                      value={active.body}
                      onChange={(body) => updateActive({ body })}
                      disabled={pending}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex justify-between gap-2 border-t border-black/10 px-5 py-4">
            <div>
              {step === "preview" ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    setStep(savedBatchId ? "drafts-list" : "compose")
                  }
                >
                  Back
                </Button>
              ) : step === "drafts-list" && rows.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setSavedBatchId(null);
                    setPreviews([]);
                    setStep("compose");
                  }}
                >
                  New request
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => onOpenChange(false)}
              >
                {step === "drafts-list" ? "Close" : "Cancel"}
              </Button>
              {step === "compose" ? (
                <Button
                  type="button"
                  disabled={pending || rows.length === 0}
                  onClick={handlePreview}
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Mail className="h-4 w-4" aria-hidden />
                  )}
                  Preview
                </Button>
              ) : step === "preview" ? (
                <>
                  <button
                    type="button"
                    disabled={pending || previews.length === 0}
                    onClick={handleSaveDraft}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-[#3D421F] shadow-sm transition hover:bg-black/[0.03] disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    Save draft
                  </button>
                  <Button
                    type="button"
                    disabled={
                      pending || previews.length === 0 || blockedDraftCount > 0
                    }
                    onClick={handleSend}
                    title={
                      blockedDraftCount > 0
                        ? "Fix missing required attachments before sending"
                        : undefined
                    }
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Mail className="h-4 w-4" aria-hidden />
                    )}
                    Send {previews.length} email
                    {previews.length === 1 ? "" : "s"}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {showSidePanel ? (
          <aside
            className="flex w-[min(100%,17.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
            aria-label="Drafts by request type"
          >
            <div className="border-b border-black/10 px-3.5 py-3">
              <p className="font-nav text-sm font-semibold text-[#3D421F]">
                By request
              </p>
              <p className="mt-0.5 text-[11px] text-black/45">
                {previews.length} draft{previews.length === 1 ? "" : "s"} ·
                choose provider per group
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {requestTypeGroups.length === 0 ? (
                <p className="px-3.5 py-4 text-xs text-black/45">
                  No visa drafts.
                </p>
              ) : (
                requestTypeGroups.map((group, index) => {
                  const providerIds = [
                    ...new Set(
                      group.entries
                        .map((e) => e.providerId)
                        .filter((id): id is string => Boolean(id)),
                    ),
                  ];
                  const sharedProviderId =
                    providerIds.length === 1 ? providerIds[0] : "";
                  return (
                    <div
                      key={group.id}
                      className={cn(index > 0 && "border-t border-black/10")}
                    >
                      <div className="space-y-2 bg-[var(--venue-secondary,#F0F3DD)]/45 px-3 py-2.5">
                        <div className="text-center">
                          <p className="text-sm font-semibold text-[#3D421F]">
                            {group.label}
                          </p>
                          <p className="mt-0.5 text-[11px] text-black/45">
                            {group.entries.length} email
                            {group.entries.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <select
                          className={providerSelectClass}
                          value={sharedProviderId}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            applyProviderToDrafts(
                              group.entries.map((entry) => entry.staffId),
                              value,
                            );
                          }}
                          disabled={pending || activeProviders.length === 0}
                          aria-label={`Provider for ${group.label.toLowerCase()} emails`}
                        >
                          <option value="">
                            {sharedProviderId
                              ? "Change provider…"
                              : providerIds.length > 1
                                ? "Multiple providers — set all…"
                                : "Select provider…"}
                          </option>
                          {activeProviders.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <ul className="px-2 py-1.5">
                        {group.entries.map((p) => {
                          const isActive =
                            (active?.staffId ?? "") === p.staffId;
                          return (
                            <li
                              key={p.staffId}
                              className="flex items-stretch gap-0.5"
                            >
                              <button
                                type="button"
                                onClick={() => setActiveStaffId(p.staffId)}
                                className={cn(
                                  "min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition",
                                  isActive
                                    ? "bg-[var(--venue-primary,#818a40)] text-white"
                                    : "text-[#3D421F] hover:bg-black/[0.04]",
                                )}
                              >
                                <span className="block truncate text-xs font-medium">
                                  {p.fullName}
                                </span>
                                <span
                                  className={cn(
                                    "block truncate text-[10px]",
                                    isActive
                                      ? "text-white/75"
                                      : "text-black/40",
                                  )}
                                >
                                  {p.empNo}
                                  {p.providerName.trim()
                                    ? ` · ${p.providerName}`
                                    : " · no provider"}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDraft(p.staffId)}
                                disabled={pending}
                                aria-label={`Delete draft for ${p.fullName}`}
                                className={cn(
                                  "inline-flex w-7 shrink-0 items-center justify-center rounded-md transition",
                                  isActive
                                    ? "bg-white/95 text-red-600 shadow-sm hover:bg-white hover:text-red-700"
                                    : "text-black/35 hover:bg-red-50 hover:text-red-600",
                                )}
                              >
                                <Trash2
                                  className="h-3.5 w-3.5"
                                  strokeWidth={2.25}
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })
              )}
            </div>
            <div className="shrink-0 space-y-2 border-t border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 px-3 py-3">
              {blockedDraftCount > 0 ? (
                <p className="text-[11px] leading-snug text-red-700">
                  {blockedDraftCount} draft
                  {blockedDraftCount === 1 ? "" : "s"} missing required
                  attachments
                </p>
              ) : null}
              <button
                type="button"
                disabled={pending || previews.length === 0}
                onClick={handleSaveDraft}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-[#3D421F] shadow-sm transition hover:bg-black/[0.03] disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save draft
              </button>
              <Button
                type="button"
                disabled={
                  pending || previews.length === 0 || blockedDraftCount > 0
                }
                onClick={handleSend}
                className="h-9 w-full gap-2 px-3 text-sm shadow-sm"
                title={
                  blockedDraftCount > 0
                    ? "Fix missing required attachments before sending"
                    : undefined
                }
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Send all emails
                    {previews.length > 0 ? ` (${previews.length})` : ""}
                  </>
                )}
              </Button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
