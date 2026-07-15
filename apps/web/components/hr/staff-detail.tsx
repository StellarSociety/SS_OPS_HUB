"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Pencil, Save } from "lucide-react";
import {
  STAFF_ENTRY_FORM_ID,
  StaffEntryForm,
} from "@/components/hr/staff-entry-form";
import { StaffPdfDocument } from "@/components/hr/staff-pdf-document";
import { toast } from "@/components/ui/toast";
import { updateStaff } from "@/lib/actions/hr";
import type { SalaryPercentages } from "@/lib/hr/derived";
import { staffToForm, type StaffFormState } from "@/lib/hr/staff-form";
import type {
  CivilStatus,
  Department,
  EmploymentStatus,
  Gender,
  Nationality,
  Position,
  StaffWithLookups,
} from "@/lib/hr/types";

type StaffDetailViewProps = {
  staff: StaffWithLookups;
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  nationalities: Nationality[];
  genders: Gender[];
  civilStatuses: CivilStatus[];
  salaryPct: SalaryPercentages;
  canEdit: boolean;
  canViewSalary: boolean;
  venueName: string;
};

export function StaffDetailView({
  staff,
  departments,
  positions,
  statuses,
  nationalities,
  genders,
  civilStatuses,
  salaryPct,
  canEdit,
  canViewSalary,
  venueName,
}: StaffDetailViewProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<StaffFormState>(() => staffToForm(staff));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);

  useEffect(() => {
    setValue(staffToForm(staff));
    setPhotoFile(null);
    setPhotoCleared(false);
  }, [staff]);

  const readOnly = !editing || !canEdit;

  async function handleSubmit(formData: FormData) {
    if (photoFile) formData.set("photo", photoFile);
    setSaving(true);
    const result = await updateStaff(staff.id, formData);
    setSaving(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.saved("Staff details saved.");
    setPhotoFile(null);
    setPhotoCleared(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canEdit ? (
          readOnly ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold tracking-wide text-white transition-opacity hover:opacity-90"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          ) : (
            <>
              <button
                type="submit"
                form={STAFF_ENTRY_FORM_ID}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setValue(staffToForm(staff));
                  setPhotoFile(null);
                  setPhotoCleared(false);
                  setEditing(false);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30"
              >
                <Check className="h-4 w-4" />
                Done
              </button>
            </>
          )
        ) : null}
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30"
        >
          <FileText className="h-4 w-4" />
          PDF Export
        </button>
      </div>

      <StaffEntryForm
        value={value}
        onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
        onSubmit={handleSubmit}
        onPhotoFileChange={setPhotoFile}
        photoCleared={photoCleared}
        onPhotoClearedChange={setPhotoCleared}
        readOnly={readOnly}
        lockEmpNo
        staffId={staff.id}
        departments={departments}
        positions={positions}
        statuses={statuses}
        nationalities={nationalities}
        genders={genders}
        civilStatuses={civilStatuses}
        salaryPct={salaryPct}
        canViewSalary={canViewSalary}
      />

      <StaffPdfDocument
        value={value}
        departments={departments}
        positions={positions}
        statuses={statuses}
        nationalities={nationalities}
        genders={genders}
        civilStatuses={civilStatuses}
        salaryPct={salaryPct}
        canViewSalary={canViewSalary}
        venueName={venueName}
      />
    </div>
  );
}
