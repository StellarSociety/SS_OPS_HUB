"use client";

import { useEffect, useState } from "react";
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
  Shirt,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { StaffAvatarField } from "@/components/hr/staff-avatar-field";
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
  { id: "uniform", label: "Uniform", icon: Shirt },
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(staff.photo_url ?? null);
  useEffect(() => {
    if (editing) return;
    setValue(staffToForm(staff));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skip while editing
  }, [staff]);
  useEffect(() => {
    setPhotoUrl(staff.photo_url ?? null);
  }, [staff.photo_url]);

  const readOnly = !editing || !canEdit;
  const displayName = value.full_name.trim() || staff.full_name;
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
    setSaving(true);
    try {
      const result = await updateStaff(staff.id, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.saved("Staff details saved.");
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
              <StaffAvatarField
                staffId={staff.id}
                photoUrl={photoUrl}
                fullName={displayName}
                emailFallback={staff.work_email ?? staff.personal_email}
                canEdit={canEdit}
                onPhotoUrlChange={setPhotoUrl}
              />
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
              {/* One primary button — label/handler switch. Avoids Edit↔Save twin nodes. */}
              <button
                type="button"
                disabled={
                  readOnly ? false : saving
                }
                onClick={() => {
                  if (readOnly) {
                    setEditing(true);
                    setActiveTab("documents");
                    return;
                  }
                  const form = document.getElementById(
                    STAFF_ENTRY_FORM_ID,
                  ) as HTMLFormElement | null;
                  form?.requestSubmit();
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {readOnly ? (
                  <>
                    <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                    Edit
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 shrink-0" aria-hidden />
                    {saving ? "Saving…" : "Save"}
                  </>
                )}
              </button>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => {
                    setValue(staffToForm(staff));
                    setEditing(false);
                  }}
                  disabled={saving}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30 disabled:opacity-40"
                >
                  <X className="h-4 w-4 shrink-0" aria-hidden />
                  Cancel
                </button>
              ) : null}
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
