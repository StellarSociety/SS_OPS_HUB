"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  FileText,
  FolderOpen,
  IdCard,
  Mail,
  Package,
  Pencil,
  Phone,
  Route,
  Save,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  STAFF_ENTRY_FORM_ID,
  StaffEntryForm,
  type StaffEntryTab,
} from "@/components/hr/staff-entry-form";
import { StaffPdfDocument } from "@/components/hr/staff-pdf-document";
import { toast } from "@/components/ui/toast";
import { updateStaff } from "@/lib/actions/hr";
import { computeAge, computeWorkedTime, type SalaryPercentages } from "@/lib/hr/derived";
import { staffToForm, type StaffFormState } from "@/lib/hr/staff-form";
import { nationalityDisplay } from "@/lib/hr/nationality-flag";
import type {
  CivilStatus,
  Department,
  EmploymentStatus,
  Gender,
  Nationality,
  Position,
  StaffWithLookups,
} from "@/lib/hr/types";
import {
  verticalSegmentedSubNavLinkClass,
  verticalSegmentedSubNavShellClass,
} from "@/lib/sub-nav-ui";
import { getUserInitials } from "@/lib/user/display";

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
  offboardingProcessId?: string | null;
  canStartOffboarding?: boolean;
};

const DETAIL_TABS: { id: StaffEntryTab; label: string; icon: LucideIcon }[] = [
  { id: "identity", label: "Identity", icon: IdCard },
  { id: "contact", label: "Contact", icon: Phone },
  { id: "employment", label: "Employment", icon: Briefcase },
  { id: "employment_path", label: "Employment Path", icon: Route },
  { id: "documents", label: "Personal Doc's", icon: FolderOpen },
  { id: "employment_docs", label: "Employment Doc's", icon: FileText },
  { id: "communications", label: "Communications", icon: Mail },
  { id: "assets", label: "Assets", icon: Package },
];

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
  offboardingProcessId = null,
  canStartOffboarding = false,
}: StaffDetailViewProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<StaffEntryTab | null>(null);
  const [value, setValue] = useState<StaffFormState>(() => staffToForm(staff));
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoSourceFile, setPhotoSourceFile] = useState<File | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    setValue(staffToForm(staff));
    setPhotoFile(null);
    setPhotoSourceFile(null);
    setPhotoCleared(false);
  }, [staff]);

  const readOnly = !editing || !canEdit;
  const displayName = value.full_name.trim() || staff.full_name;
  const initials = getUserInitials(displayName, staff.work_email ?? "?");
  const departmentName =
    departments.find((d) => d.id === value.department_id)?.name ?? null;
  const positionName =
    positions.find((p) => p.id === value.position_id)?.name ?? null;
  const nationalityName =
    nationalities.find((n) => n.id === value.nationality_id)?.name ?? null;
  const nationality = nationalityDisplay(nationalityName);
  const age = computeAge(value.dob || null);
  const employmentTime = computeWorkedTime(
    value.joining_date || null,
    value.termination_date || null,
  );

  async function handleSubmit(formData: FormData) {
    if (photoBusy) {
      toast.error("Photo is still processing — wait a moment, then save again.");
      return;
    }
    if (
      (value.photo_url.startsWith("blob:") || photoSourceFile) &&
      !photoFile &&
      !photoCleared
    ) {
      toast.error("Photo is still processing — wait a moment, then save again.");
      return;
    }
    if (photoFile) formData.set("photo", photoFile);
    // Skip oversized originals — they can truncate the whole Server Action body.
    if (photoSourceFile && photoSourceFile.size <= 8 * 1024 * 1024) {
      formData.set("photo_source", photoSourceFile);
    }
    setSaving(true);
    try {
      const result = await updateStaff(staff.id, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.saved("Staff details saved.");
      setPhotoFile(null);
      setPhotoSourceFile(null);
      setPhotoCleared(false);
      if (result.photo_url !== undefined) {
        setValue((current) => ({
          ...current,
          photo_url: result.photo_url ?? "",
        }));
      }
      setEditing(false);
      router.refresh();
    } catch {
      toast.error("Could not save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30"
        >
          <FileText className="h-4 w-4" />
          PDF Export
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="w-full max-w-lg shrink-0">
          <Card className="px-6 py-8 sm:px-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full border-2 border-white shadow-md ring-1 ring-black/10 sm:h-32 sm:w-32">
                {value.photo_url ? (
                  <Image
                    src={value.photo_url}
                    alt=""
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#3D421F] text-3xl font-medium text-white sm:text-4xl">
                    {initials}
                  </div>
                )}
              </div>
              <div className="min-w-0 w-full space-y-0.5">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-black/45">
                  Employee
                </p>
                <h2 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-[#3D421F] sm:text-3xl">
                  {displayName}
                </h2>
              </div>
              <dl className="mt-1 flex w-full flex-col items-center gap-1.5 text-xs text-black/55">
                <div className="flex w-2/3 flex-col items-center gap-1.5 rounded-lg bg-black/[0.04] px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <dt className="text-black/40">Country</dt>
                    <dd className="font-medium text-[#3D421F]/80">
                      {nationality ? (
                        <span className="inline-flex items-center gap-1.5">
                          {nationality.flag ? (
                            <span className="text-base leading-none" aria-hidden>
                              {nationality.flag}
                            </span>
                          ) : null}
                          <span>{nationality.label}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt className="text-black/40">Age</dt>
                    <dd className="font-medium text-[#3D421F]/80">
                      {age != null ? `${age} years` : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <dt className="text-black/40">Employment time</dt>
                    <dd className="font-medium tabular-nums text-[#3D421F]/80">
                      {employmentTime || "—"}
                    </dd>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="text-black/40">Emp. no.</dt>
                  <dd className="font-mono font-medium text-[#3D421F]/80">
                    {value.emp_no.trim() || "—"}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="text-black/40">Department</dt>
                  <dd className="font-medium text-[#3D421F]/80">
                    {departmentName || "—"}
                  </dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <dt className="text-black/40">Position</dt>
                  <dd className="font-medium text-[#3D421F]/80">
                    {positionName || "—"}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-52 sm:shrink-0">
          {canEdit ? (
            <div className="flex flex-col gap-2">
              {readOnly ? (
                <button
                  key="staff-action-edit"
                  type="button"
                  onClick={() => {
                    // Defer so this click cannot land on the Save submit
                    // button that replaces Edit in the same slot.
                    queueMicrotask(() => setEditing(true));
                  }}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold tracking-wide text-white transition-opacity hover:opacity-90"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              ) : (
                <div key="staff-action-edit-mode" className="flex flex-col gap-2">
                  <button
                    key="staff-action-save"
                    type="button"
                    disabled={saving || photoBusy}
                    onClick={() => {
                      const form = document.getElementById(
                        STAFF_ENTRY_FORM_ID,
                      ) as HTMLFormElement | null;
                      form?.requestSubmit();
                    }}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    key="staff-action-cancel"
                    type="button"
                    onClick={() => {
                      setValue(staffToForm(staff));
                      setPhotoFile(null);
                      setPhotoSourceFile(null);
                      setPhotoCleared(false);
                      setEditing(false);
                    }}
                    disabled={saving}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30 disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <div className={verticalSegmentedSubNavShellClass} role="tablist">
            {DETAIL_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() =>
                    setActiveTab((current) =>
                      current === tab.id ? null : tab.id,
                    )
                  }
                  className={verticalSegmentedSubNavLinkClass(active)}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="min-w-0 truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <StaffEntryForm
        value={value}
        onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
        onSubmit={handleSubmit}
        onPhotoFileChange={setPhotoFile}
        onPhotoSourceFileChange={setPhotoSourceFile}
        onPhotoBusyChange={setPhotoBusy}
        photoCleared={photoCleared}
        onPhotoClearedChange={setPhotoCleared}
        readOnly={readOnly}
        lockEmpNo
        activeTab={activeTab}
        onRequestTab={setActiveTab}
        departments={departments}
        positions={positions}
        statuses={statuses}
        nationalities={nationalities}
        genders={genders}
        civilStatuses={civilStatuses}
        salaryPct={salaryPct}
        canViewSalary={canViewSalary}
        canEditPath={canEdit}
        onPersistedStaffPatch={() => {
          router.refresh();
        }}
        staffId={staff.id}
        offboardingProcessId={offboardingProcessId}
        canStartOffboarding={canStartOffboarding}
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
