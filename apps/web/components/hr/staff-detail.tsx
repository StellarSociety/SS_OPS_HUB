"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
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
import { ScopedLink } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { StaffAvatarField } from "@/components/hr/staff-avatar-field";
import {
  STAFF_ENTRY_FORM_ID,
  StaffEntryForm,
  type StaffEntryTab,
} from "@/components/hr/staff-entry-form";
import { StaffPdfDocument } from "@/components/hr/staff-pdf-document";
import { PayrollPaidDaysCalendarDialog } from "@/components/hr/payroll-paid-days-calendar-dialog";
import { toast } from "@/components/ui/toast";
import { updateStaff } from "@/lib/actions/hr";
import { getStaffCurrentPayrollSchedule } from "@/lib/actions/hr-staff-payroll-schedule";
import { resolveStaffEmployeeWorkDriveFolderLink } from "@/lib/actions/hr-workdrive";
import { computeAge, computeWorkedTime, type SalaryPercentages } from "@/lib/hr/derived";
import {
  attendanceValidationHref,
  shiftPayrollMonth,
} from "@/lib/hr/payroll/period";
import type { PayrollDayFraction } from "@/lib/hr/payroll/types";
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
  subNavLabelClass,
  verticalSegmentedSubNavLinkClass,
  verticalSegmentedSubNavShellClass,
} from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

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

type SchedulePayload = {
  empNo: string;
  fullName: string;
  payrollMonth: string;
  periodStart: string;
  periodEnd: string;
  dayFractions: PayrollDayFraction[];
  paidDays: number;
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
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const scheduleRequestRef = useRef(0);
  const scheduleCacheRef = useRef(
    new Map<string, { at: number; data: SchedulePayload }>(),
  );
  const [scheduleData, setScheduleData] = useState<SchedulePayload | null>(null);

  useEffect(() => {
    if (editing) return;
    setValue(staffToForm(staff));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- skip while editing
  }, [staff]);
  useEffect(() => {
    setPhotoUrl(staff.photo_url ?? null);
  }, [staff.photo_url]);

  // Warm Schedule cache while the user looks at the profile.
  useEffect(() => {
    void loadScheduleMonth({
      staffId: staff.id,
      empNo: staff.emp_no,
      fullName: staff.full_name,
      joiningDate: staff.joining_date || null,
      terminationDate: staff.termination_date || null,
      payrollMonth: null,
      silent: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- warm once per staff id
  }, [staff.id]);

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

  async function loadScheduleMonth(opts: {
    staffId: string;
    empNo: string;
    fullName: string;
    joiningDate: string | null;
    terminationDate: string | null;
    payrollMonth?: string | null;
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
      console.error("[staff-detail] schedule shortcut failed:", err);
      if (!opts.silent) toast.error("Could not load schedule — try again.");
      return null;
    } finally {
      if (!opts.silent && scheduleRequestRef.current === requestId) {
        setScheduleLoading(false);
      }
    }
  }

  async function openScheduleShortcut() {
    const cacheKey = `${staff.id}:current`;
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
      staffId: staff.id,
      empNo: value.emp_no,
      fullName: value.full_name,
      joiningDate: value.joining_date || null,
      terminationDate: value.termination_date || null,
      payrollMonth: null,
    });
  }

  async function openEmployeeDriveShortcut() {
    if (driveLoading) return;
    setDriveLoading(true);
    try {
      const result = await resolveStaffEmployeeWorkDriveFolderLink({
        staffId: staff.id,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[staff-detail] drive shortcut failed:", err);
      toast.error("Could not open employee drive — try again.");
    } finally {
      setDriveLoading(false);
    }
  }

  function navigateScheduleMonth(direction: -1 | 1) {
    if (scheduleLoading) return;
    const current =
      scheduleData?.payrollMonth ||
      scheduleCacheRef.current.get(`${staff.id}:current`)?.data.payrollMonth;
    if (!current) return;
    let next: string;
    try {
      next = shiftPayrollMonth(current, direction);
    } catch {
      return;
    }

    const cached = scheduleCacheRef.current.get(`${staff.id}:${next}`);
    if (cached && Date.now() - cached.at < 120_000) {
      setScheduleData(cached.data);
      setScheduleLoading(false);
      return;
    }

    void loadScheduleMonth({
      staffId: staff.id,
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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
        <div className="w-full max-w-lg shrink-0">
          <Card className="h-full px-6 py-8 sm:px-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <StaffAvatarField
                staffId={staff.id}
                photoUrl={photoUrl}
                fullName={displayName}
                empNo={staff.emp_no}
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

        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:shrink-0">
          {canEdit ? (
            <div className="flex flex-row gap-2 sm:w-52">
              {/* One primary button — label/handler switch. Avoids Edit↔Save twin nodes. */}
              <button
                type="button"
                disabled={readOnly ? false : saving}
                onClick={() => {
                  if (readOnly) {
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
                  className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30 disabled:opacity-40"
                >
                  <X className="h-4 w-4 shrink-0" aria-hidden />
                  Cancel
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="flex min-h-0 w-full flex-1 flex-col gap-2 sm:flex-row sm:items-stretch">
            <div
              className={cn(verticalSegmentedSubNavShellClass, "h-full")}
              role="tablist"
            >
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

            <div
              className="flex w-full flex-col self-start overflow-hidden rounded-lg border border-black/10 bg-white/60 backdrop-blur-md sm:w-40 sm:shrink-0"
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
                href={attendanceValidationHref(staff.id)}
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
                href={`/hr/attendance/leave/balances?staffId=${encodeURIComponent(staff.id)}`}
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
          </div>
        </div>
      </div>

      <StaffEntryForm
        value={value}
        onChange={(patch) => setValue((current) => ({ ...current, ...patch }))}
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
