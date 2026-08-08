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
  addStaffInsuranceRecord,
  deleteStaffInsuranceRecord,
  listStaffInsuranceRecords,
  updateStaffInsuranceRecord,
} from "@/lib/actions/hr-insurance";
import { StaffDocumentUploadSlot } from "@/components/hr/staff-document-upload-slot";
import { StaffWorkDriveDocumentList } from "@/components/hr/staff-workdrive-document-list";
import { Button } from "@/components/ui/button";
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
import type {
  InsuranceCategoryWithDefaults,
  InsuranceEmployeeRow,
  StaffInsuranceRecord,
  StaffLinkedWorkDriveDocument,
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

function applyValueSeed(raw: string | undefined): {
  gross: string;
  net: string;
} {
  const gross = raw?.trim() ? raw : "";
  return syncFromGross(gross);
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

type InsuranceEmployeeEditDialogProps = {
  row: InsuranceEmployeeRow | null;
  categories: InsuranceCategoryWithDefaults[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

const selectClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

const CARD_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp";

type RowUploadState = {
  file: File | null;
  uploading: boolean;
  progress: number | null;
};

export function InsuranceEmployeeEditDialog({
  row,
  categories,
  open,
  onOpenChange,
  onSaved,
}: InsuranceEmployeeEditDialogProps) {
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<StaffInsuranceRecord[]>([]);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reference, setReference] = useState("");
  const [category, setCategory] = useState("");
  const [value, setValue] = useState("");
  const [valueNet, setValueNet] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [newCardFile, setNewCardFile] = useState<File | null>(null);
  const [newCardUploading, setNewCardUploading] = useState(false);
  const [newCardProgress, setNewCardProgress] = useState<number | null>(null);
  const [newCardNote, setNewCardNote] = useState<string | null>(null);
  const [rowUploads, setRowUploads] = useState<Record<string, RowUploadState>>(
    {},
  );

  function seedFromRow(source: InsuranceEmployeeRow | null | undefined) {
    if (!source) return { category: "", value: "" };
    return {
      category: source.category || source.suggestedCategoryName || "",
      value:
        source.value != null
          ? String(source.value)
          : source.suggestedValue != null
            ? String(source.suggestedValue)
            : "",
    };
  }

  function resetAddForm(seed?: {
    category?: string;
    value?: string;
  }) {
    setEditingRecordId(null);
    setFormOpen(false);
    setReference("");
    setCategory(seed?.category ?? "");
    {
      const synced = applyValueSeed(seed?.value);
      setValue(synced.gross);
      setValueNet(synced.net);
    }
    setIssueDate("");
    setExpiryDate("");
    setNewCardFile(null);
    setNewCardNote(null);
    setNewCardProgress(null);
  }

  function startAddRecord() {
    resetAddForm(seedFromRow(row));
    setFormOpen(true);
  }

  function startEditRecord(record: StaffInsuranceRecord) {
    setEditingRecordId(record.id);
    setFormOpen(true);
    setReference(record.reference ?? "");
    setCategory(record.category ?? "");
    {
      const synced = applyValueSeed(
        record.value != null ? String(record.value) : "",
      );
      setValue(synced.gross);
      setValueNet(synced.net);
    }
    setIssueDate(record.issueDate ?? "");
    setExpiryDate(record.expiryDate ?? "");
    setNewCardFile(null);
    setNewCardNote(null);
    setNewCardProgress(null);
  }

  function reloadRecords(staffId: string) {
    return listStaffInsuranceRecords({ staffId }).then((result) => {
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

    resetAddForm(seedFromRow(row));
    setRowUploads({});
    setNewCardUploading(false);

    setLoading(true);
    setLoadError(null);
    setRecords([]);
    setLatestId(null);

    let cancelled = false;
    void listStaffInsuranceRecords({ staffId: row.staff.id }).then(
      (result) => {
        if (cancelled) return;
        setLoading(false);
        if (!result.ok) {
          setLoadError(result.error);
          return;
        }
        setRecords(result.records);
        setLatestId(result.latestId);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [open, row]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending && !newCardUploading) {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange, pending, newCardUploading]);

  if (!open || !row || typeof document === "undefined") return null;

  const activeRow = row;
  const grossAmount = parseMoney(value);
  const { vat: valueTax } = splitGrossAtVatRate(grossAmount);

  function handleCategoryChange(name: string) {
    setCategory(name);
    const match = categories.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (match && (!value || value === "0")) {
      const synced = applyValueSeed(
        String(match.default_medical_value || ""),
      );
      setValue(synced.gross);
      setValueNet(synced.net);
    }
  }

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

  async function uploadCardForRecord(
    record: StaffInsuranceRecord,
    file: File,
    onProgress: (percent: number) => void,
  ) {
    return uploadStaffDocumentViaApi({
      staffId: activeRow.staff.id,
      empNo: activeRow.staff.emp_no,
      fullName: activeRow.staff.full_name,
      docKind: "medical_insurance",
      fileSlotId: record.id,
      docExpiry: record.expiryDate,
      file,
      onProgress,
    });
  }

  async function handleRowCardUpload(record: StaffInsuranceRecord) {
    const state = rowUploads[record.id];
    if (!state?.file || state.uploading) return;
    const file = state.file;
    patchRowUpload(record.id, { uploading: true, progress: 0 });
    try {
      const result = await uploadCardForRecord(record, file, (percent) => {
        patchRowUpload(record.id, { file, uploading: true, progress: percent });
      });
      if (!result.ok) {
        toast.error(result.error);
        patchRowUpload(record.id, {
          uploading: false,
          progress: null,
        });
        return;
      }
      toast.saved(
        `Card linked to ${record.reference.trim() || "this reference"}.`,
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

  function handleSave() {
    if (!category.trim()) {
      toast.error("Choose an insurance category.");
      return;
    }

    if (editingRecordId) {
      startTransition(async () => {
        const result = await updateStaffInsuranceRecord({
          staffId: activeRow.staff.id,
          recordId: editingRecordId,
          reference: reference.trim() || undefined,
          category: category.trim(),
          value: value.trim() === "" ? null : Number(value) || 0,
          issueDate: issueDate || null,
          expiryDate: expiryDate || null,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        if (newCardFile) {
          setNewCardUploading(true);
          setNewCardProgress(0);
          setNewCardNote(null);
          try {
            const uploaded = await uploadCardForRecord(
              result.record,
              newCardFile,
              (percent) => setNewCardProgress(percent),
            );
            if (!uploaded.ok) {
              toast.error(
                `Record updated, but card upload failed: ${uploaded.error}`,
              );
              setNewCardNote(uploaded.error);
            } else {
              toast.saved("Insurance record and card updated.");
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Upload failed.";
            toast.error(`Record updated, but card upload failed: ${message}`);
            setNewCardNote(message);
          } finally {
            setNewCardUploading(false);
            setNewCardProgress(null);
          }
        } else {
          toast.saved("Insurance record updated.");
        }

        await reloadRecords(activeRow.staff.id);
        onSaved();
        resetAddForm({
          category: category.trim(),
          value: value.trim(),
        });
      });
      return;
    }

    startTransition(async () => {
      const result = await addStaffInsuranceRecord({
        staffId: activeRow.staff.id,
        reference: reference.trim() || undefined,
        category: category.trim(),
        value: value.trim() === "" ? null : Number(value) || 0,
        issueDate: issueDate || null,
        expiryDate: expiryDate || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (newCardFile) {
        setNewCardUploading(true);
        setNewCardProgress(0);
        setNewCardNote(null);
        try {
          const uploaded = await uploadCardForRecord(
            result.record,
            newCardFile,
            (percent) => setNewCardProgress(percent),
          );
          if (!uploaded.ok) {
            toast.error(
              `Record saved, but card upload failed: ${uploaded.error}`,
            );
            setNewCardNote(uploaded.error);
          } else {
            toast.saved("Insurance record and card saved.");
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Upload failed.";
          toast.error(`Record saved, but card upload failed: ${message}`);
          setNewCardNote(message);
        } finally {
          setNewCardUploading(false);
          setNewCardProgress(null);
        }
      } else {
        toast.saved("Insurance record added.");
      }

      await reloadRecords(activeRow.staff.id);
      onSaved();
      resetAddForm({
        category: category.trim(),
        value: value.trim(),
      });
    });
  }

  function handleDelete(recordId: string) {
    startTransition(async () => {
      const result = await deleteStaffInsuranceRecord({
        staffId: activeRow.staff.id,
        recordId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Insurance record removed.");
      if (editingRecordId === recordId) {
        resetAddForm({
          category: activeRow.category || activeRow.suggestedCategoryName || "",
          value:
            activeRow.value != null
              ? String(activeRow.value)
              : activeRow.suggestedValue != null
                ? String(activeRow.suggestedValue)
                : "",
        });
      }
      const next = records.filter((r) => r.id !== recordId);
      setRecords(next);
      setLatestId(next[0]?.id ?? null);
      onSaved();
    });
  }

  const busy = pending || newCardUploading;
  const isEditing = editingRecordId != null;
  const editingRecord = isEditing
    ? (records.find((r) => r.id === editingRecordId) ?? null)
    : null;
  const existingCard =
    editingRecord?.document ??
    (editingRecord?.hasDocument &&
    activeRow.document &&
    editingRecord.id === latestId
      ? activeRow.document
      : null);

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
        aria-labelledby="insurance-employee-edit-title"
        className="flex max-h-[min(92dvh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="insurance-employee-edit-title"
              className="font-nav text-base font-semibold text-[#3D421F]"
            >
              {activeRow.staff.full_name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Emp. {activeRow.staff.emp_no}
              {activeRow.suggestedCategoryName && !activeRow.category ? (
                <span> · Suggested: {activeRow.suggestedCategoryName}</span>
              ) : null}
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
                  Insurance references
                </h3>
                <p className="mt-0.5 text-xs text-black/45">
                  Each card uploads to WorkDrive → Insurance, linked to that
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
                No insurance records yet. Click{" "}
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
                        <th className="px-3 py-2.5 font-medium">Reference</th>
                        <th className="px-3 py-2.5 font-medium">Category</th>
                        <th className="px-3 py-2.5 font-medium">Value</th>
                        <th className="px-3 py-2.5 font-medium">Issue</th>
                        <th className="px-3 py-2.5 font-medium">Expiry</th>
                        <th className="px-3 py-2.5 font-medium">Card</th>
                        <th className="px-3 py-2.5 text-right font-medium">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => {
                        const isLatest = record.id === latestId;
                        const upload = rowUploads[record.id];
                        const uploading = upload?.uploading === true;
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
                                  {record.reference || "—"}
                                </span>
                                {isLatest ? (
                                  <span className="inline-flex rounded-full border border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-primary,#818a40)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--venue-primary,#818a40)]">
                                    Current
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-middle text-[#3D421F]">
                              {record.category || "—"}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-[#3D421F]">
                              {record.value != null
                                ? formatAed(record.value)
                                : "—"}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-[#3D421F]">
                              {record.issueDate
                                ? formatDateOnly(record.issueDate)
                                : "—"}
                            </td>
                            <td className="px-3 py-2.5 align-middle text-[#3D421F]">
                              {record.expiryDate
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
                            <td className="px-3 py-2.5 align-middle text-right">
                              <div className="inline-flex items-center justify-end gap-0.5">
                                <button
                                  type="button"
                                  disabled={busy || uploading}
                                  onClick={() => startEditRecord(record)}
                                  className={cn(
                                    "inline-flex rounded-md p-1.5 transition disabled:opacity-50",
                                    editingRecordId === record.id
                                      ? "bg-[var(--venue-primary,#818a40)]/15 text-[var(--venue-primary,#818a40)]"
                                      : "text-black/35 hover:bg-black/5 hover:text-[#3D421F]",
                                  )}
                                  aria-label="Edit insurance record"
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  disabled={busy || uploading}
                                  onClick={() => handleDelete(record.id)}
                                  className="inline-flex rounded-md p-1.5 text-black/35 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                                  aria-label="Remove insurance record"
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
          <section className="space-y-3 rounded-xl border border-black/10 bg-black/[0.015] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#3D421F]">
                {isEditing ? "Edit insurance record" : "Add insurance record"}
              </h3>
              <button
                type="button"
                className="text-xs font-medium text-black/50 transition hover:text-[#3D421F]"
                disabled={busy}
                onClick={() => resetAddForm(seedFromRow(activeRow))}
              >
                {isEditing ? "Cancel edit" : "Cancel"}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ins-emp-reference">Reference</Label>
                <Input
                  id="ins-emp-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Policy / ref no."
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ins-emp-category">Insurance category</Label>
                <select
                  id="ins-emp-category"
                  className={selectClass}
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Insurance value (AED)</Label>
                <p className="text-[11px] text-black/40">
                  Enter gross or net — 5% tax updates automatically.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label
                      htmlFor="ins-emp-value"
                      className="text-[11px] text-black/50"
                    >
                      Gross
                    </Label>
                    <Input
                      id="ins-emp-value"
                      type="number"
                      min={0}
                      step="0.01"
                      value={value}
                      onChange={(e) => {
                        const synced = syncFromGross(e.target.value);
                        setValue(synced.gross);
                        setValueNet(synced.net);
                      }}
                      disabled={busy}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor="ins-emp-tax"
                      className="text-[11px] text-black/50"
                    >
                      Tax (5%)
                    </Label>
                    <Input
                      id="ins-emp-tax"
                      type="number"
                      min={0}
                      step="0.01"
                      value={grossAmount > 0 ? valueTax.toFixed(2) : ""}
                      readOnly
                      disabled
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor="ins-emp-net"
                      className="text-[11px] text-black/50"
                    >
                      Net
                    </Label>
                    <Input
                      id="ins-emp-net"
                      type="number"
                      min={0}
                      step="0.01"
                      value={valueNet}
                      onChange={(e) => {
                        const synced = syncFromNet(e.target.value);
                        setValue(synced.gross);
                        setValueNet(synced.net);
                      }}
                      disabled={busy}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ins-emp-issue">Issue date</Label>
                  <DateInput
                    id="ins-emp-issue"
                    value={issueDate}
                    onChange={setIssueDate}
                    disabled={busy}
                    className="h-10 w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ins-emp-expiry">Expiry date</Label>
                  <DateInput
                    id="ins-emp-expiry"
                    value={expiryDate}
                    onChange={setExpiryDate}
                    disabled={busy}
                    className="h-10 w-full"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-black/15 bg-white/70 p-3">
              <div className="mb-2">
                <p className="text-sm font-medium text-[#3D421F]">
                  Insurance card for this reference
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
                  label="Upload insurance card"
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
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-3 py-4 text-center text-[11px] text-black/40">
                      No insurance card linked yet
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                disabled={busy}
                onClick={() => resetAddForm(seedFromRow(activeRow))}
              >
                Cancel
              </Button>
              <Button type="button" disabled={busy} onClick={handleSave}>
                {pending || newCardUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : isEditing ? (
                  <Pencil className="h-4 w-4" aria-hidden />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden />
                )}
                {isEditing
                  ? newCardFile
                    ? "Save & upload card"
                    : "Save changes"
                  : newCardFile
                    ? "Add record & upload card"
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
