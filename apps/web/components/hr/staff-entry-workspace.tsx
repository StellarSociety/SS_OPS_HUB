"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";
import {
  Briefcase,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
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
import { ScopedLink } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { StaffAvatarField } from "@/components/hr/staff-avatar-field";
import {
  STAFF_ENTRY_FORM_ID,
  StaffEntryForm,
  type StaffEntryTab,
} from "@/components/hr/staff-entry-form";
import { StaffPdfDocument } from "@/components/hr/staff-pdf-document";
import { StaffSearchDialog } from "@/components/hr/staff-search-dialog";
import { PayrollPaidDaysCalendarDialog } from "@/components/hr/payroll-paid-days-calendar-dialog";
import { StaffMissingDetailsShortcut } from "@/components/hr/staff-missing-details-shortcut";
import { createStaff, updateStaff } from "@/lib/actions/hr";
import { getStaffCurrentPayrollSchedule } from "@/lib/actions/hr-staff-payroll-schedule";
import { resolveStaffEmployeeWorkDriveFolderLink } from "@/lib/actions/hr-workdrive";
import { computeAge, computeWorkedTime, type SalaryPercentages } from "@/lib/hr/derived";
import {
  attendanceValidationHref,
  shiftPayrollMonth,
} from "@/lib/hr/payroll/period";
import type { PayrollDayFraction } from "@/lib/hr/payroll/types";
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
  subNavLabelClass,
  verticalSegmentedSubNavLinkClass,
  verticalSegmentedSubNavShellClass,
} from "@/lib/sub-nav-ui";
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
  staffId,
  photoUrl,
  canEdit,
  onPhotoUrlChange,
}: {
  value: StaffFormState;
  departmentName: string | null;
  positionName: string | null;
  nationalityName: string | null;
  staffId: string | null;
  photoUrl: string | null;
  canEdit: boolean;
  onPhotoUrlChange: (url: string | null) => void;
}) {
  const displayName = value.full_name.trim() || "New employee";
  const empNo = value.emp_no.trim();
  const nationality = nationalityDisplay(nationalityName);
  const age = computeAge(value.dob || null);
  const employmentTime = computeWorkedTime(
    value.joining_date || null,
    value.termination_date || null,
  );

  return (
    <div className="w-full max-w-lg shrink-0">
      <Card className="h-full px-6 py-8 sm:px-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <StaffAvatarField
            staffId={staffId}
            photoUrl={photoUrl}
            fullName={displayName}
            empNo={empNo}
            emailFallback={value.work_email || value.personal_email}
            canEdit={canEdit}
            onPhotoUrlChange={onPhotoUrlChange}
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
                        <span className="text-xl leading-none" aria-hidden>
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const scheduleRequestRef = useRef(0);
  const scheduleCacheRef = useRef(
    new Map<
      string,
      {
        at: number;
        data: {
          empNo: string;
          fullName: string;
          payrollMonth: string;
          periodStart: string;
          periodEnd: string;
          dayFractions: PayrollDayFraction[];
          paidDays: number;
        };
      }
    >(),
  );
  const [scheduleData, setScheduleData] = useState<{
    empNo: string;
    fullName: string;
    payrollMonth: string;
    periodStart: string;
    periodEnd: string;
    dayFractions: PayrollDayFraction[];
    paidDays: number;
  } | null>(null);

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
    setPhotoUrl(null);
    setEditing(true);
    setActiveTab("identity");
    setView("form");
  }

  function handleSelect(selected: StaffWithLookups) {
    const form = staffToForm(selected);
    setValue(form);
    setSavedSnapshot(form);
    setLoadedStaffId(selected.id);
    setPhotoUrl(selected.photo_url ?? null);
    setEditing(false);
    setActiveTab("identity");
    setView("form");
    setSearchOpen(false);
    // Warm Schedule cache while the user looks at the profile.
    void loadScheduleMonth({
      staffId: selected.id,
      empNo: form.emp_no,
      fullName: form.full_name,
      joiningDate: form.joining_date || null,
      terminationDate: form.termination_date || null,
      payrollMonth: null,
      silent: true,
    });
  }

  function cancelEdits() {
    if (savedSnapshot) setValue(savedSnapshot);
    setEditing(false);
  }

  type SchedulePayload = {
    empNo: string;
    fullName: string;
    payrollMonth: string;
    periodStart: string;
    periodEnd: string;
    dayFractions: PayrollDayFraction[];
    paidDays: number;
  };

  async function loadScheduleMonth(opts: {
    staffId: string;
    empNo: string;
    fullName: string;
    joiningDate: string | null;
    terminationDate: string | null;
    payrollMonth?: string | null;
    /** Prefetch: no loading spinner / soft-fail. */
    silent?: boolean;
  }) {
    const monthKey = opts.payrollMonth?.trim() || "";
    const cacheKey = `${opts.staffId}:${monthKey || "current"}`;

    const cached = scheduleCacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.at < 120_000) {
      if (!opts.silent) {
        setScheduleData(cached.data);
        setScheduleLoading(false);
      }
      return cached.data;
    }

    const requestId = ++scheduleRequestRef.current;
    if (!opts.silent) setScheduleLoading(true);

    try {
      const result = await getStaffCurrentPayrollSchedule({
        staffId: opts.staffId,
        empNo: opts.empNo,
        fullName: opts.fullName,
        joiningDate: opts.joiningDate,
        terminationDate: opts.terminationDate,
        payrollMonth: monthKey || null,
      });
      if (scheduleRequestRef.current !== requestId && !opts.silent) return null;
      if (!result.ok) {
        if (!opts.silent) toast.error(result.error);
        return null;
      }
      const data: SchedulePayload = {
        empNo: result.empNo,
        fullName: result.fullName,
        payrollMonth: result.payrollMonth,
        periodStart: result.periodStart,
        periodEnd: result.periodEnd,
        dayFractions: result.dayFractions,
        paidDays: result.paidDays,
      };
      const at = Date.now();
      scheduleCacheRef.current.set(`${opts.staffId}:${result.payrollMonth}`, {
        at,
        data,
      });
      if (!monthKey) {
        scheduleCacheRef.current.set(`${opts.staffId}:current`, { at, data });
      }
      if (!opts.silent) {
        setScheduleData(data);
      }
      return data;
    } catch (err) {
      if (scheduleRequestRef.current !== requestId && !opts.silent) return null;
      console.error("[staff-entry] schedule shortcut failed:", err);
      if (!opts.silent) toast.error("Could not load schedule — try again.");
      return null;
    } finally {
      if (!opts.silent && scheduleRequestRef.current === requestId) {
        setScheduleLoading(false);
      }
    }
  }

  async function openScheduleShortcut() {
    if (!loadedStaffId) return;

    const cacheKey = `${loadedStaffId}:current`;
    const cached = scheduleCacheRef.current.get(cacheKey);

    if (cached && Date.now() - cached.at < 120_000) {
      setScheduleData(cached.data);
      setScheduleOpen(true);
      setScheduleLoading(false);
      return;
    }

    setScheduleData({
      empNo: value.emp_no.trim() || "—",
      fullName: value.full_name.trim() || "Employee",
      payrollMonth: "",
      periodStart: "",
      periodEnd: "",
      dayFractions: [],
      paidDays: 0,
    });
    setScheduleOpen(true);
    await loadScheduleMonth({
      staffId: loadedStaffId,
      empNo: value.emp_no,
      fullName: value.full_name,
      joiningDate: value.joining_date || null,
      terminationDate: value.termination_date || null,
      payrollMonth: null,
    });
  }

  async function openEmployeeDriveShortcut() {
    if (!loadedStaffId || driveLoading) return;
    setDriveLoading(true);
    try {
      const result = await resolveStaffEmployeeWorkDriveFolderLink({
        staffId: loadedStaffId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[staff-entry] drive shortcut failed:", err);
      toast.error("Could not open employee drive — try again.");
    } finally {
      setDriveLoading(false);
    }
  }

  function navigateScheduleMonth(direction: -1 | 1) {
    if (!loadedStaffId || scheduleLoading) return;
    const current =
      scheduleData?.payrollMonth ||
      scheduleCacheRef.current.get(`${loadedStaffId}:current`)?.data
        .payrollMonth;
    if (!current) return;
    let next: string;
    try {
      next = shiftPayrollMonth(current, direction);
    } catch {
      return;
    }

    const cached = scheduleCacheRef.current.get(`${loadedStaffId}:${next}`);
    if (cached && Date.now() - cached.at < 120_000) {
      setScheduleData(cached.data);
      setScheduleLoading(false);
      return;
    }

    void loadScheduleMonth({
      staffId: loadedStaffId,
      empNo: value.emp_no,
      fullName: value.full_name,
      joiningDate: value.joining_date || null,
      terminationDate: value.termination_date || null,
      payrollMonth: next,
    });
  }

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    try {
      if (loadedStaffId) {
        const result = await updateStaff(loadedStaffId, formData);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        toast.saved("Employee updated.");
        setSavedSnapshot(value);
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <StaffProfileHero
              value={value}
              departmentName={departmentName}
              positionName={positionName}
              nationalityName={nationalityName}
              staffId={loadedStaffId}
              photoUrl={photoUrl}
              canEdit={Boolean(loadedStaffId)}
              onPhotoUrlChange={setPhotoUrl}
            />

            <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:shrink-0">
              <div className="flex flex-row gap-2 sm:w-52">
                {/* One primary button — label/handler switch. Avoids Edit↔Save twin nodes. */}
                <button
                  type="button"
                  disabled={
                    editing || loadedStaffId == null ? saving : false
                  }
                  onClick={() => {
                    if (loadedStaffId != null && !editing) {
                      setEditing(true);
                      return;
                    }
                    const form = document.getElementById(
                      STAFF_ENTRY_FORM_ID,
                    ) as HTMLFormElement | null;
                    form?.requestSubmit();
                  }}
                  className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--venue-primary)] px-3 text-sm font-semibold tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {loadedStaffId != null && !editing ? (
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
                {loadedStaffId != null && editing ? (
                  <button
                    type="button"
                    onClick={cancelEdits}
                    disabled={saving}
                    className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30 disabled:opacity-40"
                  >
                    <X className="h-4 w-4 shrink-0" aria-hidden />
                    Cancel
                  </button>
                ) : null}
              </div>

              <div className="flex min-h-0 w-full flex-1 flex-col gap-2 sm:flex-row sm:items-stretch">
                <div
                  className={cn(verticalSegmentedSubNavShellClass, "h-full")}
                  role="tablist"
                >
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
                        className={cn(
                          verticalSegmentedSubNavLinkClass(active),
                          "flex-1",
                        )}
                      >
                        <Icon
                          className="h-5 w-5 shrink-0 opacity-80"
                          aria-hidden
                        />
                        <span className="min-w-0 truncate">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {loadedStaffId ? (
                  <div
                    className="flex w-full flex-col self-start overflow-hidden rounded-lg border border-black/10 bg-white/60 backdrop-blur-md sm:w-44 sm:shrink-0"
                    aria-label="Shortcuts"
                  >
                    <p
                      className={cn(
                        subNavLabelClass,
                        "border-b border-black/10 px-3 py-2.5 text-black/40",
                      )}
                    >
                      Shortcuts
                    </p>
                    <StaffMissingDetailsShortcut
                      staffId={loadedStaffId}
                      form={value}
                      photoUrl={photoUrl}
                      canViewSalary={canViewSalary}
                      canEdit
                      onOpenTab={setActiveTab}
                      onRequestEdit={() => setEditing(true)}
                    />
                    <button
                      type="button"
                      disabled={scheduleLoading}
                      onClick={() => void openScheduleShortcut()}
                      className={verticalSegmentedSubNavLinkClass(false)}
                      title="Current payroll month schedule"
                    >
                      <CalendarDays
                        className="h-5 w-5 shrink-0 opacity-80"
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">
                        {scheduleLoading ? "Loading…" : "Schedule"}
                      </span>
                    </button>
                    <ScopedLink
                      href={attendanceValidationHref(loadedStaffId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={verticalSegmentedSubNavLinkClass(false)}
                      title="Open attendance validation for this employee (current payroll month)"
                    >
                      <ClipboardCheck
                        className="h-5 w-5 shrink-0 opacity-80"
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">Attendance</span>
                    </ScopedLink>
                    <button
                      type="button"
                      disabled={driveLoading}
                      onClick={() => void openEmployeeDriveShortcut()}
                      className={verticalSegmentedSubNavLinkClass(false)}
                      title="Open employee folder in WorkDrive"
                    >
                      <FolderOpen
                        className="h-5 w-5 shrink-0 opacity-80"
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">
                        {driveLoading ? "Opening…" : "Drive"}
                      </span>
                    </button>
                    <ScopedLink
                      href={`/hr/attendance/leave/balances?staffId=${encodeURIComponent(loadedStaffId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={verticalSegmentedSubNavLinkClass(false)}
                      title="Open leave management for this employee"
                    >
                      <CalendarOff
                        className="h-5 w-5 shrink-0 opacity-80"
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">Leave</span>
                    </ScopedLink>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <StaffEntryForm
            value={value}
            onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
            onSubmit={handleSubmit}
            readOnly={readOnly}
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

      <PayrollPaidDaysCalendarDialog
        open={scheduleOpen}
        onClose={() => {
          scheduleRequestRef.current += 1;
          setScheduleOpen(false);
          setScheduleLoading(false);
        }}
        empNo={scheduleData?.empNo ?? value.emp_no}
        fullName={scheduleData?.fullName ?? value.full_name}
        payrollMonth={scheduleData?.payrollMonth || null}
        periodStart={scheduleData?.periodStart ?? ""}
        periodEnd={scheduleData?.periodEnd ?? ""}
        dayFractions={scheduleData?.dayFractions ?? []}
        paidDays={scheduleData?.paidDays ?? 0}
        loading={scheduleLoading}
        onNavigateMonth={navigateScheduleMonth}
      />
    </div>
  );
}
