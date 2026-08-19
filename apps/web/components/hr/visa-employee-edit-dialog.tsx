"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  addStaffVisaRecord,
  deleteStaffVisaRecord,
  listStaffVisaRecords,
  updateStaffVisaRecord,
} from "@/lib/actions/hr-visa";
import { StaffDocumentUploadSlot } from "@/components/hr/staff-document-upload-slot";
import { StaffWorkDriveDocumentList } from "@/components/hr/staff-workdrive-document-list";
import { Button } from "@/components/ui/button";
import { VisaCancelationFileField } from "@/components/hr/visa-cancelation-file-field";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import {
  splitGrossAtVatRate,
  splitNetAtVatRate,
} from "@/lib/hr/certification-costs";
import { DETACHED_FILE_FORM_ID } from "@/lib/hr/detached-file-form";
import { uploadStaffDocumentViaApi } from "@/lib/hr/workdrive/client-upload";
import type { StaffWorkDriveDocumentListItem } from "@/lib/actions/hr-workdrive";
import {
  VISA_STATUS_OPTIONS,
  type StaffLinkedWorkDriveDocument,
  type StaffVisaRecord,
  type VisaEmployeeRow,
  type VisaPenalty,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

function parseMoney(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function moneyField(n: number): string {
  return n > 0 ? n.toFixed(2) : "";
}

function syncFromGross(grossRaw: string): { gross: string; net: string } {
  const g = parseMoney(grossRaw);
  if (g <= 0) return { gross: grossRaw, net: "" };
  return { gross: grossRaw, net: moneyField(splitGrossAtVatRate(g).net) };
}

function syncFromNet(netRaw: string): { gross: string; net: string } {
  const n = parseMoney(netRaw);
  if (n <= 0) return { gross: "", net: netRaw };
  return { gross: moneyField(splitNetAtVatRate(n).gross), net: netRaw };
}

function toWorkDriveListItem(
  doc: StaffLinkedWorkDriveDocument,
): StaffWorkDriveDocumentListItem {
  return {
    id: doc.id,
    workdriveFileId: doc.workdriveFileId,
    fileName: doc.fileName,
    path: doc.path,
    permalink: doc.permalink,
    folderId: doc.folderId,
    fileSlotId: doc.fileSlotId,
    uploadedAt: doc.uploadedAt,
    isMissing: Boolean(doc.isMissing),
    missingReason: doc.missingReason ?? null,
  };
}

type VisaEmployeeEditDialogProps = {
  row: VisaEmployeeRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

const selectClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

/** Left content | fixed Gross/Tax/Net | trailing 2rem (delete or spacer). */
const moneyAlignRowClass = "flex w-full items-end gap-3";

const moneyBlockClass =
  "grid w-[22rem] shrink-0 grid-cols-3 gap-2 rounded-lg border border-amber-200/80 bg-amber-50 p-2.5";

const moneyTrailClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center";

const CARD_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";

type RowUploadState = {
  file: File | null;
  uploading: boolean;
  progress: number | null;
};

type PenaltyDraft = {
  key: string;
  description: string;
  amount: string;
  netAmount: string;
  companyCovered: boolean;
};

function newKey() {
  return crypto.randomUUID();
}

function isSelfOwned(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s.includes("self owned");
}

function isDispute(status: string): boolean {
  return status.trim().toLowerCase().includes("dispute");
}

function isCanceled(status: string): boolean {
  return status.trim().toLowerCase().includes("cancel");
}

function penaltiesToDraft(penalties: VisaPenalty[]): PenaltyDraft[] {
  return penalties.map((p) => {
    const amount =
      p.amount != null && p.amount > 0 ? String(p.amount) : "";
    const { net } = syncFromGross(amount);
    return {
      key: p.id || newKey(),
      description: p.description,
      amount,
      netAmount: net,
      companyCovered: p.companyCovered,
    };
  });
}

function draftToPenalties(penalties: PenaltyDraft[]): VisaPenalty[] {
  return penalties
    .filter((p) => p.description.trim() || p.amount.trim())
    .map((p) => {
      const key = p.key.trim();
      const id =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          key,
        )
          ? key
          : crypto.randomUUID();
      return {
        id,
        description: p.description.trim(),
        amount: Number(p.amount) || 0,
        companyCovered: p.companyCovered,
      };
    });
}

export function VisaEmployeeEditDialog({
  row,
  open,
  onOpenChange,
  onSaved,
}: VisaEmployeeEditDialogProps) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<StaffVisaRecord[]>([]);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [visaNumber, setVisaNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [valueSpend, setValueSpend] = useState("");
  const [valueSpendNet, setValueSpendNet] = useState("");
  const [visaStatus, setVisaStatus] = useState("");
  const [disputeReference, setDisputeReference] = useState("");
  const [disputeComments, setDisputeComments] = useState("");
  const [cancelDate, setCancelDate] = useState("");
  const [cancelationSpend, setCancelationSpend] = useState("");
  const [cancelationSpendNet, setCancelationSpendNet] = useState("");
  const [comments, setComments] = useState("");
  const [penalties, setPenalties] = useState<PenaltyDraft[]>([]);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [newCardFile, setNewCardFile] = useState<File | null>(null);
  const [newCardUploading, setNewCardUploading] = useState(false);
  const [newCardProgress, setNewCardProgress] = useState<number | null>(null);
  const [newCardNote, setNewCardNote] = useState<string | null>(null);

  const [newNocFile, setNewNocFile] = useState<File | null>(null);
  const [newNocUploading, setNewNocUploading] = useState(false);
  const [newNocProgress, setNewNocProgress] = useState<number | null>(null);
  const [newNocNote, setNewNocNote] = useState<string | null>(null);

  const [rowUploads, setRowUploads] = useState<Record<string, RowUploadState>>(
    {},
  );
  const [rowNocUploads, setRowNocUploads] = useState<
    Record<string, RowUploadState>
  >({});

  function resetAddForm(seed?: { visaStatus?: string }) {
    setEditingRecordId(null);
    setFormOpen(false);
    setVisaNumber("");
    setIssueDate("");
    setExpiryDate("");
    setValueSpend("");
    setValueSpendNet("");
    setVisaStatus(seed?.visaStatus ?? "");
    setDisputeReference("");
    setDisputeComments("");
    setCancelDate("");
    setCancelationSpend("");
    setCancelationSpendNet("");
    setComments("");
    setPenalties([]);
    setNewCardFile(null);
    setNewCardNote(null);
    setNewCardProgress(null);
    setNewNocFile(null);
    setNewNocNote(null);
    setNewNocProgress(null);
  }

  function startAddRecord() {
    resetAddForm({ visaStatus: row?.visaStatus ?? "" });
    setFormOpen(true);
  }

  function startEditRecord(record: StaffVisaRecord) {
    setEditingRecordId(record.id);
    setFormOpen(true);
    setVisaNumber(record.visaNumber ?? "");
    setIssueDate(record.issueDate ?? "");
    setExpiryDate(record.expiryDate ?? "");
    {
      const gross =
        record.valueSpend != null && record.valueSpend > 0
          ? String(record.valueSpend)
          : "";
      const synced = syncFromGross(gross);
      setValueSpend(synced.gross);
      setValueSpendNet(synced.net);
    }
    setVisaStatus(record.visaStatus ?? "");
    setDisputeReference(record.disputeReference ?? "");
    setDisputeComments(record.disputeComments ?? "");
    setCancelDate(record.cancelDate ?? "");
    {
      const gross =
        record.cancelationSpend != null && record.cancelationSpend > 0
          ? String(record.cancelationSpend)
          : "";
      const synced = syncFromGross(gross);
      setCancelationSpend(synced.gross);
      setCancelationSpendNet(synced.net);
    }
    setComments(record.comments ?? "");
    setPenalties(penaltiesToDraft(record.penalties ?? []));
    setNewCardFile(null);
    setNewCardNote(null);
    setNewCardProgress(null);
    setNewNocFile(null);
    setNewNocNote(null);
    setNewNocProgress(null);
  }

  function reloadRecords(staffId: string) {
    return listStaffVisaRecords({ staffId }).then((result) => {
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setRecords(result.records);
      setLatestId(result.latestId);
    });
  }

  useEffect(() => {
    if (!open || !row) return;

    resetAddForm({ visaStatus: row.visaStatus ?? "" });
    setRowUploads({});
    setRowNocUploads({});
    setNewCardUploading(false);
    setNewNocUploading(false);

    setLoading(true);
    setLoadError(null);
    setRecords([]);
    setLatestId(null);

    let cancelled = false;
    void listStaffVisaRecords({ staffId: row.staff.id }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setRecords(result.records);
      setLatestId(result.latestId);
    });

    return () => {
      cancelled = true;
    };
  }, [open, row]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !pending &&
        !newCardUploading &&
        !newNocUploading
      ) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, pending, newCardUploading, newNocUploading]);

  if (!open || !row || typeof document === "undefined") return null;

  const activeRow = row;
  const busy = pending || newCardUploading || newNocUploading;
  const isEditing = editingRecordId != null;
  const showDispute = isDispute(visaStatus);
  const showCancel = isCanceled(visaStatus);
  const showNoc = isSelfOwned(visaStatus);
  const grossAmount = parseMoney(valueSpend);
  const { vat: valueTax } = splitGrossAtVatRate(grossAmount);
  const cancelGrossAmount = parseMoney(cancelationSpend);
  const { vat: cancelTax } = splitGrossAtVatRate(cancelGrossAmount);
  const editingRecord = isEditing
    ? (records.find((r) => r.id === editingRecordId) ?? null)
    : null;
  const existingCard = editingRecord?.document ?? null;
  const existingNoc = editingRecord?.nocDocument ?? null;

  function patchRowUpload(recordId: string, next: Partial<RowUploadState>) {
    setRowUploads((prev) => ({
      ...prev,
      [recordId]: {
        file: prev[recordId]?.file ?? null,
        uploading: prev[recordId]?.uploading ?? false,
        progress: prev[recordId]?.progress ?? null,
        ...next,
      },
    }));
  }

  function patchRowNocUpload(recordId: string, next: Partial<RowUploadState>) {
    setRowNocUploads((prev) => ({
      ...prev,
      [recordId]: {
        file: prev[recordId]?.file ?? null,
        uploading: prev[recordId]?.uploading ?? false,
        progress: prev[recordId]?.progress ?? null,
        ...next,
      },
    }));
  }

  async function uploadResidenceForRecord(
    record: StaffVisaRecord,
    file: File,
    onProgress: (percent: number) => void,
  ) {
    return uploadStaffDocumentViaApi({
      staffId: activeRow.staff.id,
      empNo: activeRow.staff.emp_no,
      fullName: activeRow.staff.full_name,
      docKind: "eresidence_card",
      fileSlotId: record.id,
      docExpiry: record.expiryDate,
      file,
      onProgress,
    });
  }

  async function uploadNocForRecord(
    record: StaffVisaRecord,
    file: File,
    onProgress: (percent: number) => void,
  ) {
    return uploadStaffDocumentViaApi({
      staffId: activeRow.staff.id,
      empNo: activeRow.staff.emp_no,
      fullName: activeRow.staff.full_name,
      docKind: "visa_noc",
      fileSlotId: record.id,
      docExpiry: record.expiryDate ?? record.cancelDate,
      file,
      onProgress,
    });
  }

  async function handleRowCardUpload(record: StaffVisaRecord) {
    const state = rowUploads[record.id];
    if (!state?.file || state.uploading) return;
    const file = state.file;
    patchRowUpload(record.id, { uploading: true, progress: 0 });
    try {
      const result = await uploadResidenceForRecord(record, file, (percent) => {
        patchRowUpload(record.id, { file, uploading: true, progress: percent });
      });
      if (!result.ok) {
        toast.error(result.error);
        patchRowUpload(record.id, { uploading: false, progress: null });
        return;
      }
      toast.saved(
        `Residency card linked to ${record.visaNumber.trim() || "this reference"}.`,
      );
      patchRowUpload(record.id, {
        file: null,
        uploading: false,
        progress: null,
      });
      await reloadRecords(activeRow.staff.id);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
      patchRowUpload(record.id, { uploading: false, progress: null });
    }
  }

  async function handleRowNocUpload(record: StaffVisaRecord) {
    const state = rowNocUploads[record.id];
    if (!state?.file || state.uploading) return;
    const file = state.file;
    patchRowNocUpload(record.id, { uploading: true, progress: 0 });
    try {
      const result = await uploadNocForRecord(record, file, (percent) => {
        patchRowNocUpload(record.id, {
          file,
          uploading: true,
          progress: percent,
        });
      });
      if (!result.ok) {
        toast.error(result.error);
        patchRowNocUpload(record.id, { uploading: false, progress: null });
        return;
      }
      toast.saved(
        `NOC linked to ${record.visaNumber.trim() || "this reference"}.`,
      );
      patchRowNocUpload(record.id, {
        file: null,
        uploading: false,
        progress: null,
      });
      await reloadRecords(activeRow.staff.id);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
      patchRowNocUpload(record.id, { uploading: false, progress: null });
    }
  }

  function validateForm(): boolean {
    if (!visaStatus.trim()) {
      toast.error("Choose a visa status.");
      return false;
    }
    if (isDispute(visaStatus) && !disputeReference.trim()) {
      toast.error("Dispute reference is required for Visa Dispute.");
      return false;
    }
    if (isCanceled(visaStatus) && !cancelDate) {
      toast.error("Cancel date is required for Visa Canceled.");
      return false;
    }
    return true;
  }

  async function uploadOptionalDocs(record: StaffVisaRecord) {
    let cardOk = true;
    let nocOk = true;

    if (newCardFile) {
      setNewCardUploading(true);
      setNewCardProgress(0);
      setNewCardNote(null);
      try {
        const uploaded = await uploadResidenceForRecord(
          record,
          newCardFile,
          (percent) => setNewCardProgress(percent),
        );
        if (!uploaded.ok) {
          cardOk = false;
          setNewCardNote(uploaded.error);
          toast.error(`Record saved, but residency card failed: ${uploaded.error}`);
        }
      } catch (error) {
        cardOk = false;
        const message =
          error instanceof Error ? error.message : "Upload failed.";
        setNewCardNote(message);
        toast.error(`Record saved, but residency card failed: ${message}`);
      } finally {
        setNewCardUploading(false);
        setNewCardProgress(null);
      }
    }

    if (newNocFile && isSelfOwned(record.visaStatus)) {
      setNewNocUploading(true);
      setNewNocProgress(0);
      setNewNocNote(null);
      try {
        const uploaded = await uploadNocForRecord(
          record,
          newNocFile,
          (percent) => setNewNocProgress(percent),
        );
        if (!uploaded.ok) {
          nocOk = false;
          setNewNocNote(uploaded.error);
          toast.error(`Record saved, but NOC upload failed: ${uploaded.error}`);
        }
      } catch (error) {
        nocOk = false;
        const message =
          error instanceof Error ? error.message : "Upload failed.";
        setNewNocNote(message);
        toast.error(`Record saved, but NOC upload failed: ${message}`);
      } finally {
        setNewNocUploading(false);
        setNewNocProgress(null);
      }
    }

    return cardOk && nocOk;
  }

  function handleSave() {
    if (!validateForm()) return;

    const payload = {
      staffId: activeRow.staff.id,
      visaNumber: visaNumber.trim() || undefined,
      issueDate: issueDate || null,
      expiryDate: expiryDate || null,
      valueSpend: valueSpend.trim() === "" ? null : Number(valueSpend) || 0,
      penalties: draftToPenalties(penalties),
      visaStatus: visaStatus.trim(),
      disputeReference: disputeReference.trim() || undefined,
      disputeComments: disputeComments.trim() || undefined,
      cancelDate: cancelDate || null,
      cancelationSpend:
        cancelationSpend.trim() === "" ? null : Number(cancelationSpend) || 0,
      comments: comments.trim() || undefined,
    };

    if (editingRecordId) {
      startTransition(async () => {
        const result = await updateStaffVisaRecord({
          ...payload,
          recordId: editingRecordId,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        const docsOk = await uploadOptionalDocs(result.record);
        if (docsOk) {
          if (newCardFile || newNocFile) {
            toast.saved("Visa record and documents updated.");
          } else {
            toast.saved("Visa record updated.");
          }
        }

        await reloadRecords(activeRow.staff.id);
        onSaved();
        resetAddForm({ visaStatus: visaStatus.trim() });
      });
      return;
    }

    startTransition(async () => {
      const result = await addStaffVisaRecord(payload);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const docsOk = await uploadOptionalDocs(result.record);
      if (docsOk) {
        if (newCardFile || newNocFile) {
          toast.saved("Visa record and documents saved.");
        } else {
          toast.saved("Visa record added.");
        }
      }

      await reloadRecords(activeRow.staff.id);
      onSaved();
      resetAddForm({ visaStatus: visaStatus.trim() });
    });
  }

  function handleDelete(recordId: string) {
    startTransition(async () => {
      const result = await deleteStaffVisaRecord({
        staffId: activeRow.staff.id,
        recordId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Visa record removed.");
      if (editingRecordId === recordId) {
        resetAddForm({ visaStatus: activeRow.visaStatus ?? "" });
      }
      const next = records.filter((r) => r.id !== recordId);
      setRecords(next);
      setLatestId(next[0]?.id ?? null);
      onSaved();
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onOpenChange(false);
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="visa-employee-edit-title"
        className="flex max-h-[min(92dvh,52rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="visa-employee-edit-title"
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              {activeRow.staff.full_name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Emp. {activeRow.staff.emp_no}
              {activeRow.staff.position?.name
                ? ` · ${activeRow.staff.position.name}`
                : null}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[#3D421F]">
                  Visa references
                </h3>
                <p className="mt-0.5 text-xs text-black/45">
                  Each residency card / NOC uploads to WorkDrive, linked to that
                  reference
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0"
                disabled={busy || formOpen}
                onClick={startAddRecord}
              >
                <Plus className="h-3.5 w-3.5" />
                Add new reference
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 px-4 py-10 text-sm text-black/45">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading records…
              </div>
            ) : loadError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                {loadError}
              </p>
            ) : records.length === 0 ? (
              <div className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm text-black/45">
                No visa records yet. Click{" "}
                <span className="font-medium text-[#3D421F]">
                  Add new reference
                </span>{" "}
                to create the first one.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-black/10">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-black/10 bg-black/[0.02] text-left text-xs uppercase tracking-wide text-black/45">
                      <tr>
                        <th className="px-3 py-2.5 font-medium">Visa no.</th>
                        <th className="px-3 py-2.5 font-medium">Status</th>
                        <th className="px-3 py-2.5 font-medium">Spend</th>
                        <th className="px-3 py-2.5 font-medium">Issue</th>
                        <th className="px-3 py-2.5 font-medium">Expire/Cancel</th>
                        <th className="px-3 py-2.5 font-medium">Residency</th>
                        <th className="px-3 py-2.5 font-medium">NOC</th>
                        <th className="px-3 py-2.5 text-right font-medium">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => {
                        const isLatest = record.id === latestId;
                        const canceled = Boolean(record.cancelDate);
                        const upload = rowUploads[record.id];
                        const nocUpload = rowNocUploads[record.id];
                        const uploading = upload?.uploading === true;
                        const nocUploading = nocUpload?.uploading === true;
                        const needsNoc = isSelfOwned(record.visaStatus);
                        return (
                          <tr
                            key={record.id}
                            className={cn(
                              "border-b border-black/5 last:border-0",
                              isLatest &&
                                "bg-[var(--venue-secondary,#F0F3DD)]/50",
                              editingRecordId === record.id &&
                                "ring-1 ring-inset ring-[var(--venue-primary,#818a40)]/40",
                            )}
                          >
                            <td className="px-3 py-2.5 align-middle text-[#3D421F]">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">
                                  {record.visaNumber || "—"}
                                </span>
                                {isLatest ? (
                                  <span className="inline-flex rounded-full border border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-primary,#818a40)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--venue-primary,#818a40)]">
                                    Current
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-middle text-[#3D421F]">
                              {record.visaStatus || "—"}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-[#3D421F]">
                              {record.valueSpend != null
                                ? formatAed(record.valueSpend)
                                : "—"}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-[#3D421F]">
                              {record.issueDate
                                ? formatDateOnly(record.issueDate)
                                : "—"}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2.5 align-middle",
                                canceled
                                  ? "font-medium text-red-700"
                                  : "text-[#3D421F]",
                              )}
                            >
                              {canceled && record.cancelDate
                                ? formatDateOnly(record.cancelDate)
                                : record.expiryDate
                                  ? formatDateOnly(record.expiryDate)
                                  : "—"}
                            </td>
                            <td className="px-3 py-2.5 align-middle">
                              <div className="flex min-w-[9rem] flex-col gap-1.5">
                                {record.hasDocument ? (
                                  <span className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                    <CheckCircle2
                                      className="h-3.5 w-3.5"
                                      aria-hidden
                                    />
                                    Linked
                                  </span>
                                ) : (
                                  <span className="inline-flex w-fit rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                    Missing
                                  </span>
                                )}
                                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-[#3D421F]/80 hover:text-[#3D421F]">
                                  <Upload
                                    className="h-3.5 w-3.5 shrink-0"
                                    aria-hidden
                                  />
                                  <span className="truncate">
                                    {upload?.file
                                      ? upload.file.name
                                      : record.hasDocument
                                        ? "Replace card"
                                        : "Choose card"}
                                  </span>
                                  <input
                                    type="file"
                                    accept={CARD_ACCEPT}
                                    form={DETACHED_FILE_FORM_ID}
                                    className="hidden"
                                    disabled={uploading || busy}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] ?? null;
                                      patchRowUpload(record.id, {
                                        file,
                                        progress: null,
                                      });
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                                {upload?.file ? (
                                  <button
                                    type="button"
                                    disabled={uploading || busy}
                                    onClick={() => {
                                      void handleRowCardUpload(record);
                                    }}
                                    className="inline-flex h-7 items-center justify-center gap-1 rounded-md bg-[#3D421F] px-2 text-[11px] font-semibold text-white transition hover:bg-[#2f3318] disabled:opacity-50"
                                  >
                                    {uploading ? (
                                      <>
                                        <Loader2
                                          className="h-3 w-3 animate-spin"
                                          aria-hidden
                                        />
                                        {upload.progress != null
                                          ? `${Math.round(upload.progress)}%`
                                          : "Saving…"}
                                      </>
                                    ) : (
                                      "Upload & link"
                                    )}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-middle">
                              {needsNoc ? (
                                <div className="flex min-w-[9rem] flex-col gap-1.5">
                                  {record.hasNocDocument ? (
                                    <span className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                      <CheckCircle2
                                        className="h-3.5 w-3.5"
                                        aria-hidden
                                      />
                                      Linked
                                    </span>
                                  ) : (
                                    <span className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                                      Missing
                                    </span>
                                  )}
                                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-[#3D421F]/80 hover:text-[#3D421F]">
                                    <Upload
                                      className="h-3.5 w-3.5 shrink-0"
                                      aria-hidden
                                    />
                                    <span className="truncate">
                                      {nocUpload?.file
                                        ? nocUpload.file.name
                                        : record.hasNocDocument
                                          ? "Replace NOC"
                                          : "Choose NOC"}
                                    </span>
                                    <input
                                      type="file"
                                      accept={CARD_ACCEPT}
                                      form={DETACHED_FILE_FORM_ID}
                                      className="hidden"
                                      disabled={nocUploading || busy}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0] ?? null;
                                        patchRowNocUpload(record.id, {
                                          file,
                                          progress: null,
                                        });
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                  {nocUpload?.file ? (
                                    <button
                                      type="button"
                                      disabled={nocUploading || busy}
                                      onClick={() => {
                                        void handleRowNocUpload(record);
                                      }}
                                      className="inline-flex h-7 items-center justify-center gap-1 rounded-md bg-[#3D421F] px-2 text-[11px] font-semibold text-white transition hover:bg-[#2f3318] disabled:opacity-50"
                                    >
                                      {nocUploading ? (
                                        <>
                                          <Loader2
                                            className="h-3 w-3 animate-spin"
                                            aria-hidden
                                          />
                                          {nocUpload.progress != null
                                            ? `${Math.round(nocUpload.progress)}%`
                                            : "Saving…"}
                                        </>
                                      ) : (
                                        "Upload & link"
                                      )}
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-xs text-black/35">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-right">
                              <div className="inline-flex items-center justify-end gap-0.5">
                                <button
                                  type="button"
                                  disabled={busy || uploading || nocUploading}
                                  onClick={() => startEditRecord(record)}
                                  className={cn(
                                    "inline-flex rounded-md p-1.5 transition disabled:opacity-50",
                                    editingRecordId === record.id
                                      ? "bg-[var(--venue-primary,#818a40)]/15 text-[var(--venue-primary,#818a40)]"
                                      : "text-black/35 hover:bg-black/5 hover:text-[#3D421F]",
                                  )}
                                  aria-label="Edit visa record"
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || uploading || nocUploading}
                                  onClick={() => handleDelete(record.id)}
                                  className="inline-flex rounded-md p-1.5 text-black/35 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                                  aria-label="Remove visa record"
                                  title="Remove"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {formOpen ? (
          <section className="space-y-3 overflow-hidden rounded-xl border border-black/10 bg-black/[0.015] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#3D421F]">
                {isEditing ? "Edit visa record" : "Add visa record"}
              </h3>
              <button
                type="button"
                className="text-xs font-medium text-black/50 transition hover:text-[#3D421F]"
                disabled={busy}
                onClick={() =>
                  resetAddForm({ visaStatus: activeRow.visaStatus ?? "" })
                }
              >
                {isEditing ? "Cancel edit" : "Cancel"}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="visa-emp-number">Residence Visa number</Label>
                <Input
                  id="visa-emp-number"
                  value={visaNumber}
                  onChange={(e) => setVisaNumber(e.target.value)}
                  placeholder="Visa / ref no."
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visa-emp-status">Visa status</Label>
                <select
                  id="visa-emp-status"
                  className={selectClass}
                  value={visaStatus}
                  onChange={(e) => setVisaStatus(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Select status</option>
                  {VISA_STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
                Value spend (AED)
              </p>
              <p className="text-[11px] text-black/40">
                Enter gross or net. The other amount and 5% tax update
                automatically.
              </p>
            </div>
            <div className={moneyAlignRowClass}>
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="visa-emp-issue">Issue date</Label>
                  <DateInput
                    id="visa-emp-issue"
                    value={issueDate}
                    onChange={setIssueDate}
                    disabled={busy}
                    className="w-full"
                    inputClassName="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="visa-emp-expiry">Expiring date</Label>
                  <DateInput
                    id="visa-emp-expiry"
                    value={expiryDate}
                    onChange={setExpiryDate}
                    disabled={busy}
                    className="w-full"
                    inputClassName="h-10"
                  />
                </div>
              </div>
              <div className={moneyBlockClass}>
                <div className="space-y-1.5">
                  <Label htmlFor="visa-emp-value">Gross</Label>
                  <Input
                    id="visa-emp-value"
                    type="number"
                    min={0}
                    step="0.01"
                    value={valueSpend}
                    onChange={(e) => {
                      const synced = syncFromGross(e.target.value);
                      setValueSpend(synced.gross);
                      setValueSpendNet(synced.net);
                    }}
                    disabled={busy}
                    placeholder="0"
                    className="bg-amber-50/80"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="visa-emp-tax">Tax (5%)</Label>
                  <Input
                    id="visa-emp-tax"
                    type="number"
                    min={0}
                    step="0.01"
                    value={grossAmount > 0 ? valueTax.toFixed(2) : ""}
                    readOnly
                    disabled
                    placeholder="0"
                    className="bg-amber-100/70"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="visa-emp-net">Net</Label>
                  <Input
                    id="visa-emp-net"
                    type="number"
                    min={0}
                    step="0.01"
                    value={valueSpendNet}
                    onChange={(e) => {
                      const synced = syncFromNet(e.target.value);
                      setValueSpend(synced.gross);
                      setValueSpendNet(synced.net);
                    }}
                    disabled={busy}
                    placeholder="0"
                    className="bg-amber-50/80"
                  />
                </div>
              </div>
              <span aria-hidden className={moneyTrailClass} />
            </div>

            {showDispute ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="visa-dispute-ref">Dispute reference</Label>
                  <Input
                    id="visa-dispute-ref"
                    value={disputeReference}
                    onChange={(e) => setDisputeReference(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="visa-dispute-comments">
                    Dispute comments
                  </Label>
                  <textarea
                    id="visa-dispute-comments"
                    value={disputeComments}
                    onChange={(e) => setDisputeComments(e.target.value)}
                    disabled={busy}
                    rows={3}
                    className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
                  />
                </div>
              </div>
            ) : null}

            {showCancel ? (
              <div className="-mx-4 space-y-2 border-y border-red-200/70 bg-red-50/40 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
                    Cancelation charge (AED)
                  </p>
                  <p className="mt-0.5 text-[11px] text-black/40">
                    Enter gross or net. Tax (5%) updates automatically. Rolled
                    into Visa Cancelations expenses by cancel date month.
                  </p>
                </div>
                <div className={moneyAlignRowClass}>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="visa-cancel-date">Cancel date</Label>
                    <DateInput
                      id="visa-cancel-date"
                      value={cancelDate}
                      onChange={setCancelDate}
                      disabled={busy}
                      className="w-full"
                      inputClassName="h-10"
                    />
                  </div>
                  <div className={moneyBlockClass}>
                    <div className="space-y-1.5">
                      <Label htmlFor="visa-cancel-gross">Gross</Label>
                      <Input
                        id="visa-cancel-gross"
                        type="number"
                        min={0}
                        step="0.01"
                        value={cancelationSpend}
                        onChange={(e) => {
                          const synced = syncFromGross(e.target.value);
                          setCancelationSpend(synced.gross);
                          setCancelationSpendNet(synced.net);
                        }}
                        disabled={busy}
                        placeholder="0"
                        className="bg-amber-50/80"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="visa-cancel-tax">Tax (5%)</Label>
                      <Input
                        id="visa-cancel-tax"
                        type="number"
                        min={0}
                        step="0.01"
                        value={
                          cancelGrossAmount > 0 ? cancelTax.toFixed(2) : ""
                        }
                        readOnly
                        disabled
                        placeholder="0"
                        className="bg-amber-100/70"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="visa-cancel-net">Net</Label>
                      <Input
                        id="visa-cancel-net"
                        type="number"
                        min={0}
                        step="0.01"
                        value={cancelationSpendNet}
                        onChange={(e) => {
                          const synced = syncFromNet(e.target.value);
                          setCancelationSpend(synced.gross);
                          setCancelationSpendNet(synced.net);
                        }}
                        disabled={busy}
                        placeholder="0"
                        className="bg-amber-50/80"
                      />
                    </div>
                  </div>
                  <span aria-hidden className={moneyTrailClass} />
                </div>
                <VisaCancelationFileField
                  staffId={activeRow.staff.id}
                  empNo={activeRow.staff.emp_no}
                  fullName={activeRow.staff.full_name}
                  fileSlotId={editingRecordId || activeRow.latestRecordId}
                  docExpiry={cancelDate}
                  readOnly={busy}
                />
              </div>
            ) : null}

            <div className="-mx-4 space-y-2 bg-black/[0.08] px-4 py-3">
              <div className={moneyAlignRowClass}>
                <div className="min-w-0 flex-1">
                  <Label>Penalties / fines</Label>
                  <p className="mt-0.5 text-[11px] text-black/40">
                    Enter gross or net. The other amount and 5% tax update
                    automatically.
                  </p>
                </div>
                <div className="flex w-[22rem] shrink-0 justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 shrink-0 border border-black/15 bg-white"
                    disabled={busy}
                    onClick={() =>
                      setPenalties((prev) => [
                        ...prev,
                        {
                          key: newKey(),
                          description: "",
                          amount: "",
                          netAmount: "",
                          companyCovered: true,
                        },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add fine
                  </Button>
                </div>
                <span aria-hidden className={moneyTrailClass} />
              </div>
              {penalties.length === 0 ? (
                <p className="text-xs text-black/45">
                  No penalties on this record.
                </p>
              ) : (
                <div className="space-y-2">
                  {penalties.map((p) => {
                    const fineGross = parseMoney(p.amount);
                    const fineTax =
                      fineGross > 0
                        ? splitGrossAtVatRate(fineGross).vat
                        : 0;
                    return (
                      <div
                        key={p.key}
                        className="space-y-2 rounded-lg py-3"
                      >
                        <div className={moneyAlignRowClass}>
                          <div className="min-w-0 flex-1 space-y-1">
                            <Label className="text-[11px] text-black/50">
                              Description/ Reason
                            </Label>
                            <Input
                              value={p.description}
                              onChange={(e) =>
                                setPenalties((prev) =>
                                  prev.map((item) =>
                                    item.key === p.key
                                      ? { ...item, description: e.target.value }
                                      : item,
                                  ),
                                )
                              }
                              placeholder="Description/ Reason"
                              disabled={busy}
                            />
                          </div>
                          <div className={moneyBlockClass}>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-black/50">
                                Gross
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={p.amount}
                                onChange={(e) => {
                                  const synced = syncFromGross(e.target.value);
                                  setPenalties((prev) =>
                                    prev.map((item) =>
                                      item.key === p.key
                                        ? {
                                            ...item,
                                            amount: synced.gross,
                                            netAmount: synced.net,
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                                placeholder="0"
                                disabled={busy}
                                className="bg-amber-50/80"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-black/50">
                                Tax (5%)
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={
                                  fineGross > 0 ? fineTax.toFixed(2) : ""
                                }
                                readOnly
                                disabled
                                placeholder="0"
                                className="bg-amber-100/70"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-black/50">
                                Net
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={p.netAmount}
                                onChange={(e) => {
                                  const synced = syncFromNet(e.target.value);
                                  setPenalties((prev) =>
                                    prev.map((item) =>
                                      item.key === p.key
                                        ? {
                                            ...item,
                                            amount: synced.gross,
                                            netAmount: synced.net,
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                                placeholder="0"
                                disabled={busy}
                                className="bg-amber-50/80"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            className={cn(
                              moneyTrailClass,
                              "-translate-x-1 rounded-md text-black/35 hover:bg-red-50 hover:text-red-700",
                            )}
                            onClick={() =>
                              setPenalties((prev) =>
                                prev.filter((item) => item.key !== p.key),
                              )
                            }
                            aria-label="Remove fine"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-1">
                          <label className="inline-flex items-center gap-2 text-xs text-[#3D421F]">
                            <input
                              type="checkbox"
                              checked={p.companyCovered}
                              onChange={(e) =>
                                setPenalties((prev) =>
                                  prev.map((item) =>
                                    item.key === p.key
                                      ? {
                                          ...item,
                                          companyCovered: e.target.checked,
                                        }
                                      : item,
                                  ),
                                )
                              }
                              className="h-4 w-4 rounded border-black/20"
                              disabled={busy}
                            />
                            Company covered
                          </label>
                          <p className="text-[11px] text-black/40">
                            {p.companyCovered
                              ? "Counted as company visa expense"
                              : "Queued for payroll → Import Deductions (Visa runs)"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="visa-other-comments">Other comments</Label>
              <textarea
                id="visa-other-comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                disabled={busy}
                rows={2}
                className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
              />
            </div>

            <div className="rounded-lg border border-dashed border-black/15 bg-white/70 p-3">
              <div className="mb-2">
                <p className="text-sm font-medium text-[#3D421F]">
                  Residency card for this reference
                </p>
                <p className="text-xs text-black/45">
                  {isEditing
                    ? existingCard
                      ? "Current WorkDrive file below — drop or click to replace it."
                      : "Optional — adds the card linked to this reference."
                    : "Optional now — linked to the new reference after you add it."}
                </p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <StaffDocumentUploadSlot
                  className="shrink-0"
                  label="Upload residency card"
                  file={newCardFile}
                  onFileChange={(file) => {
                    setNewCardFile(file);
                    setNewCardNote(null);
                  }}
                  uploadingToDrive={newCardUploading}
                  uploadProgress={newCardProgress}
                  driveUploadNote={newCardNote}
                />
                <div className="min-w-0 flex-1">
                  {existingCard ? (
                    <StaffWorkDriveDocumentList
                      items={[toWorkDriveListItem(existingCard)]}
                      className="mt-0"
                      onDeleted={() => {
                        void reloadRecords(activeRow.staff.id);
                        onSaved();
                      }}
                      onRenamed={() => {
                        void reloadRecords(activeRow.staff.id);
                        onSaved();
                      }}
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-3 py-4 text-center text-[11px] text-black/40">
                      No residency card linked yet
                    </p>
                  )}
                </div>
              </div>
            </div>

            {showNoc ? (
              <div className="rounded-lg border border-dashed border-black/15 bg-white/70 p-3">
                <div className="mb-2">
                  <p className="text-sm font-medium text-[#3D421F]">
                    NOC for this reference
                  </p>
                  <p className="text-xs text-black/45">
                    {existingNoc
                      ? "Current WorkDrive file below — drop or click to replace it."
                      : "Required when visa is self owned — linked to this reference."}
                  </p>
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-start">
                  <StaffDocumentUploadSlot
                    className="shrink-0"
                    label="Upload NOC"
                    file={newNocFile}
                    onFileChange={(file) => {
                      setNewNocFile(file);
                      setNewNocNote(null);
                    }}
                    uploadingToDrive={newNocUploading}
                    uploadProgress={newNocProgress}
                    driveUploadNote={newNocNote}
                  />
                  <div className="min-w-0 flex-1">
                    {existingNoc ? (
                      <StaffWorkDriveDocumentList
                        items={[toWorkDriveListItem(existingNoc)]}
                        className="mt-0"
                        onDeleted={() => {
                          void reloadRecords(activeRow.staff.id);
                          onSaved();
                        }}
                        onRenamed={() => {
                          void reloadRecords(activeRow.staff.id);
                          onSaved();
                        }}
                      />
                    ) : (
                      <p className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-3 py-4 text-center text-[11px] text-black/40">
                        No NOC linked yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                disabled={busy}
                onClick={() =>
                  resetAddForm({ visaStatus: activeRow.visaStatus ?? "" })
                }
              >
                Cancel
              </Button>
              <Button type="button" disabled={busy} onClick={handleSave}>
                {pending || newCardUploading || newNocUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : isEditing ? (
                  <Pencil className="h-4 w-4" aria-hidden />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden />
                )}
                {isEditing
                  ? newCardFile || newNocFile
                    ? "Save & upload docs"
                    : "Save changes"
                  : newCardFile || newNocFile
                    ? "Add record & upload docs"
                    : "Add record"}
              </Button>
            </div>
          </section>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-black/10 px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
