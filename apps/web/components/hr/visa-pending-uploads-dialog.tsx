"use client";

import { useMemo, useState } from "react";
import { FileWarning, X } from "lucide-react";
import { createPortal } from "react-dom";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffDocumentUploadSlot } from "@/components/hr/staff-document-upload-slot";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { uploadStaffDocumentViaApi } from "@/lib/hr/workdrive/client-upload";
import type { VisaEmployeeRow } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

export type PendingVisaUploadItem = {
  key: string;
  staffId: string;
  fullName: string;
  empNo: string;
  employmentStatusName: string | null;
  status: VisaEmployeeRow["status"];
  visaStatus: string | null;
  latestRecordId: string | null;
  expiryDate: string | null;
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

/** Employees who still need an eResidence card on WorkDrive. */
export function collectPendingVisaUploads(
  rows: VisaEmployeeRow[],
): PendingVisaUploadItem[] {
  const items: PendingVisaUploadItem[] = [];

  for (const row of rows) {
    if (row.hasResidenceDocument) continue;
    items.push({
      key: row.staff.id,
      staffId: row.staff.id,
      fullName: row.staff.full_name,
      empNo: row.staff.emp_no,
      employmentStatusName: row.staff.employment_status?.name ?? null,
      status: row.status,
      visaStatus: row.visaStatus,
      latestRecordId: row.latestRecordId,
      expiryDate: row.expiryDate,
    });
  }

  return items.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

type VisaPendingUploadsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PendingVisaUploadItem[];
  canManage: boolean;
  onUploaded?: (itemKey: string) => void;
};

export function VisaPendingUploadsDialog({
  open,
  onOpenChange,
  items,
  canManage,
  onUploaded,
}: VisaPendingUploadsDialogProps) {
  const [slots, setSlots] = useState<Record<string, SlotState>>({});

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        staffId: string;
        fullName: string;
        empNo: string;
        items: PendingVisaUploadItem[];
      }
    >();
    for (const item of items) {
      const existing = map.get(item.staffId);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(item.staffId, {
          staffId: item.staffId,
          fullName: item.fullName,
          empNo: item.empNo,
          items: [item],
        });
      }
    }
    return [...map.values()];
  }, [items]);

  if (!open || typeof document === "undefined") return null;

  function getSlot(key: string): SlotState {
    return slots[key] ?? emptySlot();
  }

  function patchSlot(key: string, next: SlotState) {
    setSlots((prev) => ({ ...prev, [key]: next }));
  }

  async function handleUpload(item: PendingVisaUploadItem) {
    const state = getSlot(item.key);
    if (!state.file || state.uploading) return;
    patchSlot(item.key, {
      ...state,
      uploading: true,
      progress: 0,
      note: null,
    });
    try {
      const result = await uploadStaffDocumentViaApi({
        staffId: item.staffId,
        empNo: item.empNo,
        fullName: item.fullName,
        docKind: "eresidence_card",
        fileSlotId: item.latestRecordId?.trim() || undefined,
        docExpiry: item.expiryDate,
        file: state.file,
        onProgress: (percent) => {
          setSlots((prev) => ({
            ...prev,
            [item.key]: {
              ...(prev[item.key] ?? emptySlot()),
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
        patchSlot(item.key, {
          ...state,
          uploading: false,
          progress: null,
          note: result.error,
        });
        return;
      }
      toast.saved(`Residency card uploaded for ${item.fullName}`);
      patchSlot(item.key, emptySlot());
      onUploaded?.(item.key);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed.";
      toast.error(message);
      patchSlot(item.key, {
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
        aria-labelledby="visa-pending-dialog-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#f7f8f1] shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 bg-white px-5 py-4">
          <div>
            <h2
              id="visa-pending-dialog-title"
              className="flex items-center gap-2 font-nav text-base font-semibold text-[#3D421F]"
            >
              <FileWarning className="h-4 w-4 text-red-600" aria-hidden />
              Missing residency cards
              {items.length > 0 ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  {items.length}
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload each employee&apos;s eResidence card to their WorkDrive{" "}
              <span className="font-medium text-[#3D421F]">Visa</span>{" "}
              folder.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/60 px-6 py-12 text-center text-sm text-muted-foreground">
              No residency cards pending upload.
            </div>
          ) : (
            grouped.map((group) => (
              <section
                key={group.staffId}
                className="overflow-hidden rounded-xl border border-black/10 bg-white/80"
              >
                <div className="border-b border-black/5 bg-black/[0.02] px-4 py-3">
                  <p className="font-medium text-[#3D421F]">{group.fullName}</p>
                  <div className="mt-0.5 text-xs text-black/45">
                    <StaffDirectoryLink
                      staffId={group.staffId}
                      empNo={group.empNo}
                    />
                    <span className="ml-2 text-red-600">
                      {group.items.length} missing
                    </span>
                  </div>
                </div>
                <ul className="divide-y divide-black/5">
                  {group.items.map((item) => {
                    const slot = getSlot(item.key);
                    return (
                      <li
                        key={item.key}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#3D421F]">
                            Visa card
                          </p>
                          <p className="mt-0.5 text-xs text-black/45">
                            {item.visaStatus
                              ? item.visaStatus
                              : "No visa status on file"}
                          </p>
                          <span
                            className={cn(
                              "mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              "bg-red-100 text-red-800",
                            )}
                          >
                            Missing card
                          </span>
                        </div>
                        {canManage ? (
                          <StaffDocumentUploadSlot
                            className="w-full shrink-0 sm:w-[14rem]"
                            label="Upload residency card"
                            file={slot.file}
                            onFileChange={(file) =>
                              patchSlot(item.key, {
                                ...slot,
                                file,
                                note: null,
                              })
                            }
                            uploadingToDrive={slot.uploading}
                            uploadProgress={slot.progress}
                            driveUploadNote={slot.note}
                            onUploadToDrive={
                              slot.file && !slot.uploading
                                ? () => {
                                    void handleUpload(item);
                                  }
                                : undefined
                            }
                          />
                        ) : (
                          <p className="text-xs text-black/40">
                            No upload permission
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex justify-end border-t border-black/10 bg-white px-5 py-3">
          <Button
            type="button"
            variant="outline"
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
