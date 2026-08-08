"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, Mail, Save, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  previewInsuranceRequestEmails,
  sendInsuranceRequestEmails,
  type InsuranceRequestEmailPreview,
} from "@/lib/actions/hr-insurance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import {
  deleteInsuranceRequestDraftBatch,
  deleteInsuranceRequestDraftUnit,
  formatInsuranceDraftBatchSummary,
  listInsuranceRequestDraftBatches,
  upsertInsuranceRequestDraftBatch,
  type SavedInsuranceRequestDraftBatch,
} from "@/lib/hr/insurance-request-drafts-storage";
import type { InsuranceEmployeeRow, InsuranceProvider } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type DialogStep = "compose" | "preview" | "drafts-list";

type InsuranceRequestEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: InsuranceEmployeeRow[];
  providers: InsuranceProvider[];
  venueId: string;
  initialStep?: DialogStep;
  onSent: () => void;
  onDraftsChanged?: () => void;
};

function defaultRequestType(
  row: InsuranceEmployeeRow,
): "issue" | "renew" {
  if (row.status === "missing") return "issue";
  return "renew";
}

function requestTypeLabel(type: "issue" | "renew"): string {
  return type === "issue" ? "Issue" : "Renew";
}

const providerSelectClass =
  "h-9 w-full rounded-md border border-black/15 bg-white px-2 text-xs font-medium text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

export function InsuranceRequestEmailDialog({
  open,
  onOpenChange,
  rows,
  providers,
  venueId,
  initialStep = "compose",
  onSent,
  onDraftsChanged,
}: InsuranceRequestEmailDialogProps) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<DialogStep>(initialStep);
  const [requestTypes, setRequestTypes] = useState<
    Record<string, "issue" | "renew">
  >({});
  const [previews, setPreviews] = useState<InsuranceRequestEmailPreview[]>([]);
  const [activeStaffId, setActiveStaffId] = useState<string | null>(null);
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);
  const [savedBatches, setSavedBatches] = useState<
    SavedInsuranceRequestDraftBatch[]
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
    setSavedBatches(listInsuranceRequestDraftBatches(venueId));
    onDraftsChanged?.();
  }

  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setPreviews([]);
    setActiveStaffId(null);
    setSavedBatchId(null);
    setSavedBatches(listInsuranceRequestDraftBatches(venueId));
    const next: Record<string, "issue" | "renew"> = {};
    for (const row of rows) {
      next[row.staff.id] = defaultRequestType(row);
    }
    setRequestTypes(next);
  }, [open, rows, venueId, initialStep]);

  const active =
    previews.find((p) => p.staffId === activeStaffId) ?? previews[0] ?? null;

  const showSidePanel = step === "preview" && previews.length > 0;

  const requestTypeGroups = useMemo(() => {
    const issue = previews
      .filter((p) => p.requestType === "issue")
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    const renew = previews
      .filter((p) => p.requestType === "renew")
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    return [
      { id: "issue" as const, label: "Issuing", entries: issue },
      { id: "renew" as const, label: "Renewing", entries: renew },
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
      const result = await previewInsuranceRequestEmails({
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
    upsertInsuranceRequestDraftBatch(venueId, {
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

  function applyBatchToPreview(batch: SavedInsuranceRequestDraftBatch) {
    const next: InsuranceRequestEmailPreview[] = batch.units.map((u) => ({
      staffId: u.staffId,
      empNo: u.empNo,
      fullName: u.fullName,
      requestType: u.requestType,
      providerId: u.providerId,
      providerName: u.providerName,
      to: u.to,
      subject: u.subject,
      body: u.body,
    }));
    setPreviews(next);
    setActiveStaffId(next[0]?.staffId ?? null);
    setSavedBatchId(batch.id);
    setStep("preview");
  }

  function handleDeleteBatch(batchId: string) {
    deleteInsuranceRequestDraftBatch(venueId, batchId);
    if (savedBatchId === batchId) setSavedBatchId(null);
    refreshSavedBatches();
  }

  function handleSend() {
    startTransition(async () => {
      const result = await sendInsuranceRequestEmails({
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
        deleteInsuranceRequestDraftBatch(venueId, savedBatchId);
        setSavedBatchId(null);
        refreshSavedBatches();
      }
      toast.saved(
        result.sent === 1
          ? "Insurance request email sent."
          : `${result.sent} insurance request emails sent.`,
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
        const nextBatch = deleteInsuranceRequestDraftUnit(
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
        InsuranceRequestEmailPreview,
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
          aria-labelledby="insurance-request-email-title"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
            <div>
              <h2
                id="insurance-request-email-title"
                className="font-nav text-base font-semibold text-[#3D421F]"
              >
                {step === "drafts-list"
                  ? "Saved insurance drafts"
                  : "Email insurance request"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {step === "drafts-list"
                  ? "Reopen a saved batch to edit or send provider requests."
                  : step === "preview" && active
                    ? `${requestTypeLabel(active.requestType)} · ${active.fullName} (${active.empNo})`
                    : "Issue or renew medical insurance with the provider."}
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
                  savedBatches.map((batch) => (
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
                        <p className="text-sm font-medium text-[#3D421F]">
                          {formatInsuranceDraftBatchSummary(batch)}
                        </p>
                        <p className="mt-1 truncate text-xs text-black/45">
                          {[
                            ...new Set(
                              batch.units
                                .map((u) => u.providerName.trim())
                                .filter(Boolean),
                            ),
                          ].join(", ") || "No provider selected"}
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
                  ))
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
                            {row.category ? ` · ${row.category}` : ""}
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
                    <Label htmlFor="ins-email-request-type">Request</Label>
                    <p
                      id="ins-email-request-type"
                      className="flex h-10 items-center rounded-md border border-black/10 bg-[#f7f7f2] px-3 text-sm text-[#3D421F]"
                    >
                      {requestTypeLabel(active.requestType)}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ins-email-provider">Provider</Label>
                    <select
                      id="ins-email-provider"
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
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ins-email-to">To</Label>
                    <Input
                      id="ins-email-to"
                      type="email"
                      value={active.to}
                      onChange={(e) => updateActive({ to: e.target.value })}
                      disabled={pending}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ins-email-subject">Subject</Label>
                    <Input
                      id="ins-email-subject"
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
                    disabled={pending || previews.length === 0}
                    onClick={handleSend}
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
                  No insurance drafts.
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
                disabled={pending || previews.length === 0}
                onClick={handleSend}
                className="h-9 w-full gap-2 px-3 text-sm shadow-sm"
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
