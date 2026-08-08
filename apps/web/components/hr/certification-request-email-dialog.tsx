"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChangeEvent } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Paperclip,
  Save,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  previewCertificationRequestEmails,
  refreshCertificationIdentityAttachments,
  sendCertificationRequestEmails,
  type CertificationRequestEmailPreview,
  type CertificationRequestEmailSelection,
} from "@/lib/actions/hr-certifications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { formatDateOnly } from "@/lib/hr/derived";
import {
  deleteCertRequestDraftBatch,
  deleteCertRequestDraftUnit,
  formatDraftBatchSummary,
  listCertRequestDraftBatches,
  upsertCertRequestDraftBatch,
  type SavedCertRequestDraftBatch,
} from "@/lib/hr/certification-request-drafts-storage";
import { uploadStaffDocumentViaApi } from "@/lib/hr/workdrive/client-upload";
import {
  emailStaffDocumentOption,
  labelForEmailStaffDocumentKey,
  type HrEmailStaffDocumentKey,
} from "@/lib/hr/email-staff-documents";
import type {
  CertificationStatus,
  CertificationType,
  HrWorkDriveDocKind,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const SEND_STEPS = [
  "Gathering attachments…",
  "Connecting to mail…",
  "Delivering provider requests…",
  "Confirming delivery…",
] as const;

type SendPhase = "idle" | "sending" | "success" | "error";

type StaffCertSummary = {
  certificationId: string;
  certifiedAt: string | null;
  expiresAt: string | null;
  status: CertificationStatus;
};

type StaffOption = {
  id: string;
  fullName: string;
  empNo: string;
  workEmail: string | null;
  personalEmail: string | null;
  /** Pre-checked certs for this employee (e.g. missing / expiring / expired). */
  suggestedCertificationIds?: string[];
  certifications?: StaffCertSummary[];
};

type DialogStep = "compose" | "preview" | "drafts-list";

type CertificationRequestEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  staff: StaffOption[];
  types: CertificationType[];
  /** Open straight to saved drafts list. */
  initialStep?: DialogStep;
  onSent: () => void;
  onDraftsChanged?: () => void;
};

function buildInitialSelections(
  staff: StaffOption[],
): Record<string, Set<string>> {
  const next: Record<string, Set<string>> = {};
  for (const s of staff) {
    next[s.id] = new Set();
  }
  return next;
}

function typeLabel(cert: CertificationType): string {
  return cert.label.trim() || cert.name;
}

function staffDocumentUploadTarget(key: HrEmailStaffDocumentKey): {
  docKind: HrWorkDriveDocKind;
  fileSlotId?: string;
} | null {
  const opt = emailStaffDocumentOption(key);
  if (!opt) return null;
  return {
    docKind: opt.kind,
    ...(opt.slotId ? { fileSlotId: opt.slotId } : {}),
  };
}

function dateStatusClass(status: CertificationStatus | undefined): string {
  switch (status) {
    case "valid":
      return "text-emerald-700";
    case "expiring":
      return "text-amber-700";
    case "expired":
      return "text-red-700";
    default:
      return "text-black/40";
  }
}

function batchToPreviews(
  batch: SavedCertRequestDraftBatch,
): CertificationRequestEmailPreview[] {
  return batch.units.map((u) => ({
    id: u.id,
    staffId: u.staffId,
    empNo: u.empNo,
    employeeName: u.employeeName,
    to: u.to,
    providerCompany: u.providerCompany,
    providerContact: u.providerContact,
    subject: u.subject,
    body: u.body,
    certificationNames: u.certificationNames,
    attachments: u.attachments,
  }));
}

function selectionsFromPreviews(
  previews: CertificationRequestEmailPreview[],
  types: CertificationType[],
): CertificationRequestEmailSelection[] {
  const byStaff = new Map<string, Set<string>>();
  for (const p of previews) {
    const set = byStaff.get(p.staffId) ?? new Set<string>();
    for (const name of p.certificationNames) {
      const match = types.find(
        (t) =>
          t.name === name ||
          typeLabel(t) === name ||
          t.name.toLowerCase() === name.toLowerCase(),
      );
      if (match) set.add(match.id);
    }
    byStaff.set(p.staffId, set);
  }
  return [...byStaff.entries()].map(([staffId, ids]) => ({
    staffId,
    certificationIds: [...ids],
  }));
}

export function CertificationRequestEmailDialog({
  open,
  onOpenChange,
  venueId,
  staff,
  types,
  initialStep = "compose",
  onSent,
  onDraftsChanged,
}: CertificationRequestEmailDialogProps) {
  const [pending, startTransition] = useTransition();
  const [selectionByStaff, setSelectionByStaff] = useState<
    Record<string, Set<string>>
  >(() => buildInitialSelections(staff));
  const [step, setStep] = useState<DialogStep>(initialStep);
  const [previews, setPreviews] = useState<CertificationRequestEmailPreview[]>(
    [],
  );
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { to: string; subject: string; body: string }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);
  const [savedBatches, setSavedBatches] = useState<SavedCertRequestDraftBatch[]>(
    [],
  );
  const [uploadingAttachmentKey, setUploadingAttachmentKey] = useState<
    HrEmailStaffDocumentKey | null
  >(null);
  const [requireAttachments, setRequireAttachments] = useState(true);
  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  const [sendStepIndex, setSendStepIndex] = useState(0);
  const identityFileInputRef = useRef<HTMLInputElement>(null);
  const pendingIdentityUploadKey = useRef<HrEmailStaffDocumentKey | null>(null);

  useEffect(() => {
    if (!open) {
      setSendPhase("idle");
      setSendStepIndex(0);
      return;
    }
    setSavedBatches(listCertRequestDraftBatches(venueId));
  }, [open, venueId]);

  useEffect(() => {
    if (sendPhase !== "sending") return;
    const timer = window.setInterval(() => {
      setSendStepIndex((prev) =>
        prev >= SEND_STEPS.length - 1 ? prev : prev + 1,
      );
    }, 700);
    return () => window.clearInterval(timer);
  }, [sendPhase]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sendPhase === "sending" || sendPhase === "success") return;
      if (sendPhase === "error") {
        setSendPhase("idle");
        setSendStepIndex(0);
        return;
      }
      if (pending) return;
      onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, sendPhase, onOpenChange]);

  const selectionsPayload = useMemo((): CertificationRequestEmailSelection[] => {
    return staff
      .map((s) => ({
        staffId: s.id,
        certificationIds: [...(selectionByStaff[s.id] ?? [])],
      }))
      .filter((row) => row.certificationIds.length > 0);
  }, [staff, selectionByStaff]);

  const recipientsWithCerts = selectionsPayload.length;
  const canPreview = recipientsWithCerts > 0;

  const activePreview = useMemo(
    () => previews.find((p) => p.id === activePreviewId) ?? previews[0],
    [previews, activePreviewId],
  );

  const activeDraft = activePreview
    ? drafts[activePreview.id] ?? {
        to: activePreview.to,
        subject: activePreview.subject,
        body: activePreview.body,
      }
    : null;

  const hasMissingAttachments =
    activePreview?.attachments.some((a) => !a.ok) ?? false;
  const attachmentGap = requireAttachments && hasMissingAttachments;

  const previewIndex = useMemo(() => {
    if (!activePreview) return -1;
    return previews.findIndex((p) => p.id === activePreview.id);
  }, [previews, activePreview]);

  const blockedDraftCount = useMemo(
    () =>
      requireAttachments
        ? previews.filter((p) => p.attachments.some((a) => !a.ok)).length
        : 0,
    [previews, requireAttachments],
  );

  const certPreviewGroups = useMemo(() => {
    return types
      .map((t) => {
        const label = typeLabel(t);
        const entries = previews.filter((p) =>
          p.certificationNames.some(
            (n) =>
              n === label ||
              n === t.name ||
              n.toLowerCase() === label.toLowerCase(),
          ),
        );
        return {
          id: t.id,
          label,
          providerCompany: t.provider_company.trim(),
          entries,
        };
      })
      .filter((g) => g.entries.length > 0);
  }, [types, previews]);

  if (!open || typeof document === "undefined") return null;

  function refreshSavedBatches() {
    setSavedBatches(listCertRequestDraftBatches(venueId));
    onDraftsChanged?.();
  }

  function applyBatchToPreview(batch: SavedCertRequestDraftBatch) {
    const nextPreviews = batchToPreviews(batch);
    const nextDrafts: Record<
      string,
      { to: string; subject: string; body: string }
    > = {};
    for (const u of batch.units) {
      nextDrafts[u.id] = {
        to: u.to,
        subject: u.subject,
        body: u.body,
      };
    }
    const nextSelections: Record<string, Set<string>> = {};
    for (const sel of batch.selections) {
      nextSelections[sel.staffId] = new Set(sel.certificationIds);
    }
    setSelectionByStaff(nextSelections);
    setPreviews(nextPreviews);
    setDrafts(nextDrafts);
    setActivePreviewId(nextPreviews[0]?.id ?? null);
    setSavedBatchId(batch.id);
    setStep("preview");
    setError(null);

    startTransition(async () => {
      if (batch.selections.length === 0) return;
      const result = await previewCertificationRequestEmails({
        selections: batch.selections,
      });
      if (!result.ok) return;
      setRequireAttachments(result.requireAttachments);
      setPreviews(
        result.previews.map((fresh) => {
          const draft = nextDrafts[fresh.id];
          return {
            ...fresh,
            to: draft?.to ?? fresh.to,
            subject: draft?.subject ?? fresh.subject,
            body: draft?.body ?? fresh.body,
          };
        }),
      );
      setDrafts((prev) => {
        const merged = { ...prev };
        for (const p of result.previews) {
          if (!merged[p.id]) {
            merged[p.id] = {
              to: p.to,
              subject: p.subject,
              body: p.body,
            };
          }
        }
        return merged;
      });
      setActivePreviewId((current) =>
        result.previews.some((p) => p.id === current)
          ? current
          : (result.previews[0]?.id ?? null),
      );
    });
  }

  function toggleCert(staffId: string, certId: string) {
    setSelectionByStaff((prev) => {
      const current = new Set(prev[staffId] ?? []);
      if (current.has(certId)) current.delete(certId);
      else current.add(certId);
      return { ...prev, [staffId]: current };
    });
  }

  function setAllForStaff(staffId: string, checked: boolean) {
    setSelectionByStaff((prev) => ({
      ...prev,
      [staffId]: checked ? new Set(types.map((t) => t.id)) : new Set(),
    }));
  }

  function handlePreview() {
    setError(null);
    startTransition(async () => {
      const result = await previewCertificationRequestEmails({
        selections: selectionsPayload,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const nextDrafts: Record<
        string,
        { to: string; subject: string; body: string }
      > = {};
      for (const p of result.previews) {
        nextDrafts[p.id] = {
          to: p.to,
          subject: p.subject,
          body: p.body,
        };
      }
      setRequireAttachments(result.requireAttachments);
      setDrafts(nextDrafts);
      setPreviews(result.previews);
      setActivePreviewId(result.previews[0]?.id ?? null);
      setSavedBatchId(null);
      setStep("preview");
    });
  }

  function handleSaveDraft() {
    if (previews.length === 0) {
      setError("Nothing to save — preview drafts first.");
      return;
    }
    const batchId = savedBatchId ?? crypto.randomUUID();
    const units = previews.map((p) => {
      const draft = drafts[p.id];
      return {
        id: p.id,
        staffId: p.staffId,
        empNo: p.empNo,
        employeeName: p.employeeName,
        to: draft?.to ?? p.to,
        providerCompany: p.providerCompany,
        providerContact: p.providerContact,
        subject: draft?.subject ?? p.subject,
        body: draft?.body ?? p.body,
        certificationNames: p.certificationNames,
        attachments: p.attachments,
      };
    });
    const selections =
      selectionsPayload.length > 0
        ? selectionsPayload
        : selectionsFromPreviews(previews, types);
    upsertCertRequestDraftBatch(venueId, {
      id: batchId,
      savedAt: new Date().toISOString(),
      selections,
      units,
    });
    setSavedBatchId(batchId);
    refreshSavedBatches();
    toast.saved(
      `Saved ${units.length} draft${units.length === 1 ? "" : "s"}.`,
    );
  }

  function handleDeleteUnit(unitId: string) {
    const remaining = previews.filter((p) => p.id !== unitId);
    setPreviews(remaining);
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[unitId];
      return next;
    });
    if (activePreviewId === unitId) {
      setActivePreviewId(remaining[0]?.id ?? null);
    }
    if (savedBatchId) {
      const nextBatch = deleteCertRequestDraftUnit(
        venueId,
        savedBatchId,
        unitId,
      );
      refreshSavedBatches();
      if (!nextBatch) {
        setSavedBatchId(null);
        if (remaining.length === 0) setStep("drafts-list");
      }
    } else if (remaining.length === 0) {
      setStep("compose");
    }
  }

  function handleDeleteBatch(batchId: string) {
    deleteCertRequestDraftBatch(venueId, batchId);
    if (savedBatchId === batchId) {
      setSavedBatchId(null);
      setPreviews([]);
      setDrafts({});
    }
    refreshSavedBatches();
    toast.saved("Draft batch deleted.");
  }

  function handleSend() {
    if (sendPhase === "sending") return;
    setError(null);
    setSendStepIndex(0);
    setSendPhase("sending");
    startTransition(async () => {
      try {
        const selections =
          selectionsPayload.length > 0
            ? selectionsPayload
            : selectionsFromPreviews(previews, types);
        const result = await sendCertificationRequestEmails({
          selections,
          draftsByUnitId: drafts,
        });
        if (!result.ok) {
          setError(result.error);
          setSendPhase("error");
          return;
        }
        if (result.sent === 0) {
          const first = result.failed[0]?.error;
          setError(first ?? "No emails were sent.");
          setSendPhase("error");
          return;
        }
        if (savedBatchId) {
          deleteCertRequestDraftBatch(venueId, savedBatchId);
          refreshSavedBatches();
        }
        const failNote =
          result.failed.length > 0
            ? ` ${result.failed.length} failed.`
            : "";
        setSendStepIndex(SEND_STEPS.length - 1);
        setSendPhase("success");
        toast.saved(
          `Sent ${result.sent} provider request${result.sent === 1 ? "" : "s"}.${failNote}`,
        );
        window.setTimeout(() => {
          setSendPhase("idle");
          onSent();
        }, 900);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not send emails.",
        );
        setSendPhase("error");
      }
    });
  }

  function updateActiveDraft(
    patch: Partial<{ to: string; subject: string; body: string }>,
  ) {
    if (!activePreview) return;
    setDrafts((prev) => ({
      ...prev,
      [activePreview.id]: {
        to: prev[activePreview.id]?.to ?? activePreview.to,
        subject: prev[activePreview.id]?.subject ?? activePreview.subject,
        body: prev[activePreview.id]?.body ?? activePreview.body,
        ...patch,
      },
    }));
  }

  function startIdentityUpload(key: HrEmailStaffDocumentKey) {
    if (!activePreview || pending || uploadingAttachmentKey) return;
    if (!staffDocumentUploadTarget(key)) return;
    pendingIdentityUploadKey.current = key;
    identityFileInputRef.current?.click();
  }

  async function handleIdentityFileSelected(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    const key = pendingIdentityUploadKey.current;
    pendingIdentityUploadKey.current = null;
    if (!file || !key || !activePreview) return;

    const target = staffDocumentUploadTarget(key);
    if (!target) return;
    setUploadingAttachmentKey(key);
    setError(null);
    try {
      const result = await uploadStaffDocumentViaApi({
        staffId: activePreview.staffId,
        empNo: activePreview.empNo,
        fullName: activePreview.employeeName,
        docKind: target.docKind,
        fileSlotId: target.fileSlotId,
        file,
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      const refreshed = await refreshCertificationIdentityAttachments(
        activePreview.staffId,
      );
      if (refreshed.ok) {
        setPreviews((prev) =>
          prev.map((p) =>
            p.staffId === activePreview.staffId
              ? { ...p, attachments: refreshed.attachments }
              : p,
          ),
        );
      } else {
        setPreviews((prev) =>
          prev.map((p) =>
            p.staffId !== activePreview.staffId
              ? p
              : {
                  ...p,
                  attachments: p.attachments.map((a) =>
                    a.key === key
                      ? { ...a, ok: true, fileName: result.fileName }
                      : a,
                  ),
                },
          ),
        );
      }
      toast.saved(`${labelForEmailStaffDocumentKey(key)} uploaded.`);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not upload document.";
      setError(message);
      toast.error(message);
    } finally {
      setUploadingAttachmentKey(null);
    }
  }

  function goAdjacentDraft(delta: -1 | 1) {
    if (previewIndex < 0) return;
    const next = previews[previewIndex + delta];
    if (next) setActivePreviewId(next.id);
  }

  const canSend =
    !pending &&
    sendPhase === "idle" &&
    previews.length > 0 &&
    blockedDraftCount === 0;

  const showSidePanel = step === "preview" && previews.length > 0;
  const showSendStatus =
    sendPhase === "sending" ||
    sendPhase === "success" ||
    sendPhase === "error";
  const sendBusy = sendPhase === "sending" || sendPhase === "success";
  const emailCountLabel = `${previews.length} email${previews.length === 1 ? "" : "s"}`;

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
          aria-labelledby="cert-email-dialog-title"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
            <div>
              <h2
                id="cert-email-dialog-title"
                className="font-nav text-base font-semibold text-[#3D421F]"
              >
                {step === "drafts-list"
                  ? "Saved certification drafts"
                  : "Certification request email"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {step === "drafts-list"
                  ? "Reopen a saved batch to edit or send provider requests."
                  : `Emails go to certification providers with selected WorkDrive documents attached — ${staff.length} employee${staff.length === 1 ? "" : "s"}, ${recipientsWithCerts} with certifications selected.`}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
              onClick={() => !pending && !sendBusy && onOpenChange(false)}
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
                          {formatDraftBatchSummary(batch)}
                        </p>
                        <p className="mt-1 truncate text-xs text-black/45">
                          {[
                            ...new Set(
                              batch.units.flatMap((u) => u.certificationNames),
                            ),
                          ].join(", ")}
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
                <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
                  Certifications to request
                </p>
                {staff.map((s) => {
                  const selected = selectionByStaff[s.id] ?? new Set<string>();
                  const allChecked =
                    types.length > 0 && types.every((t) => selected.has(t.id));
                  return (
                    <div
                      key={s.id}
                      className="overflow-hidden rounded-xl border border-black/10 bg-black/[0.015]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 bg-white/70 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#3D421F]">
                            {s.fullName}
                            <span className="ml-1.5 font-normal text-black/40">
                              {s.empNo}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <button
                            type="button"
                            className="rounded px-1.5 py-0.5 text-[#3D421F] hover:bg-black/5"
                            onClick={() => setAllForStaff(s.id, true)}
                            disabled={pending || allChecked}
                          >
                            All
                          </button>
                          <button
                            type="button"
                            className="rounded px-1.5 py-0.5 text-[#3D421F] hover:bg-black/5"
                            onClick={() => setAllForStaff(s.id, false)}
                            disabled={pending || selected.size === 0}
                          >
                            None
                          </button>
                          <span className="tabular-nums text-black/40">
                            {selected.size}/{types.length}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-nowrap items-start gap-1 overflow-x-auto px-2 py-1.5">
                        {types.map((t) => {
                          const checked = selected.has(t.id);
                          const cell = s.certifications?.find(
                            (c) => c.certificationId === t.id,
                          );
                          const providerHint = [
                            t.contact_email.trim() || "No provider email",
                            t.provider_company.trim() || null,
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <div
                              key={t.id}
                              className="inline-flex shrink-0 flex-col items-stretch gap-0.5"
                            >
                              <label
                                title={providerHint}
                                className={cn(
                                  "inline-flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-none transition",
                                  checked
                                    ? "border-[var(--venue-primary,#818a40)]/40 bg-[var(--venue-primary,#818a40)]/10 font-medium text-[#3D421F]"
                                    : "border-black/10 bg-white text-black/55 hover:border-black/20 hover:text-[#3D421F]",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="h-3 w-3 rounded border-black/20"
                                  checked={checked}
                                  onChange={() => toggleCert(s.id, t.id)}
                                  disabled={pending}
                                />
                                <span>{typeLabel(t)}</span>
                              </label>
                              {cell?.certifiedAt || cell?.expiresAt ? (
                                <div
                                  className={cn(
                                    "px-0.5 text-[9px] leading-tight tabular-nums",
                                    dateStatusClass(cell.status),
                                  )}
                                >
                                  {cell.certifiedAt ? (
                                    <div>
                                      Cert {formatDateOnly(cell.certifiedAt)}
                                    </div>
                                  ) : null}
                                  {cell.expiresAt ? (
                                    <div>
                                      Exp {formatDateOnly(cell.expiresAt)}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="px-0.5 text-[9px] leading-tight text-black/30">
                                  —
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {selected.size === 0 ? (
                        <p className="border-t border-black/5 px-3 py-2 text-xs text-amber-700">
                          No certifications selected — this employee will be
                          skipped.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : activeDraft && activePreview ? (
              <div className="space-y-3">
                {activePreview.certificationNames.length > 0 ? (
                  <p className="text-xs text-black/45">
                    Requesting:{" "}
                    <span className="text-[#3D421F]">
                      {activePreview.certificationNames.join(", ")}
                    </span>
                    {" · "}
                    Employee:{" "}
                    <span className="text-[#3D421F]">
                      {activePreview.employeeName} ({activePreview.empNo})
                    </span>
                  </p>
                ) : null}

                <div
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-xs",
                    attachmentGap
                      ? "border-red-200 bg-red-50 text-red-950"
                      : hasMissingAttachments
                        ? "border-amber-200 bg-amber-50/80 text-amber-950"
                        : "border-emerald-200 bg-emerald-50/70 text-emerald-900",
                  )}
                >
                  <p className="flex items-center gap-1.5 font-medium">
                    <Paperclip className="h-3.5 w-3.5" aria-hidden />
                    Attachments from WorkDrive
                    {!requireAttachments ? (
                      <span className="font-normal text-black/45">
                        (optional)
                      </span>
                    ) : null}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {activePreview.attachments.map((a) => {
                      const key = a.key as HrEmailStaffDocumentKey;
                      const uploading = uploadingAttachmentKey === key;
                      const canUpload = Boolean(staffDocumentUploadTarget(key));
                      return (
                        <li
                          key={a.key}
                          className="flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1 overflow-visible">
                            {a.ok ? (
                              <span
                                className="break-all text-emerald-900"
                                title={a.fileName ?? undefined}
                              >
                                {a.label}:{" "}
                                <span className="font-medium text-emerald-950">
                                  {a.fileName}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <span
                                  className={cn(
                                    "font-medium",
                                    requireAttachments
                                      ? "text-red-950"
                                      : "text-amber-950",
                                  )}
                                >
                                  {a.label}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white",
                                    requireAttachments
                                      ? "bg-red-600"
                                      : "bg-amber-600",
                                  )}
                                >
                                  Missing
                                </span>
                                <span
                                  className={
                                    requireAttachments
                                      ? "text-red-800/80"
                                      : "text-amber-800/80"
                                  }
                                >
                                  {requireAttachments
                                    ? "Upload before sending"
                                    : "Will be skipped"}
                                </span>
                              </span>
                            )}
                          </div>
                          {!a.ok && canUpload ? (
                            <button
                              type="button"
                              disabled={pending || uploadingAttachmentKey != null}
                              onClick={() => startIdentityUpload(key)}
                              title={`Upload ${a.label}`}
                              aria-label={`Upload ${a.label}`}
                              className={cn(
                                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-white shadow-sm transition disabled:opacity-50",
                                requireAttachments
                                  ? "border-red-300 text-red-700 hover:bg-red-50"
                                  : "border-amber-300 text-amber-800 hover:bg-amber-50",
                              )}
                            >
                              {uploading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <input
                    ref={identityFileInputRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => void handleIdentityFileSelected(e)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cert-email-to">To (provider)</Label>
                  <Input
                    id="cert-email-to"
                    value={activeDraft.to}
                    onChange={(e) =>
                      updateActiveDraft({ to: e.target.value })
                    }
                    disabled={pending}
                    placeholder="provider@example.com"
                    className="h-10 bg-white shadow-sm"
                  />
                  {!activeDraft.to ? (
                    <p className="text-xs text-amber-700">
                      No provider email — enter an address or set contact email
                      on the certification type.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cert-email-subject">Subject</Label>
                  <Input
                    id="cert-email-subject"
                    value={activeDraft.subject}
                    onChange={(e) =>
                      updateActiveDraft({ subject: e.target.value })
                    }
                    disabled={pending}
                    className="h-10 bg-white shadow-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cert-email-body">Message</Label>
                  <EmailMessageEditor
                    id="cert-email-body"
                    value={activeDraft.body}
                    onChange={(body) => updateActiveDraft({ body })}
                    disabled={pending}
                    rows={14}
                    aria-label="Certification request email message"
                  />
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 px-5 py-3.5">
            {step === "preview" ? (
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    setStep(savedBatchId ? "drafts-list" : "compose")
                  }
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-[#3D421F] transition hover:bg-black/[0.05] disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
                <span className="h-4 w-px shrink-0 bg-black/10" aria-hidden />
                <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-black/10 bg-white px-1 py-0.5">
                  <button
                    type="button"
                    disabled={pending || previewIndex <= 0}
                    onClick={() => goAdjacentDraft(-1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-[#3D421F] transition hover:bg-black/[0.05] disabled:opacity-35"
                    aria-label="Previous draft"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[3.75rem] text-center text-xs tabular-nums text-black/55">
                    {previewIndex >= 0 ? previewIndex + 1 : 0} /{" "}
                    {previews.length}
                  </span>
                  <button
                    type="button"
                    disabled={
                      pending ||
                      previewIndex < 0 ||
                      previewIndex >= previews.length - 1
                    }
                    onClick={() => goAdjacentDraft(1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-[#3D421F] transition hover:bg-black/[0.05] disabled:opacity-35"
                    aria-label="Next draft"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                {blockedDraftCount > 0 ? (
                  <span className="min-w-0 shrink truncate text-xs text-amber-800">
                    {blockedDraftCount} draft
                    {blockedDraftCount === 1 ? "" : "s"} missing ID
                    attachments
                  </span>
                ) : (
                  <span className="min-w-0 shrink truncate text-xs text-emerald-800">
                    {requireAttachments
                      ? "All drafts ready to send"
                      : "Attachments optional — ready to send"}
                  </span>
                )}
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={pending || previews.length === 0}
                    onClick={handleSaveDraft}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-sm font-medium text-[#3D421F] shadow-sm transition hover:bg-black/[0.03] disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    Save draft
                  </button>
                  <Button
                    type="button"
                    disabled={!canSend}
                    onClick={handleSend}
                    className="h-9 gap-2 px-3 shadow-sm"
                  >
                    {pending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        <Mail className="h-4 w-4" />
                        Send {previews.length} email
                        {previews.length === 1 ? "" : "s"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : step === "drafts-list" ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-black/45">
                  {savedBatches.length} saved batch
                  {savedBatches.length === 1 ? "" : "es"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onOpenChange(false)}
                    className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-black/55 transition hover:bg-black/[0.05] hover:text-[#3D421F] disabled:opacity-50"
                  >
                    Close
                  </button>
                  <Button
                    type="button"
                    disabled={pending || staff.length === 0}
                    onClick={() => {
                      setSavedBatchId(null);
                      setPreviews([]);
                      setDrafts({});
                      setSelectionByStaff(buildInitialSelections(staff));
                      setStep("compose");
                    }}
                    className="h-10 gap-2 shadow-sm"
                  >
                    New request
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-black/45">
                  {recipientsWithCerts} employee
                  {recipientsWithCerts === 1 ? "" : "s"} ready for preview
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onOpenChange(false)}
                    className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-black/55 transition hover:bg-black/[0.05] hover:text-[#3D421F] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <Button
                    type="button"
                    disabled={pending || !canPreview}
                    onClick={handlePreview}
                    className="h-10 min-w-[8.5rem] gap-2 shadow-sm"
                  >
                    {pending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Preparing…
                      </>
                    ) : (
                      "Preview drafts"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {showSidePanel ? (
          <aside
            className="flex w-[min(100%,17.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
            aria-label="Drafts by certification"
          >
            <div className="border-b border-black/10 px-3.5 py-3">
              <p className="font-nav text-sm font-semibold text-[#3D421F]">
                By certification
              </p>
              <p className="mt-0.5 text-[11px] text-black/45">
                {previews.length} draft{previews.length === 1 ? "" : "s"} · open
                an employee to edit
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {certPreviewGroups.length === 0 ? (
                <p className="px-3.5 py-4 text-xs text-black/45">
                  No certification drafts.
                </p>
              ) : (
                certPreviewGroups.map((group, index) => (
                  <div
                    key={group.id}
                    className={cn(
                      index > 0 && "border-t border-black/10",
                    )}
                  >
                    <div className="bg-[var(--venue-secondary,#F0F3DD)]/45 px-3.5 py-2.5 text-center">
                      <p className="text-sm font-semibold text-[#3D421F]">
                        {group.label}
                      </p>
                      {group.providerCompany ? (
                        <p className="mt-0.5 truncate text-xs text-black/45">
                          {group.providerCompany}
                        </p>
                      ) : null}
                    </div>
                    <ul className="px-2 py-1.5">
                      {group.entries.map((p) => {
                        const active = (activePreview?.id ?? "") === p.id;
                        return (
                          <li
                            key={`${group.id}-${p.id}`}
                            className="flex items-stretch gap-0.5"
                          >
                            <button
                              type="button"
                              onClick={() => setActivePreviewId(p.id)}
                              className={cn(
                                "min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition",
                                active
                                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                                  : "text-[#3D421F] hover:bg-black/[0.04]",
                              )}
                            >
                              <span className="block truncate text-xs font-medium">
                                {p.employeeName}
                              </span>
                              <span
                                className={cn(
                                  "block truncate text-[10px]",
                                  active ? "text-white/75" : "text-black/40",
                                )}
                              >
                                {p.empNo}
                                {p.providerCompany
                                  ? ` · ${p.providerCompany}`
                                  : ""}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUnit(p.id)}
                              disabled={pending}
                              aria-label={`Delete draft for ${p.employeeName}`}
                              className={cn(
                                "inline-flex w-7 shrink-0 items-center justify-center rounded-md transition",
                                active
                                  ? "bg-white/95 text-red-600 shadow-sm hover:bg-white hover:text-red-700"
                                  : "text-black/35 hover:bg-red-50 hover:text-red-600",
                              )}
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
            <div className="shrink-0 border-t border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 px-3 py-3">
              <Button
                type="button"
                disabled={!canSend}
                onClick={handleSend}
                className="h-9 w-full gap-2 px-3 text-sm shadow-sm"
              >
                {sendPhase === "sending" || pending ? (
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
              {blockedDraftCount > 0 ? (
                <p className="mt-2 text-center text-[10px] leading-snug text-amber-800">
                  Fix missing attachments before sending
                </p>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      {showSendStatus ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cert-email-send-status-title"
            className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-xl"
          >
            <h3
              id="cert-email-send-status-title"
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              {sendPhase === "sending"
                ? "Sending emails"
                : sendPhase === "success"
                  ? "Emails sent"
                  : "Could not send"}
            </h3>

            {sendPhase === "sending" ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3 rounded-lg border border-black/8 bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--venue-primary,#818a40)] shadow-sm">
                    <Mail className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#3D421F]">
                      {SEND_STEPS[sendStepIndex]}
                    </p>
                    <p className="truncate text-xs text-black/50">
                      Sending {emailCountLabel} to providers
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                      <div
                        className="h-full rounded-full bg-[var(--venue-primary,#818a40)] transition-[width] duration-500 ease-out"
                        style={{
                          width: `${Math.min(
                            95,
                            ((sendStepIndex + 1) / SEND_STEPS.length) * 100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <ul className="space-y-1.5 text-xs text-black/50">
                  {SEND_STEPS.map((label, index) => {
                    const done = index <= sendStepIndex;
                    return (
                      <li
                        key={label}
                        className={cn(
                          "flex items-center gap-2",
                          done ? "text-[#3D421F]" : "text-black/35",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full",
                            done
                              ? "bg-[var(--venue-primary,#818a40)] text-white"
                              : "border border-black/15",
                          )}
                        >
                          {done ? (
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          ) : null}
                        </span>
                        {label}
                      </li>
                    );
                  })}
                </ul>
                <p className="text-center text-xs text-black/45">
                  Please wait — this may take a few seconds.
                </p>
              </div>
            ) : null}

            {sendPhase === "success" ? (
              <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="size-6" strokeWidth={2.5} />
                </span>
                <div>
                  <p className="font-medium text-emerald-950">
                    Provider requests delivered
                  </p>
                  <p className="mt-1 text-sm text-emerald-900/80">
                    Sent {emailCountLabel}
                  </p>
                </div>
              </div>
            ) : null}

            {sendPhase === "error" ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-red-100 text-red-700">
                    <XCircle className="size-6" />
                  </span>
                  <div>
                    <p className="font-medium text-red-950">
                      Could not send email
                    </p>
                    <p className="mt-1 text-sm text-red-900/80">
                      {error ?? "Unknown error"}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 border border-black/15 bg-white"
                    onClick={() => {
                      setSendPhase("idle");
                      setSendStepIndex(0);
                    }}
                  >
                    Back to draft
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
