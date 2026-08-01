"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mail,
  Plus,
  Trash2,
} from "lucide-react";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import {
  getOffboardingLeaveSnapshot,
  syncStaffOffboardingDirectoryFields,
  upsertOffboardingProcessAction,
} from "@/lib/actions/hr-offboarding";
import { formatAed, formatDateOnly, computeWorkedTime } from "@/lib/hr/derived";
import {
  findStatusIdByName,
  findStatusNameById,
  suggestEmploymentStatusName,
} from "@/lib/hr/employment-status";
import {
  scheduleLeaveDisplayName,
  type LeaveCalendarStatus,
  type ScheduledLeaveLabelStyle,
  type ScheduledLeaveRange,
} from "@/lib/hr/leave";
import {
  OffboardingNoticeEmailRecordCard,
  OffboardingNoticeEmailRecordViewer,
} from "@/components/hr/offboarding-notice-email-record";
import { OffboardingNoticeEmailDialog } from "@/components/hr/offboarding-notice-email-dialog";
import {
  listBoardingNoticeEmails,
  cancelScheduledBoardingNoticeEmail,
  sendBoardingNoticeEmail,
} from "@/lib/actions/hr-boarding-email";
import {
  buildSettlementPreview,
  checklistProgress,
  defaultAutoAdjustments,
  directoryTerminationTypeFromKind,
  isChecklistStepDone,
  kindFromDirectoryType,
  newProcessId,
  normalizeChecklist,
  normalizeNoticeEmailRecords,
  OFFBOARDING_CHECKLIST_STEPS,
  OFFBOARDING_TERMINATION_KIND_OPTIONS,
  toggleChecklistItem,
  type OffboardingChecklistStepId,
  type OffboardingChecklistStepState,
  type OffboardingLeaveApprovalMode,
  type OffboardingLeaveEntry,
  type OffboardingLeaveHandling,
  type OffboardingNoticeEmailAction,
  type OffboardingNoticeEmailDelivery,
  type OffboardingProcess,
  type OffboardingStaffSnapshot,
  type OffboardingTerminationKind,
} from "@/lib/hr/offboarding-process";
import type { EmploymentStatus } from "@/lib/hr/types";
import { toScopedHref } from "@/lib/venue/scope-routing";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

const fieldClass =
  "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

const FALLBACK_LEAVE_TYPES = [
  { code: "AL", name: "Annual Leave" },
  { code: "PH-REPL", name: "Public Holiday" },
] as const;

const TIMESTAMPED_STEPS = new Set<OffboardingChecklistStepId>([
  "access",
  "property",
  "benefits_cancel",
]);

function emptyLeaveEntry(leaveType = "AL"): OffboardingLeaveEntry {
  return {
    id: newProcessId(),
    leaveType,
    startDate: "",
    endDate: "",
    approvalMode: "draft",
  };
}

function leaveEntryComplete(entry: OffboardingLeaveEntry): boolean {
  return (
    Boolean(entry.leaveType) &&
    Boolean(entry.startDate) &&
    Boolean(entry.endDate) &&
    entry.endDate >= entry.startDate
  );
}

function formatDoneAt(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-AE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type LeaveSnapshot = {
  alBalance: number;
  phBalance: number;
  alAvail: number;
  alUsed: number;
  alScheduled: number;
  phAvail: number;
  phUsed: number;
  scheduledLeaves: ScheduledLeaveRange[];
  scheduleLabels: ScheduledLeaveLabelStyle[];
};

type OffboardingProcessFormProps = {
  staff: OffboardingStaffSnapshot;
  employmentStatuses: EmploymentStatus[];
  /** When set, form edits an existing process instead of creating one. */
  initialProcess?: OffboardingProcess | null;
};

export function OffboardingProcessForm({
  staff,
  employmentStatuses,
  initialProcess = null,
}: OffboardingProcessFormProps) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const listHref = toScopedHref("/hr/offboarding", scope, slug);
  const isEditing = Boolean(initialProcess);
  const [processId] = useState(
    () => initialProcess?.id ?? newProcessId(),
  );

  const initialKind: OffboardingTerminationKind = initialProcess
    ? initialProcess.terminationKind
    : (kindFromDirectoryType(staff.terminationType) ?? "resignation");
  const initialNotificationDate = initialProcess?.notificationDate ?? "";
  const initialTerminationDate =
    initialProcess?.terminationDate ?? staff.terminationDate ?? "";
  const initialEmploymentStatusId = (() => {
    if (initialProcess?.employmentStatusId) {
      return initialProcess.employmentStatusId;
    }
    if (staff.employmentStatusId) return staff.employmentStatusId;
    const suggested = suggestEmploymentStatusName({
      joiningDate: staff.joiningDate,
      terminationDate: initialTerminationDate,
    });
    return findStatusIdByName(employmentStatuses, suggested) ?? "";
  })();
  const initialChecklist = normalizeChecklist(initialProcess?.checklist);
  const initialNoticeEmail =
    initialProcess?.noticeEmailAction ??
    (initialKind === "resignation"
      ? ("resignation_confirm" as const)
      : ("termination_notice" as const));
  const initialHubDisable =
    initialProcess?.hubAccessDisableDate ??
    (initialTerminationDate || null);

  const [kind, setKind] = useState<OffboardingTerminationKind>(initialKind);
  const [notificationDate, setNotificationDate] = useState(
    initialNotificationDate,
  );
  const [terminationDate, setTerminationDate] = useState(
    initialTerminationDate,
  );
  const [employmentStatusId, setEmploymentStatusId] = useState(
    initialEmploymentStatusId,
  );
  const [autoEmploymentStatus, setAutoEmploymentStatus] = useState(true);
  const [noticeEmailAction, setNoticeEmailAction] =
    useState<OffboardingNoticeEmailAction | null>(initialNoticeEmail);
  const [noticeEmailRecords, setNoticeEmailRecords] = useState<
    OffboardingNoticeEmailDelivery[]
  >(() => normalizeNoticeEmailRecords(initialProcess));
  const [viewingNoticeEmailId, setViewingNoticeEmailId] = useState<
    string | null
  >(null);
  const [editingNoticeDraftId, setEditingNoticeDraftId] = useState<
    string | null
  >(null);
  const [noticeEmailDialogOpen, setNoticeEmailDialogOpen] = useState(false);
  const [hubAccessDisableDate, setHubAccessDisableDate] = useState<
    string | null
  >(initialHubDisable);
  const [leaveHandling, setLeaveHandling] =
    useState<OffboardingLeaveHandling>(
      () => initialProcess?.leaveHandling ?? "pay_off",
    );
  const [leaveEntries, setLeaveEntries] = useState<OffboardingLeaveEntry[]>(
    () =>
      initialProcess?.leaveEntries.map((entry) => ({ ...entry })) ?? [],
  );
  const [notes, setNotes] = useState(() => initialProcess?.notes ?? "");
  const [leave, setLeave] = useState<LeaveSnapshot | null>(null);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [bookedOpen, setBookedOpen] = useState(true);
  const [checklist, setChecklist] =
    useState<OffboardingChecklistStepState[]>(initialChecklist);
  const [openChecklistStep, setOpenChecklistStep] =
    useState<OffboardingChecklistStepId | null>("notice");
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({
      kind: initialKind,
      notificationDate: initialNotificationDate,
      terminationDate: initialTerminationDate,
      employmentStatusId: initialEmploymentStatusId,
      noticeEmailAction: initialNoticeEmail,
      noticeEmailRecords: normalizeNoticeEmailRecords(initialProcess),
      hubAccessDisableDate: initialHubDisable,
      leaveHandling: initialProcess?.leaveHandling ?? "pay_off",
      leaveEntries: initialProcess?.leaveEntries ?? [],
      notes: initialProcess?.notes ?? "",
      checklist: initialChecklist,
    }),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLeaveLoading(true);
    setLeaveError(null);

    void getOffboardingLeaveSnapshot({ staffId: staff.id }).then((result) => {
      if (cancelled) return;
      setLeaveLoading(false);
      if (result.error) {
        setLeaveError(result.error);
        setLeave(null);
        return;
      }
      setLeave({
        alBalance: result.alBalance,
        phBalance: result.phBalance,
        alAvail: result.alAvail,
        alUsed: result.alUsed,
        alScheduled: result.alScheduled,
        phAvail: result.phAvail,
        phUsed: result.phUsed,
        scheduledLeaves: result.scheduledLeaves,
        scheduleLabels: result.scheduleLabels,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [staff.id]);

  useEffect(() => {
    let cancelled = false;
    void listBoardingNoticeEmails({
      staffId: staff.id,
      processId,
    }).then((result) => {
      if (cancelled || !result.ok) return;
      setNoticeEmailRecords(result.records);
      setBaseline((prev) => {
        try {
          const parsed = JSON.parse(prev) as Record<string, unknown>;
          return JSON.stringify({
            ...parsed,
            noticeEmailRecords: result.records,
          });
        } catch {
          return prev;
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [staff.id, processId]);

  useEffect(() => {
    if (!autoEmploymentStatus) return;
    const suggested = suggestEmploymentStatusName({
      joiningDate: staff.joiningDate,
      terminationDate,
    });
    const nextId = findStatusIdByName(employmentStatuses, suggested);
    if (nextId) setEmploymentStatusId(nextId);
  }, [
    autoEmploymentStatus,
    terminationDate,
    staff.joiningDate,
    employmentStatuses,
  ]);

  useEffect(() => {
    if (!hubAccessDisableDate && terminationDate) {
      setHubAccessDisableDate(terminationDate);
    }
  }, [terminationDate, hubAccessDisableDate]);

  const alBalance = leave?.alBalance ?? staff.alBalance;
  const phBalance = leave?.phBalance ?? staff.phBalance;

  const autoAdjustments = useMemo(() => defaultAutoAdjustments(kind), [kind]);

  const settlement = useMemo(
    () =>
      buildSettlementPreview({
        wagePackage: staff.wagePackage,
        provisionalEosb: staff.provisionalEosb,
        alBalance,
        phBalance,
        kind,
        leaveHandling,
        autoAdjustments,
      }),
    [
      staff.wagePackage,
      staff.provisionalEosb,
      alBalance,
      phBalance,
      kind,
      leaveHandling,
      autoAdjustments,
    ],
  );

  const bookedOrOngoing = useMemo(() => {
    if (!leave) return [];
    const today = todayIsoLocal();
    return leave.scheduledLeaves.filter((range) => range.toDate >= today);
  }, [leave]);

  const leaveTypeOptions = useMemo(() => {
    const fromLabels = (leave?.scheduleLabels ?? [])
      .filter((l) => l.code !== "ABS" && l.code !== "SHIFT" && l.code !== "OFF")
      .map((l) => ({ code: l.code, name: l.name }));
    if (fromLabels.length > 0) return fromLabels;
    return FALLBACK_LEAVE_TYPES.map((t) => ({ code: t.code, name: t.name }));
  }, [leave]);

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        kind,
        notificationDate,
        terminationDate,
        employmentStatusId,
        noticeEmailAction,
        noticeEmailRecords,
        hubAccessDisableDate,
        leaveHandling,
        leaveEntries,
        notes,
        checklist,
      }),
    [
      kind,
      notificationDate,
      terminationDate,
      employmentStatusId,
      noticeEmailAction,
      noticeEmailRecords,
      hubAccessDisableDate,
      leaveHandling,
      leaveEntries,
      notes,
      checklist,
    ],
  );

  const isDirty = currentSnapshot !== baseline;

  const canSave =
    Boolean(notificationDate) &&
    Boolean(terminationDate) &&
    Boolean(employmentStatusId) &&
    !leaveLoading &&
    !saving &&
    (leaveHandling === "pay_off" ||
      (leaveEntries.length > 0 && leaveEntries.every(leaveEntryComplete)));

  const onSaveRef = useRef(async () => false);
  onSaveRef.current = async () => {
    if (!canSave) return false;
    return persistAndLeave();
  };

  const { guardAction, unsavedDialog } = useUnsavedChangesGuard({
    isDirty,
    onSaveRef,
  });

  function goToList() {
    router.push(listHref);
  }

  function updateLeaveEntry(
    id: string,
    patch: Partial<OffboardingLeaveEntry>,
  ) {
    setLeaveEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }

  function buildProcess(): OffboardingProcess | null {
    if (
      !notificationDate ||
      !terminationDate ||
      !employmentStatusId ||
      leaveLoading
    ) {
      return null;
    }
    if (
      leaveHandling === "use_on_last_days" &&
      (leaveEntries.length === 0 || !leaveEntries.every(leaveEntryComplete))
    ) {
      return null;
    }
    return {
      id: processId,
      staffId: staff.id,
      empNo: staff.empNo,
      fullName: staff.fullName,
      departmentName: staff.departmentName,
      positionName: staff.positionName,
      employmentStatusId,
      employmentStatusName:
        findStatusNameById(employmentStatuses, employmentStatusId) ??
        staff.employmentStatusName,
      joiningDate: staff.joiningDate,
      terminationKind: kind,
      notificationDate,
      terminationDate,
      noticeEmailAction,
      noticeEmailRecords,
      hubAccessDisableDate: hubAccessDisableDate || terminationDate,
      alBalance,
      phBalance,
      leaveHandling,
      leaveEntries: leaveHandling === "use_on_last_days" ? leaveEntries : [],
      checklist,
      autoAdjustments,
      settlement,
      status: initialProcess?.status ?? "in_progress",
      startedAt: initialProcess?.startedAt ?? new Date().toISOString(),
      notes: notes.trim(),
    };
  }

  async function persistAndLeave(): Promise<boolean> {
    const process = buildProcess();
    if (!process) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const sync = await syncStaffOffboardingDirectoryFields({
        staffId: staff.id,
        terminationDate: process.terminationDate,
        terminationType: directoryTerminationTypeFromKind(
          process.terminationKind,
        ),
        employmentStatusId: process.employmentStatusId ?? employmentStatusId,
      });
      if (sync.error) {
        setSaveError(sync.error);
        return false;
      }
      const saved = await upsertOffboardingProcessAction(process);
      if (saved.error) {
        setSaveError(saved.error);
        return false;
      }
      setBaseline(currentSnapshot);
      router.push(listHref);
      router.refresh();
      return true;
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    void persistAndLeave();
  }

  const workedTimeLabel = useMemo(
    () => computeWorkedTime(staff.joiningDate, terminationDate || null),
    [staff.joiningDate, terminationDate],
  );

  const noticeStepDone =
    Boolean(notificationDate) &&
    Boolean(terminationDate) &&
    Boolean(employmentStatusId) &&
    Boolean(noticeEmailAction);

  const progress = useMemo(() => {
    const base = checklistProgress(checklist);
    const checklistDoneWithoutNotice = checklist.filter(
      (step) => step.id !== "notice" && isChecklistStepDone(step),
    ).length;
    return {
      done: checklistDoneWithoutNotice + (noticeStepDone ? 1 : 0),
      total: base.total,
    };
  }, [checklist, noticeStepDone]);

  const labelByCode = new Map(
    (leave?.scheduleLabels ?? []).map((l) => [l.code, l]),
  );

  return (
    <div className="-mb-4 flex h-[calc(100%+1rem)] min-h-0 flex-col overflow-hidden md:-mb-8 md:h-[calc(100%+2rem)]">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-6 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => guardAction(goToList)}
                className="mb-3 inline-flex items-center gap-1.5 text-sm text-black/55 transition-colors hover:text-[#3D421F]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Back to OFF-Boarding
              </button>
              <ModulePageTitle iconClassName="text-rose-600">
                {isEditing ? "Off-Boarding settings" : "Start Off-Boarding"}
              </ModulePageTitle>
            </div>
            <div className="flex flex-col items-end gap-2">
              {saveError ? (
                <p className="text-sm text-rose-700">{saveError}</p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => guardAction(goToList)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button type="button" disabled={!canSave} onClick={handleSave}>
                  {saving ? "Saving…" : "Save"}
                  {!saving ? (
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  ) : null}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-6 rounded-xl border border-black/10 bg-[#faf9f6] px-5 py-5 md:px-6">
            <section className="rounded-xl border border-black/10 bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
                Employee
              </p>
              <p className="mt-1 font-serif text-2xl text-[#3D421F]">
                {staff.fullName}
              </p>
              <p className="mt-1 text-sm text-black/55">
                {staff.empNo}
                {staff.departmentName ? ` · ${staff.departmentName}` : ""}
                {staff.positionName ? ` · ${staff.positionName}` : ""}
                {" · "}
                Joined {formatDateOnly(staff.joiningDate)}
                {workedTimeLabel ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-[#3D421F]">
                      {workedTimeLabel}
                    </span>
                  </>
                ) : null}
              </p>
            </section>

            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-serif text-base text-[#3D421F]">
                  Off-Boarding Check List
                </h3>
                <p className="text-xs text-black/45">
                  {progress.done} of {progress.total} stages done
                </p>
              </div>
              <p className="mt-1 text-sm text-black/55">
                Work through each stage in order. Expand a stage to complete its
                fields and checklist items.
              </p>

              <ul className="mt-4 space-y-2">
                {OFFBOARDING_CHECKLIST_STEPS.map((meta) => {
                  const step =
                    checklist.find((row) => row.id === meta.id) ?? {
                      id: meta.id,
                      items: [],
                    };
                  const open = openChecklistStep === meta.id;
                  const done =
                    meta.id === "notice"
                      ? noticeStepDone
                      : isChecklistStepDone(step);
                  const itemDone = step.items.filter((i) => i.done).length;
                  const showTimestamps = TIMESTAMPED_STEPS.has(meta.id);

                  return (
                    <li
                      key={meta.id}
                      className="overflow-hidden rounded-xl border border-black/10 bg-white"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenChecklistStep((current) =>
                            current === meta.id ? null : meta.id,
                          )
                        }
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
                        aria-expanded={open}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            done
                              ? "bg-[var(--venue-primary,#818a40)] text-white"
                              : "border border-black/15 bg-white text-[#3D421F]",
                          )}
                          aria-hidden
                        >
                          {done ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          ) : (
                            meta.number
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-[#3D421F]">
                            {meta.label}
                          </span>
                          <span className="mt-0.5 block text-xs text-black/45">
                            {meta.description}
                            {step.items.length > 0
                              ? ` · ${itemDone}/${step.items.length}`
                              : null}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            done
                              ? "bg-emerald-100 text-emerald-900"
                              : "bg-black/5 text-black/50",
                          )}
                        >
                          {done ? "Done" : "Open"}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-black/40 transition-transform",
                            open && "rotate-180",
                          )}
                          aria-hidden
                        />
                      </button>

                      {open ? (
                        <div className="space-y-4 border-t border-black/5 bg-[#faf9f6]/60 px-4 py-4">
                          {meta.id === "notice" ? (
                            <NoticeStepFields
                              kind={kind}
                              onKindChange={(next) => {
                                setKind(next);
                                setNoticeEmailAction(
                                  next === "resignation"
                                    ? "resignation_confirm"
                                    : "termination_notice",
                                );
                              }}
                              notificationDate={notificationDate}
                              onNotificationDateChange={setNotificationDate}
                              terminationDate={terminationDate}
                              onTerminationDateChange={(iso) => {
                                setTerminationDate(iso);
                                setAutoEmploymentStatus(true);
                                if (!hubAccessDisableDate) {
                                  setHubAccessDisableDate(iso);
                                }
                              }}
                              employmentStatusId={employmentStatusId}
                              employmentStatuses={employmentStatuses}
                              onEmploymentStatusChange={(id) => {
                                setEmploymentStatusId(id);
                                setAutoEmploymentStatus(false);
                              }}
                              noticeEmailAction={noticeEmailAction}
                              onNoticeEmailActionChange={setNoticeEmailAction}
                              noticeEmailRecords={noticeEmailRecords.filter(
                                (row) => row.action === noticeEmailAction,
                              )}
                              onOpenNoticeEmailRecord={(id) =>
                                setViewingNoticeEmailId(id)
                              }
                              onSendNoticeEmail={() =>
                                setNoticeEmailDialogOpen(true)
                              }
                              canSendNotice={
                                Boolean(notificationDate) &&
                                Boolean(terminationDate) &&
                                Boolean(noticeEmailAction)
                              }
                            />
                          ) : null}

                          {meta.id === "handover" ? (
                            <div className="space-y-3">
                              <p className="text-sm text-black/55">
                                Send a clear handover email to the employee, and
                                CC management and HODs so duties and assets are
                                planned before the last working day.
                              </p>
                              <StubEmailButton label="Send handover email" />
                            </div>
                          ) : null}

                          {meta.id === "settlement_calc" ? (
                            <SettlementStepFields
                              leaveLoading={leaveLoading}
                              leaveError={leaveError}
                              leave={leave}
                              alBalance={alBalance}
                              phBalance={phBalance}
                              bookedOpen={bookedOpen}
                              onBookedOpenChange={setBookedOpen}
                              bookedOrOngoing={bookedOrOngoing}
                              labelByCode={labelByCode}
                              autoAdjustments={autoAdjustments}
                              leaveHandling={leaveHandling}
                              onLeaveHandlingChange={setLeaveHandling}
                              leaveEntries={leaveEntries}
                              leaveTypeOptions={leaveTypeOptions}
                              onLeaveEntriesChange={setLeaveEntries}
                              onUpdateLeaveEntry={updateLeaveEntry}
                              settlement={settlement}
                            />
                          ) : null}

                          {meta.id === "final_payslip" ? (
                            <p className="text-sm text-black/55">
                              Issue the final payslip and settlement document
                              once totals are confirmed in stage 3.
                            </p>
                          ) : null}

                          {meta.id === "signatures" ? (
                            <p className="text-sm text-black/55">
                              Collect the clearances below before closing the
                              offboarding file.
                            </p>
                          ) : null}

                          {meta.id === "access" ? (
                            <div className="space-y-3">
                              <p className="text-sm text-black/55">
                                Set the Hub auto-disable date, then deactivate
                                other systems on the last working day.
                              </p>
                              <div className="max-w-xs">
                                <label
                                  htmlFor="ob-hub-disable"
                                  className="mb-1.5 block text-xs font-medium text-[#3D421F]"
                                >
                                  Hub access auto-disable date
                                </label>
                                <DateInput
                                  id="ob-hub-disable"
                                  value={hubAccessDisableDate ?? ""}
                                  onChange={setHubAccessDisableDate}
                                  className="w-full"
                                  inputClassName={fieldClass}
                                />
                              </div>
                            </div>
                          ) : null}

                          {meta.id === "property" ? (
                            <p className="text-sm text-black/55">
                              Tick each item when received. A timestamp is
                              recorded when marked done.
                            </p>
                          ) : null}

                          {meta.id === "benefits_cancel" ? (
                            <p className="text-sm text-black/55">
                              Cancel employment-related benefits where
                              applicable. Timestamps are recorded when marked
                              done.
                            </p>
                          ) : null}

                          {meta.id === "final_payment" ? (
                            <p className="text-sm text-black/55">
                              Process the final settlement payment once
                              clearances and documents are complete.
                            </p>
                          ) : null}

                          {meta.id === "goodbye" ? (
                            <div className="space-y-3">
                              <p className="text-sm text-black/55">
                                Send a final goodbye email to the employee.
                              </p>
                              <StubEmailButton label="Send goodbye email" />
                            </div>
                          ) : null}

                          {step.items.length > 0 ? (
                            <ChecklistItems
                              stepId={meta.id}
                              items={step.items}
                              showTimestamps={showTimestamps}
                              onToggle={(itemId) =>
                                setChecklist((prev) =>
                                  toggleChecklistItem(prev, meta.id, itemId),
                                )
                              }
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <label
                htmlFor="ob-notes"
                className="mb-1.5 block text-xs font-medium text-[#3D421F]"
              >
                Notes
                <span className="ml-1 font-normal text-black/45">
                  (optional)
                </span>
              </label>
              <textarea
                id="ob-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
                placeholder="Internal notes for this exit…"
              />
            </section>
          </div>
        </div>
      </div>

      {unsavedDialog}

      {noticeEmailAction || editingNoticeDraftId ? (
        <OffboardingNoticeEmailDialog
          open={noticeEmailDialogOpen}
          onClose={() => {
            setNoticeEmailDialogOpen(false);
            setEditingNoticeDraftId(null);
          }}
          staffId={staff.id}
          processId={processId}
          action={
            (noticeEmailRecords.find((r) => r.id === editingNoticeDraftId)
              ?.action ??
              noticeEmailAction ??
              "resignation_confirm") as OffboardingNoticeEmailAction
          }
          notificationDate={notificationDate}
          terminationDate={terminationDate}
          editingDraft={
            editingNoticeDraftId
              ? (noticeEmailRecords.find((r) => r.id === editingNoticeDraftId) ??
                null)
              : null
          }
          onSent={(delivery) => {
            setNoticeEmailRecords((prev) => {
              const withoutDraft = prev.filter((row) => row.id !== delivery.id);
              return [...withoutDraft, delivery];
            });
            setNoticeEmailAction(delivery.action);
            setEditingNoticeDraftId(null);
            setNoticeEmailDialogOpen(false);
            setViewingNoticeEmailId(delivery.id);
          }}
          onDraftSaved={(draft) => {
            setNoticeEmailRecords((prev) => {
              const idx = prev.findIndex((row) => row.id === draft.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = draft;
                return next;
              }
              return [...prev, draft];
            });
            setNoticeEmailAction(draft.action);
            setEditingNoticeDraftId(null);
          }}
          onScheduled={(delivery) => {
            setNoticeEmailRecords((prev) => {
              const idx = prev.findIndex((row) => row.id === delivery.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = delivery;
                return next;
              }
              return [...prev, delivery];
            });
            setNoticeEmailAction(delivery.action);
            setEditingNoticeDraftId(null);
            setViewingNoticeEmailId(delivery.id);
          }}
        />
      ) : null}

      {viewingNoticeEmailId
        ? (() => {
            const record = noticeEmailRecords.find(
              (row) => row.id === viewingNoticeEmailId,
            );
            if (!record) return null;
            const canEdit =
              record.status === "draft" || record.status === "scheduled";
            return (
              <OffboardingNoticeEmailRecordViewer
                record={record}
                onClose={() => setViewingNoticeEmailId(null)}
                onEdit={
                  canEdit
                    ? () => {
                        setViewingNoticeEmailId(null);
                        setNoticeEmailAction(record.action);
                        setEditingNoticeDraftId(record.id);
                        setNoticeEmailDialogOpen(true);
                      }
                    : undefined
                }
                onSend={
                  canEdit
                    ? async () => {
                        const result = await sendBoardingNoticeEmail({
                          id: record.id,
                          staffId: staff.id,
                          processId,
                          action: record.action,
                          templateId: record.templateId,
                          notificationDate,
                          terminationDate,
                          subject: record.subject,
                          message: record.message,
                        });
                        if (!result.ok) return result;
                        setNoticeEmailRecords((prev) => {
                          const without = prev.filter(
                            (row) => row.id !== record.id,
                          );
                          return [...without, result.delivery];
                        });
                        setNoticeEmailAction(result.delivery.action);
                        setViewingNoticeEmailId(result.delivery.id);
                        return { ok: true as const, delivery: result.delivery };
                      }
                    : undefined
                }
                onCancelSchedule={
                  record.status === "scheduled"
                    ? async () => {
                        const result = await cancelScheduledBoardingNoticeEmail(
                          {
                            id: record.id,
                            staffId: staff.id,
                          },
                        );
                        if (!result.ok) return result;
                        setNoticeEmailRecords((prev) => {
                          const idx = prev.findIndex(
                            (row) => row.id === record.id,
                          );
                          if (idx < 0) return [...prev, result.draft];
                          const next = [...prev];
                          next[idx] = result.draft;
                          return next;
                        });
                        setViewingNoticeEmailId(result.draft.id);
                        return { ok: true as const, draft: result.draft };
                      }
                    : undefined
                }
              />
            );
          })()
        : null}
    </div>
  );
}

function NoticeStepFields({
  kind,
  onKindChange,
  notificationDate,
  onNotificationDateChange,
  terminationDate,
  onTerminationDateChange,
  employmentStatusId,
  employmentStatuses,
  onEmploymentStatusChange,
  noticeEmailAction,
  onNoticeEmailActionChange,
  noticeEmailRecords,
  onOpenNoticeEmailRecord,
  onSendNoticeEmail,
  canSendNotice,
}: {
  kind: OffboardingTerminationKind;
  onKindChange: (kind: OffboardingTerminationKind) => void;
  notificationDate: string;
  onNotificationDateChange: (iso: string) => void;
  terminationDate: string;
  onTerminationDateChange: (iso: string) => void;
  employmentStatusId: string;
  employmentStatuses: EmploymentStatus[];
  onEmploymentStatusChange: (id: string) => void;
  noticeEmailAction: OffboardingNoticeEmailAction | null;
  onNoticeEmailActionChange: (action: OffboardingNoticeEmailAction) => void;
  noticeEmailRecords: OffboardingNoticeEmailDelivery[];
  onOpenNoticeEmailRecord: (id: string) => void;
  onSendNoticeEmail: () => void;
  canSendNotice: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-black/45">
          Termination reason / type
        </h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {OFFBOARDING_TERMINATION_KIND_OPTIONS.map((opt) => {
            const selected = kind === opt.value;
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  selected
                    ? "border-[var(--venue-primary,#818a40)]/50 bg-[var(--venue-primary,#818a40)]/10"
                    : "border-black/10 bg-white hover:bg-black/[0.02]",
                )}
              >
                <input
                  type="radio"
                  name="termination-kind"
                  className="mt-1"
                  checked={selected}
                  onChange={() => onKindChange(opt.value)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[#3D421F]">
                    {opt.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-black/50">
                    {opt.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col">
          <label
            htmlFor="ob-notification-date"
            className="mb-1.5 block text-xs font-medium text-[#3D421F]"
          >
            <span className="block leading-4">Termination notification given</span>
            <span className="mt-0.5 block min-h-4 font-normal leading-4 text-black/45">
              &nbsp;
            </span>
          </label>
          <DateInput
            id="ob-notification-date"
            value={notificationDate}
            onChange={onNotificationDateChange}
            className="w-full"
            inputClassName={fieldClass}
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <label
            htmlFor="ob-termination-date"
            className="mb-1.5 block text-xs font-medium text-[#3D421F]"
          >
            <span className="block leading-4">Last working day</span>
            <span className="mt-0.5 block min-h-4 font-normal leading-4 text-black/45">
              Termination date · syncs with directory
            </span>
          </label>
          <DateInput
            id="ob-termination-date"
            value={terminationDate}
            onChange={onTerminationDateChange}
            className="w-full"
            inputClassName={fieldClass}
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <label
            htmlFor="ob-employment-status"
            className="mb-1.5 block text-xs font-medium text-[#3D421F]"
          >
            <span className="block leading-4">Status</span>
            <span className="mt-0.5 block min-h-4 font-normal leading-4 text-black/45">
              Auto · syncs with directory
            </span>
          </label>
          <select
            id="ob-employment-status"
            value={employmentStatusId}
            onChange={(e) => onEmploymentStatusChange(e.target.value)}
            className={fieldClass}
          >
            <option value="">— Select —</option>
            {employmentStatuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-black/45">
          Notice email
        </h4>
        <div className="mt-2 space-y-2">
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
              noticeEmailAction === "resignation_confirm"
                ? "border-[var(--venue-primary,#818a40)]/50 bg-[var(--venue-primary,#818a40)]/10"
                : "border-black/10 bg-white hover:bg-black/[0.02]",
            )}
          >
            <input
              type="radio"
              name="notice-email-action"
              className="mt-1"
              checked={noticeEmailAction === "resignation_confirm"}
              onChange={() => onNoticeEmailActionChange("resignation_confirm")}
            />
            <span className="text-sm text-[#3D421F]">
              Send an email to the employee to confirm acceptance or rejection
              of the resignation letter
            </span>
          </label>
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
              noticeEmailAction === "termination_notice"
                ? "border-[var(--venue-primary,#818a40)]/50 bg-[var(--venue-primary,#818a40)]/10"
                : "border-black/10 bg-white hover:bg-black/[0.02]",
            )}
          >
            <input
              type="radio"
              name="notice-email-action"
              className="mt-1"
              checked={noticeEmailAction === "termination_notice"}
              onChange={() => onNoticeEmailActionChange("termination_notice")}
            />
            <span className="text-sm text-[#3D421F]">
              Send an email to the employee with a notice of termination
            </span>
          </label>
        </div>
        <div className="mt-3 space-y-3">
          <Button
            type="button"
            variant="secondary"
            className="gap-2"
            disabled={!canSendNotice}
            onClick={onSendNoticeEmail}
          >
            <Mail className="h-4 w-4" aria-hidden />
            {noticeEmailAction === "termination_notice"
              ? "Send termination notice email"
              : "Send resignation confirmation email"}
          </Button>

          {noticeEmailRecords.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
                Email records
              </p>
              <ul className="space-y-2">
                {[...noticeEmailRecords].reverse().map((record) => (
                  <li key={record.id}>
                    <OffboardingNoticeEmailRecordCard
                      record={record}
                      onOpen={() => onOpenNoticeEmailRecord(record.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SettlementStepFields({
  leaveLoading,
  leaveError,
  leave,
  alBalance,
  phBalance,
  bookedOpen,
  onBookedOpenChange,
  bookedOrOngoing,
  labelByCode,
  autoAdjustments,
  leaveHandling,
  onLeaveHandlingChange,
  leaveEntries,
  leaveTypeOptions,
  onLeaveEntriesChange,
  onUpdateLeaveEntry,
  settlement,
}: {
  leaveLoading: boolean;
  leaveError: string | null;
  leave: LeaveSnapshot | null;
  alBalance: number;
  phBalance: number;
  bookedOpen: boolean;
  onBookedOpenChange: (open: boolean) => void;
  bookedOrOngoing: ScheduledLeaveRange[];
  labelByCode: Map<string, ScheduledLeaveLabelStyle>;
  autoAdjustments: ReturnType<typeof defaultAutoAdjustments>;
  leaveHandling: OffboardingLeaveHandling;
  onLeaveHandlingChange: (handling: OffboardingLeaveHandling) => void;
  leaveEntries: OffboardingLeaveEntry[];
  leaveTypeOptions: ReadonlyArray<{ code: string; name: string }>;
  onLeaveEntriesChange: (
    entries:
      | OffboardingLeaveEntry[]
      | ((prev: OffboardingLeaveEntry[]) => OffboardingLeaveEntry[]),
  ) => void;
  onUpdateLeaveEntry: (
    id: string,
    patch: Partial<OffboardingLeaveEntry>,
  ) => void;
  settlement: ReturnType<typeof buildSettlementPreview>;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/60 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-serif text-sm text-[#3D421F]">
            Leave balances remaining (pro-rata)
          </h4>
          {leaveLoading ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-black/45">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Loading from leave ledger…
            </span>
          ) : null}
        </div>
        {leaveError ? (
          <p className="mt-3 text-sm text-rose-700">{leaveError}</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <BalanceCard
              label="Annual leave (AL)"
              days={alBalance}
              detail={
                leave
                  ? `${formatDays(leave.alAvail)} avail · ${formatDays(leave.alUsed)} used · ${formatDays(leave.alScheduled)} scheduled`
                  : undefined
              }
              loading={leaveLoading}
            />
            <BalanceCard
              label="Public holiday (PH)"
              days={phBalance}
              detail={
                leave
                  ? `${formatDays(leave.phAvail)} avail · ${formatDays(leave.phUsed)} used`
                  : undefined
              }
              loading={leaveLoading}
            />
          </div>
        )}

        <div className="mt-4 border-t border-black/5 pt-3">
          <button
            type="button"
            onClick={() => onBookedOpenChange(!bookedOpen)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={bookedOpen}
          >
            <span className="font-serif text-sm text-[#3D421F]">
              Booked or ongoing leave
              {!leaveLoading && leave ? (
                <span className="ml-2 font-sans text-xs text-black/45">
                  {bookedOrOngoing.length}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-black/40 transition-transform",
                bookedOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          {bookedOpen ? (
            <div className="mt-3">
              {leaveLoading ? (
                <p className="text-sm text-black/45">Loading schedule…</p>
              ) : bookedOrOngoing.length === 0 ? (
                <p className="rounded-lg border border-dashed border-black/10 bg-white/70 px-3 py-4 text-center text-sm text-black/45">
                  No booked or ongoing leave on the schedule.
                </p>
              ) : (
                <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-black/10 bg-white">
                  {bookedOrOngoing.map((range) => {
                    const label = labelByCode.get(range.labelCode);
                    const timing = leaveTimingStatus(
                      range.fromDate,
                      range.toDate,
                    );
                    const approval = range.approvalStatus ?? "scheduled";
                    return (
                      <li
                        key={`${range.labelCode}-${range.fromDate}-${range.toDate}`}
                        className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                      >
                        <span
                          className="inline-flex min-w-[3rem] items-center justify-center rounded-md border px-2 py-1 font-mono text-xs font-medium"
                          style={
                            label
                              ? {
                                  backgroundColor: label.bgColor,
                                  color: label.textColor,
                                  borderColor: label.borderColor,
                                }
                              : undefined
                          }
                        >
                          {label?.abbreviation ?? range.labelCode}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#3D421F]">
                            {label?.name ??
                              scheduleLeaveDisplayName(range.labelCode)}
                          </p>
                          <p className="text-xs text-black/50">
                            {formatLeaveRange(range.fromDate, range.toDate)}
                            {" · "}
                            {range.days} day
                            {range.days === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            timing.className,
                          )}
                        >
                          {timing.label}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                            approvalPillClass(approval),
                          )}
                        >
                          {approval}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <h4 className="font-serif text-sm text-[#3D421F]">
          Automatically adjusts
        </h4>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          <AutoRow
            active={autoAdjustments.salaryToLastDay}
            label="Salary to last working day"
          />
          <AutoRow
            active={autoAdjustments.annualLeavePayout}
            label="Annual leave payout"
          />
          <AutoRow
            active={autoAdjustments.eosGratuity}
            label="EOS Gratuity (if eligible)"
          />
          <AutoRow
            active={autoAdjustments.publicHolidayBalance}
            label="Public holiday balance"
          />
          <AutoRow
            active={autoAdjustments.noticePay}
            label="Notice pay"
            muted={!autoAdjustments.noticePay}
            hint={
              autoAdjustments.noticePay
                ? undefined
                : "Applies when Termination with Notice is selected"
            }
          />
        </ul>
      </div>

      <div>
        <h4 className="font-serif text-sm text-[#3D421F]">Remaining leave</h4>
        <div className="mt-3 space-y-2">
          <OptionCard
            selected={leaveHandling === "use_on_last_days"}
            onSelect={() => onLeaveHandlingChange("use_on_last_days")}
            title="Use remaining leave on the last working days"
            description="Schedule AL / PH against the final period before the last paid day."
          >
            {leaveHandling === "use_on_last_days" ? (
              <div className="mt-3 space-y-3 border-t border-black/5 pt-3">
                {leaveEntries.length === 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      onLeaveEntriesChange([
                        emptyLeaveEntry(leaveTypeOptions[0]?.code ?? "AL"),
                      ])
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] transition-colors hover:bg-black/[0.03]"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Create leave
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
                      Leave information
                    </p>
                    {leaveEntries.map((entry, index) => (
                      <LeaveEntryForm
                        key={entry.id}
                        entry={entry}
                        index={index}
                        leaveTypes={leaveTypeOptions}
                        onChange={(patch) =>
                          onUpdateLeaveEntry(entry.id, patch)
                        }
                        onRemove={() =>
                          onLeaveEntriesChange((prev) =>
                            prev.filter((row) => row.id !== entry.id),
                          )
                        }
                        canRemove={leaveEntries.length > 1}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        onLeaveEntriesChange((prev) => [
                          ...prev,
                          emptyLeaveEntry(leaveTypeOptions[0]?.code ?? "AL"),
                        ])
                      }
                      className="inline-flex h-8 items-center gap-1.5 text-sm font-medium text-[var(--venue-primary,#818a40)] hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      Add another leave
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </OptionCard>

          <OptionCard
            selected={leaveHandling === "pay_off"}
            onSelect={() => {
              onLeaveHandlingChange("pay_off");
              onLeaveEntriesChange([]);
            }}
            title="Pay off remaining leave and other entitlements"
            description="Values are calculated for the final settlement."
          >
            {leaveHandling === "pay_off" ? (
              <div className="mt-3 space-y-2 border-t border-black/5 pt-3 text-xs">
                <SettleRow
                  label={`AL payout (${formatDays(settlement.alDays)} d)`}
                  value={formatAed(settlement.alPayout)}
                />
                <SettleRow
                  label={`PH payout (${formatDays(settlement.phDays)} d)`}
                  value={formatAed(settlement.phPayout)}
                />
                <SettleRow
                  label="EOS Gratuity"
                  value={formatAed(settlement.eosGratuity)}
                />
                {settlement.noticePayDays > 0 ? (
                  <SettleRow
                    label={`Notice pay (${settlement.noticePayDays} d)`}
                    value={formatAed(settlement.noticePay)}
                  />
                ) : null}
                <SettleRow
                  label="Estimated settlement add-ons"
                  value={formatAed(settlement.estimatedTotal)}
                  strong
                />
                {settlement.dailyRate == null ? (
                  <p className="text-amber-800/80">
                    Daily rate unavailable — set wage package on the staff
                    record for payout estimates.
                  </p>
                ) : null}
              </div>
            ) : null}
          </OptionCard>
        </div>
      </div>
    </div>
  );
}

function ChecklistItems({
  stepId,
  items,
  showTimestamps,
  onToggle,
}: {
  stepId: OffboardingChecklistStepId;
  items: OffboardingChecklistStepState["items"];
  showTimestamps: boolean;
  onToggle: (itemId: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const stamped = formatDoneAt(item.doneAt);
        return (
          <li key={`${stepId}-${item.id}`}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-black/10 bg-white px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={item.done}
                onChange={() => onToggle(item.id)}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm text-[#3D421F]",
                    item.done && "text-black/45 line-through",
                  )}
                >
                  {item.label}
                </span>
                {showTimestamps && stamped ? (
                  <span className="mt-0.5 block text-xs text-black/40">
                    Done {stamped}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function StubEmailButton({
  label,
  disabled,
}: {
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button type="button" variant="secondary" disabled={disabled} className="gap-2">
      <Mail className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  );
}

function formatDays(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString("en-AE", {
    maximumFractionDigits: 1,
  });
}

function todayIsoLocal(asOf: Date = new Date()): string {
  return `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}-${String(asOf.getDate()).padStart(2, "0")}`;
}

function formatLeaveRange(fromDate: string, toDate: string): string {
  const from = formatDateOnly(fromDate);
  const to = formatDateOnly(toDate);
  if (fromDate === toDate) return from;
  return `${from} – ${to}`;
}

function leaveTimingStatus(
  fromDate: string,
  toDate: string,
): { label: string; className: string } {
  const today = todayIsoLocal();
  const from = fromDate.slice(0, 10);
  const to = toDate.slice(0, 10);
  if (to < today) {
    return { label: "Taken", className: "bg-black/[0.06] text-black/60" };
  }
  if (from > today) {
    return {
      label: "Upcoming",
      className:
        "bg-[var(--venue-secondary,#F0F3DD)] text-[var(--venue-primary,#818a40)]",
    };
  }
  return {
    label: "In progress",
    className: "bg-amber-50 text-amber-900/80",
  };
}

function approvalPillClass(status: LeaveCalendarStatus): string {
  switch (status) {
    case "approved":
      return "bg-emerald-100 text-emerald-900";
    case "pending":
      return "bg-amber-100 text-amber-900";
    case "rejected":
      return "bg-rose-100 text-rose-800";
    case "cancelled":
      return "bg-black/5 text-black/45";
    default:
      return "bg-sky-100 text-sky-900";
  }
}

function BalanceCard({
  label,
  days,
  detail,
  loading,
}: {
  label: string;
  days: number;
  detail?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-black/8 bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
        {label}
      </p>
      <p className="mt-1 font-serif text-xl text-[#3D421F]">
        {loading ? "…" : formatDays(days)}
        <span className="ml-1 text-sm font-sans text-black/45">days</span>
      </p>
      {detail && !loading ? (
        <p className="mt-1 text-[11px] text-black/45">{detail}</p>
      ) : null}
    </div>
  );
}

function AutoRow({
  active,
  label,
  muted,
  hint,
}: {
  active: boolean;
  label: string;
  muted?: boolean;
  hint?: string;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2.5 text-sm",
        muted ? "text-black/35" : "text-[#3D421F]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          active
            ? "bg-[var(--venue-primary,#818a40)] text-white"
            : "border border-black/15 bg-white text-transparent",
        )}
        aria-hidden
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <span>
        <span className="block">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs text-black/40">{hint}</span>
        ) : null}
      </span>
    </li>
  );
}

function OptionCard({
  selected,
  onSelect,
  title,
  description,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 transition-colors",
        selected
          ? "border-[var(--venue-primary,#818a40)]/50 bg-[var(--venue-primary,#818a40)]/10"
          : "border-black/10 bg-white",
      )}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="radio"
          name="leave-handling"
          className="mt-1"
          checked={selected}
          onChange={onSelect}
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[#3D421F]">
            {title}
          </span>
          <span className="mt-0.5 block text-xs text-black/50">
            {description}
          </span>
        </span>
      </label>
      {children}
    </div>
  );
}

function LeaveEntryForm({
  entry,
  index,
  leaveTypes,
  onChange,
  onRemove,
  canRemove,
}: {
  entry: OffboardingLeaveEntry;
  index: number;
  leaveTypes: ReadonlyArray<{ code: string; name: string }>;
  onChange: (patch: Partial<OffboardingLeaveEntry>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const approvalName = `leave-approval-${entry.id}`;

  return (
    <div className="rounded-lg border border-black/10 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-black/45">Leave {index + 1}</p>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1 text-black/40 transition-colors hover:bg-black/5 hover:text-rose-700"
            aria-label={`Remove leave ${index + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <label className="mb-1 block text-[11px] font-medium text-[#3D421F]">
            Type
          </label>
          <select
            value={entry.leaveType}
            onChange={(e) => onChange({ leaveType: e.target.value })}
            className={fieldClass}
          >
            {leaveTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} — {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label className="mb-1 block text-[11px] font-medium text-[#3D421F]">
            Starting day
          </label>
          <DateInput
            value={entry.startDate}
            onChange={(iso) =>
              onChange({
                startDate: iso,
                endDate:
                  entry.endDate && entry.endDate < iso ? iso : entry.endDate,
              })
            }
            className="w-full"
            inputClassName={fieldClass}
          />
        </div>

        <div className="min-w-0">
          <label className="mb-1 block text-[11px] font-medium text-[#3D421F]">
            End day
          </label>
          <DateInput
            value={entry.endDate}
            onChange={(iso) => onChange({ endDate: iso })}
            className="w-full"
            inputClassName={fieldClass}
          />
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-medium text-[#3D421F]">Action</p>
          <div className="flex h-10 items-stretch overflow-hidden rounded-lg border border-black/10 bg-white">
            <ApprovalToggle
              name={approvalName}
              value="draft"
              checked={entry.approvalMode === "draft"}
              label="Draft"
              onSelect={() => onChange({ approvalMode: "draft" })}
            />
            <ApprovalToggle
              name={approvalName}
              value="direct_approve"
              checked={entry.approvalMode === "direct_approve"}
              label="Direct approve"
              onSelect={() => onChange({ approvalMode: "direct_approve" })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovalToggle({
  name,
  value,
  checked,
  label,
  onSelect,
}: {
  name: string;
  value: OffboardingLeaveApprovalMode;
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex flex-1 cursor-pointer items-center justify-center px-2 text-center text-xs font-medium transition-colors",
        checked
          ? "bg-[var(--venue-primary,#818a40)] text-white"
          : "bg-white text-[#3D421F] hover:bg-black/[0.03]",
        value === "direct_approve" && "border-l border-black/10",
      )}
    >
      <input
        type="radio"
        name={name}
        className="sr-only"
        checked={checked}
        onChange={onSelect}
      />
      {label}
    </label>
  );
}

function SettleRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        strong && "border-t border-black/10 pt-2 font-medium text-[#3D421F]",
      )}
    >
      <span className={strong ? undefined : "text-black/55"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
