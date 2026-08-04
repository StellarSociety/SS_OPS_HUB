"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";
import {
  Briefcase,
  FilePlus2,
  FileText,
  FolderOpen,
  IdCard,
  Mail,
  Package,
  Pencil,
  Phone,
  Route,
  Save,
  Search,
  Shirt,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  STAFF_ENTRY_FORM_ID,
  StaffEntryForm,
  type StaffEntryTab,
} from "@/components/hr/staff-entry-form";
import { StaffPdfDocument } from "@/components/hr/staff-pdf-document";
import { StaffSearchDialog } from "@/components/hr/staff-search-dialog";
import { createStaff, updateStaff } from "@/lib/actions/hr";
import { computeAge, computeWorkedTime, type SalaryPercentages } from "@/lib/hr/derived";
import {
  emptyStaffForm,
  staffToForm,
  type StaffFormState,
} from "@/lib/hr/staff-form";
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
import { nationalityDisplay } from "@/lib/hr/nationality-flag";
import { cn } from "@/lib/utils";

type View = "none" | "hiring" | "form";

type StaffEntryWorkspaceProps = {
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  nationalities: Nationality[];
  genders: Gender[];
  civilStatuses: CivilStatus[];
  salaryPct: SalaryPercentages;
  canViewSalary: boolean;
  suggestedEmpNo: string;
  staff: StaffWithLookups[];
  venueName: string;
  /** staffId → active offboarding process id */
  offboardingByStaffId?: Record<string, string>;
  canStartOffboarding?: boolean;
};

const ENTRY_TABS: { id: StaffEntryTab; label: string; icon: LucideIcon }[] = [
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

const modeButtonClass = (active: boolean) =>
  cn(
    "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
    active
      ? "border-[#3D421F]/30 bg-[#3D421F]/20 text-[#3D421F] shadow-sm"
      : "border-[#3D421F]/15 bg-[#3D421F]/[0.08] text-[#3D421F]/70 hover:bg-[#3D421F]/15 hover:text-[#3D421F]",
  );

function StaffProfileHero({
  value,
  departmentName,
  positionName,
  nationalityName,
}: {
  value: StaffFormState;
  departmentName: string | null;
  positionName: string | null;
  nationalityName: string | null;
}) {
  const displayName = value.full_name.trim() || "New employee";
  const initials = getUserInitials(
    value.full_name.trim() || null,
    value.work_email || value.personal_email || "?",
  );
  const empNo = value.emp_no.trim();
  const nationality = nationalityDisplay(nationalityName);
  const age = computeAge(value.dob || null);
  const employmentTime = computeWorkedTime(
    value.joining_date || null,
    value.termination_date || null,
  );

  return (
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
                {empNo || "—"}
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
  );
}

export function StaffEntryWorkspace({
  departments,
  positions,
  statuses,
  nationalities,
  genders,
  civilStatuses,
  salaryPct,
  canViewSalary,
  suggestedEmpNo,
  staff,
  venueName,
  offboardingByStaffId = {},
  canStartOffboarding = false,
}: StaffEntryWorkspaceProps) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();

  const [view, setView] = useState<View>("none");
  const [searchOpen, setSearchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedStaffId, setLoadedStaffId] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);
  const [activeTab, setActiveTab] = useState<StaffEntryTab | null>(null);
  const [value, setValue] = useState<StaffFormState>(() =>
    emptyStaffForm(suggestedEmpNo),
  );
  const [savedSnapshot, setSavedSnapshot] = useState<StaffFormState | null>(
    null,
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoSourceFile, setPhotoSourceFile] = useState<File | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  const readOnly = loadedStaffId != null && !editing;

  const departmentName =
    departments.find((d) => d.id === value.department_id)?.name ?? null;
  const positionName =
    positions.find((p) => p.id === value.position_id)?.name ?? null;
  const nationalityName =
    nationalities.find((n) => n.id === value.nationality_id)?.name ?? null;

  function startAdd() {
    setValue(emptyStaffForm(suggestedEmpNo));
    setSavedSnapshot(null);
    setLoadedStaffId(null);
    setEditing(true);
    setActiveTab("identity");
    setPhotoFile(null);
    setPhotoSourceFile(null);
    setPhotoCleared(false);
    setView("form");
  }

  function handleSelect(selected: StaffWithLookups) {
    const form = staffToForm(selected);
    setValue(form);
    setSavedSnapshot(form);
    setLoadedStaffId(selected.id);
    setEditing(false);
    setActiveTab("identity");
    setPhotoFile(null);
    setPhotoSourceFile(null);
    setPhotoCleared(false);
    setView("form");
    setSearchOpen(false);
  }

  function cancelEdits() {
    if (savedSnapshot) setValue(savedSnapshot);
    setPhotoFile(null);
    setPhotoSourceFile(null);
    setPhotoCleared(false);
    setEditing(false);
  }

  async function handleSubmit(formData: FormData) {
    if (photoBusy) {
      toast.error("Photo is still processing — wait a moment, then save again.");
      return;
    }
    // Incomplete photo change (source picked, crop never finished): save other
    // fields and skip the photo instead of blocking the whole employee save.
    if (photoFile) formData.set("photo", photoFile);
    if (
      photoFile &&
      photoSourceFile &&
      photoSourceFile.size <= 8 * 1024 * 1024
    ) {
      formData.set("photo_source", photoSourceFile);
    }
    const uploadingPhoto = Boolean(photoFile || photoCleared);
    if (uploadingPhoto) {
      setActiveTab("documents");
      setPhotoUploading(true);
    }
    setSaving(true);
    try {
      if (loadedStaffId) {
        const result = await updateStaff(loadedStaffId, formData);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        toast.saved("Employee updated.");
        setPhotoFile(null);
        setPhotoSourceFile(null);
        setPhotoCleared(false);
        const nextValue =
          result.photo_url !== undefined
            ? { ...value, photo_url: result.photo_url ?? "" }
            : value.photo_url.startsWith("blob:") && savedSnapshot
              ? { ...value, photo_url: savedSnapshot.photo_url }
              : value;
        setValue(nextValue);
        setSavedSnapshot(nextValue);
        setEditing(false);
        router.refresh();
        return;
      }

      const result = await createStaff(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved("Staff member added.");
      if (result.id) router.push(toScopedHref(`/hr/${result.id}`, scope, slug));
    } catch {
      toast.error("Could not save — check your connection and try again.");
    } finally {
      setSaving(false);
      setPhotoUploading(false);
    }
  }

  const showForm = view === "form";

  return (
    <div className="space-y-6">
      {/* Toolbar ------------------------------------------------------- */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-black/45">
            Staff
          </span>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={modeButtonClass(false)}
          >
            <Search className="h-4 w-4" />
            Search employee
          </button>

          <button
            type="button"
            onClick={startAdd}
            className={modeButtonClass(showForm && loadedStaffId == null)}
          >
            <UserPlus className="h-4 w-4" />
            Add new employee
          </button>

          <button
            type="button"
            onClick={() => {
              setView("hiring");
              setLoadedStaffId(null);
            }}
            className={cn(modeButtonClass(view === "hiring"), "relative")}
            title="Coming soon"
          >
            <FilePlus2 className="h-4 w-4" />
            Add from hiring form
            <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/45">
              Soon
            </span>
          </button>

          {showForm ? (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30"
              >
                <FileText className="h-4 w-4" />
                PDF Export
              </button>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Content ------------------------------------------------------- */}
      {showForm ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <StaffProfileHero
              value={value}
              departmentName={departmentName}
              positionName={positionName}
              nationalityName={nationalityName}
            />

            <div className="flex w-full flex-col gap-2 sm:w-52 sm:shrink-0">
              <div className="flex flex-col gap-2">
                {/* One primary button — label/handler switch. Avoids Edit↔Save twin nodes. */}
                <button
                  type="button"
                  disabled={
                    editing || loadedStaffId == null
                      ? saving || photoBusy
                      : false
                  }
                  onClick={() => {
                    if (loadedStaffId != null && !editing) {
                      setEditing(true);
                      // Surface the photo editor so Upload is immediately usable.
                      setActiveTab("documents");
                      return;
                    }
                    const form = document.getElementById(
                      STAFF_ENTRY_FORM_ID,
                    ) as HTMLFormElement | null;
                    form?.requestSubmit();
                  }}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {loadedStaffId != null && !editing ? (
                    <>
                      <Pencil className="h-4 w-4 shrink-0" aria-hidden />
                      Edit
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 shrink-0" aria-hidden />
                      {photoUploading
                        ? "Uploading…"
                        : saving
                          ? "Saving…"
                          : "Save"}
                    </>
                  )}
                </button>
                {loadedStaffId != null && editing ? (
                  <button
                    type="button"
                    onClick={cancelEdits}
                    disabled={saving}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30 disabled:opacity-40"
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden />
                    Cancel
                  </button>
                ) : null}
              </div>

              <div className={verticalSegmentedSubNavShellClass} role="tablist">
                {ENTRY_TABS.map((tab) => {
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
                      <Icon
                        className="h-3.5 w-3.5 shrink-0 opacity-80"
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <StaffEntryForm
            value={value}
            onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
            onSubmit={handleSubmit}
            onPhotoFileChange={setPhotoFile}
            onPhotoSourceFileChange={setPhotoSourceFile}
            onPhotoBusyChange={setPhotoBusy}
            photoUploading={photoUploading}
            photoCleared={photoCleared}
            onPhotoClearedChange={setPhotoCleared}
            readOnly={readOnly}
            lockEmpNo={loadedStaffId != null}
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
            canEditPath={Boolean(loadedStaffId)}
            onPersistedStaffPatch={(patch) => {
              setSavedSnapshot((current) =>
                current ? { ...current, ...patch } : current,
              );
            }}
            staffId={loadedStaffId}
            offboardingProcessId={
              loadedStaffId
                ? (offboardingByStaffId[loadedStaffId] ?? null)
                : null
            }
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
        </>
      ) : null}

      {view === "hiring" ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <FilePlus2 className="h-8 w-8 text-black/25" />
          <h3 className="font-serif text-lg text-[#3D421F]">
            Add from hiring form
          </h3>
          <p className="max-w-md text-sm text-black/50">
            Creating employees directly from a submitted hiring form is coming
            soon. For now, use{" "}
            <span className="font-medium text-[#3D421F]">Add new employee</span>{" "}
            to create a record manually.
          </p>
        </Card>
      ) : null}

      {view === "none" ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <UserPlus className="h-8 w-8 text-black/25" />
          <p className="max-w-md text-sm text-black/50">
            Choose an action above to add a new employee or search the existing
            roster.
          </p>
        </Card>
      ) : null}

      <StaffSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSelect}
        staff={staff}
        departments={departments}
        positions={positions}
        statuses={statuses}
      />
    </div>
  );
}
