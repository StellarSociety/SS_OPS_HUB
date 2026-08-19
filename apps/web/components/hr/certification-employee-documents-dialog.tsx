"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { StaffDocumentUploadSlot } from "@/components/hr/staff-document-upload-slot";
import { StaffWorkDriveDocumentList } from "@/components/hr/staff-workdrive-document-list";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { StatusBadge } from "@/components/hr/status-badge";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "@/components/ui/toast";
import {
  matchesCertificationFileSlot,
  workDriveTargetForCertField,
} from "@/lib/hr/certification-workdrive";
import { addMonths, daysUntil, formatDateOnly } from "@/lib/hr/derived";
import { uploadStaffDocumentViaApi } from "@/lib/hr/workdrive/client-upload";
import {
  setStaffCertificationDate,
  setStaffCertificationEmployeeProvided,
} from "@/lib/actions/hr-certifications";
import {
  listStaffWorkDriveDocs,
  type StaffWorkDriveDocumentListItem,
} from "@/lib/actions/hr-workdrive";
import type {
  CertificationEmployeeRow,
  CertificationStatus,
  CertificationType,
  StaffCertificationCell,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type CertificationEmployeeDocumentsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: CertificationEmployeeRow;
  types: CertificationType[];
  canManage: boolean;
};

type SlotState = {
  file: File | null;
  uploading: boolean;
  progress: number | null;
  note: string | null;
};

function emptySlot(): SlotState {
  return { file: null, uploading: false, progress: null, note: null };
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function deriveCertTiming(
  certifiedAt: string | null,
  renewalMonths: number,
  leadDays: number,
): {
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  status: CertificationStatus;
} {
  const expiresAt = certifiedAt
    ? toIsoDate(addMonths(certifiedAt, Math.max(1, renewalMonths || 12)))
    : null;
  const until = expiresAt != null ? daysUntil(expiresAt) : null;
  let status: CertificationStatus = "missing";
  if (expiresAt != null && until != null) {
    if (until < 0) status = "expired";
    else if (until <= Math.max(0, leadDays || 30)) status = "expiring";
    else status = "valid";
  }
  return { expiresAt, daysUntilExpiry: until, status };
}

function CertDocsSection({
  cell,
  label,
  docs,
  docsLoading,
  canManage,
  slot,
  certifiedAt,
  dateBusy,
  employeeProvided,
  employeeProvidedBusy,
  onCertifiedAtChange,
  onEmployeeProvidedChange,
  onSlotChange,
  onUpload,
  onDeleted,
  onRenamed,
}: {
  cell: StaffCertificationCell;
  label: string;
  docs: StaffWorkDriveDocumentListItem[];
  docsLoading: boolean;
  canManage: boolean;
  slot: SlotState;
  certifiedAt: string | null;
  dateBusy: boolean;
  employeeProvided: boolean;
  employeeProvidedBusy: boolean;
  onCertifiedAtChange: (next: string | null) => void;
  onEmployeeProvidedChange: (next: boolean) => void;
  onSlotChange: (next: SlotState) => void;
  onUpload: () => void;
  onDeleted: (documentId: string) => void;
  onRenamed: (
    documentId: string,
    next: { fileName: string; path: string | null },
  ) => void;
}) {
  const timing = deriveCertTiming(
    certifiedAt,
    cell.renewalMonths,
    cell.leadDays,
  );
  const mandatoryMissing =
    timing.status === "missing" &&
    (cell.staffField === "ohc_date" ||
      cell.staffField === "basic_food_safety_date");
  const alert = timing.status === "expired" || mandatoryMissing;

  return (
    <section
      className={cn(
        "rounded-xl border bg-white/80 p-4",
        alert
          ? "border-red-200/80 bg-red-50/50"
          : "border-black/10",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-nav text-sm font-semibold text-[#3D421F]">
            {label}
          </h3>
          <p className="mt-0.5 text-xs text-black/45">{cell.name}</p>
          <div
            className={cn(
              "mt-2 inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-1.5 rounded-md px-2 py-1.5 text-xs font-medium tabular-nums",
              alert
                ? "bg-red-100 text-red-900 ring-1 ring-inset ring-red-200/80"
                : timing.status === "expiring"
                  ? "bg-amber-100 text-amber-950 ring-1 ring-inset ring-amber-200/80"
                  : timing.status === "valid"
                    ? "bg-[var(--venue-secondary,#F0F3DD)] text-[#3D421F] ring-1 ring-inset ring-[var(--venue-primary,#818a40)]/25"
                    : "bg-black/[0.04] text-black/55 ring-1 ring-inset ring-black/10",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="opacity-60">Cert</span>
              {canManage ? (
                <DateInput
                  value={certifiedAt ?? ""}
                  onChange={(iso) => onCertifiedAtChange(iso || null)}
                  disabled={dateBusy}
                  aria-label={`${label} certification date`}
                  className="inline-flex"
                  inputClassName="h-7 w-[8.75rem] rounded-md border border-black/15 bg-white px-2 text-xs text-[#3D421F] shadow-sm outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20 disabled:opacity-60"
                />
              ) : (
                <span>{certifiedAt ? formatDateOnly(certifiedAt) : "—"}</span>
              )}
            </span>
            <span className="opacity-30" aria-hidden>
              ·
            </span>
            <span>
              <span className="opacity-60">Exp</span>{" "}
              {timing.expiresAt ? formatDateOnly(timing.expiresAt) : "—"}
            </span>
            {timing.daysUntilExpiry != null ? (
              <>
                <span className="opacity-30" aria-hidden>
                  ·
                </span>
                <span
                  className={cn(
                    "font-semibold",
                    timing.daysUntilExpiry < 0 && "text-red-700",
                    timing.daysUntilExpiry >= 0 &&
                      timing.daysUntilExpiry <= cell.leadDays &&
                      "text-amber-800",
                  )}
                >
                  {timing.daysUntilExpiry < 0
                    ? `${Math.abs(timing.daysUntilExpiry)}d overdue`
                    : timing.daysUntilExpiry === 0
                      ? "expires today"
                      : `${timing.daysUntilExpiry}d left`}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            timing.status === "valid" && "bg-emerald-100 text-emerald-800",
            timing.status === "expiring" && "bg-amber-100 text-amber-900",
            timing.status === "expired" && "bg-red-100 text-red-800",
            timing.status === "missing" &&
              (mandatoryMissing
                ? "bg-red-100 text-red-800"
                : "bg-black/5 text-black/45"),
          )}
        >
          {timing.status}
        </span>
      </div>

      <label
        className={cn(
          "mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition",
          employeeProvided
            ? "border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-secondary,#F0F3DD)]/50"
            : "border-black/10 bg-black/[0.015] hover:bg-black/[0.03]",
          (!canManage || employeeProvidedBusy) && "cursor-default opacity-80",
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-black/25 text-[var(--venue-primary,#818a40)] focus:ring-[var(--venue-primary,#818a40)]/30"
          checked={employeeProvided}
          disabled={!canManage || employeeProvidedBusy}
          onChange={(e) => onEmployeeProvidedChange(e.target.checked)}
        />
        <span className="min-w-0">
          <span className="block font-medium text-[#3D421F]">
            Employee provided certificate
          </span>
          <span className="mt-0.5 block text-xs text-black/45">
            When checked, this certificate is excluded from company expenses.
          </span>
        </span>
      </label>

      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start">
        {canManage ? (
          <StaffDocumentUploadSlot
            className="shrink-0"
            file={slot.file}
            onFileChange={(file) =>
              onSlotChange({ ...slot, file, note: null })
            }
            uploadingToDrive={slot.uploading}
            uploadProgress={slot.progress}
            driveUploadNote={slot.note}
            onUploadToDrive={
              slot.file && !slot.uploading ? onUpload : undefined
            }
          />
        ) : null}
        <div className="min-w-0 flex-1">
          {docsLoading && docs.length === 0 ? (
            <p className="text-[11px] text-black/40">Loading documents…</p>
          ) : null}
          <StaffWorkDriveDocumentList
            items={docs}
            readOnly={!canManage}
            className="mt-0"
            onDeleted={onDeleted}
            onRenamed={onRenamed}
          />
          {!docsLoading && docs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-3 py-4 text-center text-[11px] text-black/40">
              No certificate file uploaded yet
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function CertificationEmployeeDocumentsDialog({
  open,
  onOpenChange,
  row,
  types,
  canManage,
}: CertificationEmployeeDocumentsDialogProps) {
  const router = useRouter();
  const staff = row.staff;
  const [, startProvidedTransition] = useTransition();
  const [, startDateTransition] = useTransition();
  const [docsByKind, setDocsByKind] = useState<{
    ohc: StaffWorkDriveDocumentListItem[];
    training: StaffWorkDriveDocumentListItem[];
  }>({ ohc: [], training: [] });
  const [docsLoading, setDocsLoading] = useState(false);
  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [providedByField, setProvidedByField] = useState<
    Record<string, boolean>
  >({});
  const [providedBusyField, setProvidedBusyField] = useState<string | null>(
    null,
  );
  const [datesByField, setDatesByField] = useState<
    Record<string, string | null>
  >({});
  const [dateBusyField, setDateBusyField] = useState<string | null>(null);

  const cells = types
    .filter((t) => !t.archived_at)
    .map((t) => {
      const cell = row.certifications.find((c) => c.certificationId === t.id);
      if (!cell) return null;
      return {
        cell,
        label: t.label.trim() || t.name,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        cell: StaffCertificationCell;
        label: string;
      } => entry != null,
    );

  const refreshDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const [ohc, training] = await Promise.all([
        listStaffWorkDriveDocs({ staffId: staff.id, docKind: "ohc" }),
        listStaffWorkDriveDocs({
          staffId: staff.id,
          docKind: "training_certificates",
        }),
      ]);
      setDocsByKind({
        ohc: ohc.ok ? ohc.items : [],
        training: training.ok ? training.items : [],
      });
    } finally {
      setDocsLoading(false);
    }
  }, [staff.id]);

  useEffect(() => {
    if (!open) return;
    void refreshDocs();
    setSlots({});
    const nextProvided: Record<string, boolean> = {};
    const nextDates: Record<string, string | null> = {};
    for (const entry of row.certifications) {
      nextProvided[entry.staffField] = entry.employeeProvided;
      nextDates[entry.staffField] = entry.certifiedAt;
    }
    setProvidedByField(nextProvided);
    setDatesByField(nextDates);
  }, [open, refreshDocs, row.certifications, row.staff.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  function handleCertifiedAtChange(
    cell: StaffCertificationCell,
    next: string | null,
  ) {
    if (!canManage || dateBusyField) return;
    const previous = datesByField[cell.staffField] ?? cell.certifiedAt;
    if ((previous ?? null) === (next ?? null)) return;
    setDatesByField((prev) => ({ ...prev, [cell.staffField]: next }));
    setDateBusyField(cell.staffField);
    startDateTransition(async () => {
      const result = await setStaffCertificationDate({
        staffId: staff.id,
        staffField: cell.staffField,
        certifiedAt: next,
      });
      setDateBusyField(null);
      if (!result.ok) {
        setDatesByField((prev) => ({
          ...prev,
          [cell.staffField]: previous,
        }));
        toast.error(result.error);
        return;
      }
      toast.saved(
        next
          ? "Certification date updated."
          : "Certification date cleared.",
      );
      router.refresh();
    });
  }

  function handleEmployeeProvidedChange(
    cell: StaffCertificationCell,
    next: boolean,
  ) {
    if (!canManage || providedBusyField) return;
    const previous = providedByField[cell.staffField] ?? cell.employeeProvided;
    setProvidedByField((prev) => ({ ...prev, [cell.staffField]: next }));
    setProvidedBusyField(cell.staffField);
    startProvidedTransition(async () => {
      const result = await setStaffCertificationEmployeeProvided({
        staffId: staff.id,
        staffField: cell.staffField,
        employeeProvided: next,
      });
      setProvidedBusyField(null);
      if (!result.ok) {
        setProvidedByField((prev) => ({
          ...prev,
          [cell.staffField]: previous,
        }));
        toast.error(result.error);
        return;
      }
      toast.saved(
        next
          ? "Marked as employee-provided (excluded from expenses)."
          : "Marked as company expense.",
      );
      router.refresh();
    });
  }

  if (!open || typeof document === "undefined") return null;

  function docsForCell(cell: StaffCertificationCell) {
    const target = workDriveTargetForCertField(cell.staffField);
    const pool =
      target.docKind === "ohc" ? docsByKind.ohc : docsByKind.training;
    if (target.docKind === "ohc") return pool;
    return pool.filter((item) =>
      matchesCertificationFileSlot(
        item.fileName,
        target.fileSlotId,
        item.fileSlotId,
      ),
    );
  }

  function getSlot(certId: string): SlotState {
    return slots[certId] ?? emptySlot();
  }

  function patchSlot(certId: string, next: SlotState) {
    setSlots((prev) => ({ ...prev, [certId]: next }));
  }

  async function handleUpload(cell: StaffCertificationCell) {
    const state = getSlot(cell.certificationId);
    if (!state.file || state.uploading) return;
    const target = workDriveTargetForCertField(cell.staffField);
    patchSlot(cell.certificationId, {
      ...state,
      uploading: true,
      progress: 0,
      note: null,
    });
    try {
      const result = await uploadStaffDocumentViaApi({
        staffId: staff.id,
        empNo: staff.emp_no,
        fullName: staff.full_name,
        docKind: target.docKind,
        fileSlotId: target.fileSlotId,
        file: state.file,
        onProgress: (percent) => {
          setSlots((prev) => ({
            ...prev,
            [cell.certificationId]: {
              ...(prev[cell.certificationId] ?? emptySlot()),
              file: state.file,
              uploading: true,
              progress: percent,
              note: null,
            },
          }));
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        patchSlot(cell.certificationId, {
          ...state,
          uploading: false,
          progress: null,
          note: result.error,
        });
        return;
      }
      toast.saved(`${cell.name} uploaded to WorkDrive`);
      patchSlot(cell.certificationId, emptySlot());
      await refreshDocs();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed.";
      toast.error(message);
      patchSlot(cell.certificationId, {
        ...state,
        uploading: false,
        progress: null,
        note: message,
      });
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cert-docs-dialog-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#f7f8f1] shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 bg-white px-5 py-4">
          <div className="flex min-w-0 flex-1 items-stretch gap-3.5">
            <StaffPhotoThumbnail
              fullName={staff.full_name}
              photoUrl={staff.photo_url}
              size="fill"
              className="w-[5.25rem] self-stretch text-base"
              empNo={staff.emp_no}
              department={staff.department?.name}
              position={staff.position?.name}
              employeeStatus={staff.employment_status?.name}
              workingStatus={staff.working_status?.name}
              nationality={staff.nationality?.name}
              dob={staff.dob}
              joiningDate={staff.joining_date}
              terminationDate={staff.termination_date}
            />
            <div className="min-w-0 flex-1">
              <h2
                id="cert-docs-dialog-title"
                className="font-nav text-base font-semibold text-[#3D421F]"
              >
                {staff.full_name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-black/55">
                <StaffDirectoryLink staffId={staff.id} empNo={staff.emp_no} />
                {staff.department?.name ? (
                  <span>· {staff.department.name}</span>
                ) : null}
                {staff.position?.name ? (
                  <span>· {staff.position.name}</span>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-black/45">
                <StatusBadge status={staff.employment_status?.name} />
                <span>
                  Joined{" "}
                  {staff.joining_date ? formatDateOnly(staff.joining_date) : "—"}
                  {" · "}
                  Terminated{" "}
                  {staff.termination_date
                    ? formatDateOnly(staff.termination_date)
                    : "—"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Review each certification and upload files to Zoho WorkDrive
                (Drive Setup renaming rules apply).
              </p>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {cells.map(({ cell, label }) => (
            <CertDocsSection
              key={cell.certificationId}
              cell={cell}
              label={label}
              docs={docsForCell(cell)}
              docsLoading={docsLoading}
              canManage={canManage}
              slot={getSlot(cell.certificationId)}
              certifiedAt={
                datesByField[cell.staffField] ?? cell.certifiedAt
              }
              dateBusy={dateBusyField === cell.staffField}
              employeeProvided={
                providedByField[cell.staffField] ?? cell.employeeProvided
              }
              employeeProvidedBusy={providedBusyField === cell.staffField}
              onCertifiedAtChange={(next) =>
                handleCertifiedAtChange(cell, next)
              }
              onEmployeeProvidedChange={(next) =>
                handleEmployeeProvidedChange(cell, next)
              }
              onSlotChange={(next) => patchSlot(cell.certificationId, next)}
              onUpload={() => {
                void handleUpload(cell);
              }}
              onDeleted={(documentId) => {
                setDocsByKind((prev) => ({
                  ohc: prev.ohc.filter((d) => d.id !== documentId),
                  training: prev.training.filter((d) => d.id !== documentId),
                }));
              }}
              onRenamed={(documentId, next) => {
                const patch = (rows: StaffWorkDriveDocumentListItem[]) =>
                  rows.map((row) =>
                    row.id === documentId
                      ? { ...row, fileName: next.fileName, path: next.path }
                      : row,
                  );
                setDocsByKind((prev) => ({
                  ohc: patch(prev.ohc),
                  training: patch(prev.training),
                }));
              }}
            />
          ))}
        </div>

        <div className="flex justify-end border-t border-black/10 bg-white px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
