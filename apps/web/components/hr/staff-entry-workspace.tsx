"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";
import {
  Check,
  FilePlus2,
  FileText,
  Pencil,
  Save,
  Search,
  UserPlus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  STAFF_ENTRY_FORM_ID,
  StaffEntryForm,
} from "@/components/hr/staff-entry-form";
import { StaffPdfDocument } from "@/components/hr/staff-pdf-document";
import { StaffSearchDialog } from "@/components/hr/staff-search-dialog";
import { createStaff, updateStaff } from "@/lib/actions/hr";
import type { SalaryPercentages } from "@/lib/hr/derived";
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
};

const modeButtonClass = (active: boolean) =>
  cn(
    "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
    active
      ? "border-[#3D421F]/30 bg-[#3D421F]/20 text-[#3D421F] shadow-sm"
      : "border-[#3D421F]/15 bg-[#3D421F]/[0.08] text-[#3D421F]/70 hover:bg-[#3D421F]/15 hover:text-[#3D421F]",
  );

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
}: StaffEntryWorkspaceProps) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();

  const [view, setView] = useState<View>("none");
  const [searchOpen, setSearchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedStaffId, setLoadedStaffId] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);
  const [value, setValue] = useState<StaffFormState>(() =>
    emptyStaffForm(suggestedEmpNo),
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);

  const readOnly = loadedStaffId != null && !editing;

  function startAdd() {
    setValue(emptyStaffForm(suggestedEmpNo));
    setLoadedStaffId(null);
    setEditing(true);
    setPhotoFile(null);
    setPhotoCleared(false);
    setView("form");
  }

  function handleSelect(selected: StaffWithLookups) {
    setValue(staffToForm(selected));
    setLoadedStaffId(selected.id);
    setEditing(false);
    setPhotoFile(null);
    setPhotoCleared(false);
    setView("form");
    setSearchOpen(false);
  }

  async function handleSubmit(formData: FormData) {
    if (photoFile) formData.set("photo", photoFile);
    setSaving(true);
    if (loadedStaffId) {
      const result = await updateStaff(loadedStaffId, formData);
      setSaving(false);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.saved("Employee updated.");
      setPhotoFile(null);
      setPhotoCleared(false);
      router.refresh();
      return;
    }

    const result = await createStaff(formData);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.saved("Staff member added.");
    if (result.id) router.push(toScopedHref(`/hr/${result.id}`, scope, slug));
  }

  const showForm = view === "form";
  const showEditButton = loadedStaffId != null && !editing;

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
              {showEditButton ? (
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
                  {loadedStaffId != null ? (
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30"
                    >
                      <Check className="h-4 w-4" />
                      Done
                    </button>
                  ) : null}
                </>
              )}

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
          <StaffEntryForm
            value={value}
            onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
            onSubmit={handleSubmit}
            onPhotoFileChange={setPhotoFile}
            photoCleared={photoCleared}
            onPhotoClearedChange={setPhotoCleared}
            readOnly={readOnly}
            lockEmpNo={loadedStaffId != null}
            staffId={loadedStaffId}
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
