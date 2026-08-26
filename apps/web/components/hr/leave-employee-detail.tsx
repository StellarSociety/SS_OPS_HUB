"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ExternalLink,
  History,
  Minus,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { AnnualLeaveCalculationCard } from "@/components/hr/annual-leave-calculation-card";
import { LeaveActivityDialog } from "@/components/hr/leave-activity-dialog";
import { LeaveBalanceRing } from "@/components/hr/leave-balance-ring";
import { LeaveCalendarDialog } from "@/components/hr/leave-calendar-dialog";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { StatusBadge } from "@/components/hr/status-badge";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  adjustLeaveBalance,
  approveLeaveCalendarEntry,
  deleteLeaveBalanceAdjustment,
  getStaffAllowanceDetails,
  getStaffPhReplacementCredits,
  rejectLeaveCalendarEntry,
  updateLeaveBalanceAdjustment,
  type AllowanceDetailsField,
} from "@/lib/actions/hr-leave";
import {
  availableBalance,
  canCarryForwardLeaveCode,
  findLeaveType,
  formatLeaveDays,
  isManualLeaveAdjustmentField,
  isUsageOnlyLeaveCode,
  roundDays,
  leaveCalendarStatusLabel,
  leaveTypeDisplayName,
  scheduleLeaveDisplayName,
  type LeaveCalendarEvent,
  type LeaveCalendarStatus,
  type LeaveUsageDayEntry,
  type PhReplacementCreditEntry,
  type ScheduledLeaveLabelStyle,
  type ScheduledLeaveRange,
  type AnnualLeaveCalculationBreakdown,
} from "@/lib/hr/leave";
import type {
  HrLeaveBalance,
  HrLeaveBalanceAdjustment,
  HrLeavePolicySettings,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";
import { toScopedHref } from "@/lib/venue/scope-routing";

function formatDayMonthYear(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(`${value.trim()}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value.trim();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function formatLeaveRange(fromDate: string, toDate: string): string {
  const from = formatDayMonthYear(fromDate);
  const to = formatDayMonthYear(toDate);
  if (!from) return to ?? fromDate;
  if (!to || fromDate === toDate) return from;
  return `${from} – ${to}`;
}

function todayIsoLocal(asOf: Date = new Date()): string {
  return `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}-${String(asOf.getDate()).padStart(2, "0")}`;
}

function scheduledLeaveTimingStatus(
  fromDate: string,
  toDate: string,
  asOf: Date = new Date(),
): { label: string; className: string } {
  const today = todayIsoLocal(asOf);
  const from = fromDate.slice(0, 10);
  const to = toDate.slice(0, 10);
  if (to < today) {
    return {
      label: "Taken",
      className: "bg-black/[0.06] text-black/60",
    };
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

function approvalStatusStyle(status: LeaveCalendarStatus): string {
  switch (status) {
    case "approved":
      return "bg-emerald-50 text-emerald-800";
    case "pending":
      return "bg-amber-50 text-amber-900/80";
    case "rejected":
      return "bg-red-50 text-red-800";
    case "cancelled":
      return "bg-black/[0.06] text-black/50";
    case "scheduled":
    default:
      return "bg-sky-50 text-sky-900/80";
  }
}

type LeaveEmployeeDetailProps = {
  year: number;
  policy: HrLeavePolicySettings;
  staff: {
    id: string;
    emp_no: string;
    full_name: string;
    joining_date: string | null;
    termination_date: string | null;
    probation_status: string | null;
    photo_url: string | null;
    dob: string | null;
    department: { name: string } | null;
    position: { name: string } | null;
    employment_status: { name: string } | null;
    working_status: { name: string } | null;
    nationality: { name: string } | null;
  };
  balances: HrLeaveBalance[];
  adjustments: HrLeaveBalanceAdjustment[];
  scheduledLeaves: ScheduledLeaveRange[];
  scheduleLabels: ScheduledLeaveLabelStyle[];
  annualLeaveCalculation?: AnnualLeaveCalculationBreakdown | null;
  canManage: boolean;
  onBack: () => void;
};

const TIER_GROUPS = [
  {
    id: "sick",
    code: "SL",
    label: "Sick Leave",
    stages: ["SL-FP", "SL-HP", "SL-UP"] as const,
  },
  {
    id: "maternity",
    code: "ML",
    label: "Maternity Leave",
    stages: ["ML-FP", "ML-HP", "ML-UP"] as const,
  },
] as const;

type RingSlot =
  | { kind: "single"; code: string }
  | { kind: "group"; group: (typeof TIER_GROUPS)[number] };

/** Core balances shown first. */
const PRIMARY_RING_SLOTS: RingSlot[] = [
  { kind: "single", code: "AL" },
  { kind: "single", code: "PH-REPL" },
  { kind: "group", group: TIER_GROUPS[0] },
  { kind: "single", code: "UPL" },
];

/** Other entitlements below the divider. */
const SECONDARY_RING_SLOTS: RingSlot[] = [
  { kind: "single", code: "PL" },
  { kind: "group", group: TIER_GROUPS[1] },
  { kind: "single", code: "HL" },
  { kind: "single", code: "BL" },
  { kind: "single", code: "STL" },
];

/** Allowances table: AL → PH → SL stages → UPL, then everything else behind a toggle. */
const PRIMARY_ALLOWANCE_CODES = [
  "AL",
  "PH-REPL",
  "SL-FP",
  "SL-HP",
  "SL-UP",
  "UPL",
] as const;

const PRIMARY_ALLOWANCE_CODE_SET = new Set<string>(PRIMARY_ALLOWANCE_CODES);

function scheduledRangeToEvent(
  range: ScheduledLeaveRange,
  staff: LeaveEmployeeDetailProps["staff"],
): LeaveCalendarEvent {
  return {
    id:
      range.requestId ??
      `schedule:${staff.id}:${range.fromDate}:${range.toDate}:${range.labelCode}`,
    requestId: range.requestId ?? null,
    staffId: staff.id,
    empNo: staff.emp_no,
    fullName: staff.full_name,
    departmentId: null,
    departmentName: staff.department?.name ?? null,
    labelCode: range.labelCode,
    leaveTypeId: null,
    fromDate: range.fromDate,
    toDate: range.toDate,
    days: range.days,
    status: range.approvalStatus ?? "scheduled",
    rawStatus: null,
    notes: null,
    onSchedule: true,
    source: range.requestId ? "both" : "schedule",
  };
}

function ringMetrics(
  bal: HrLeaveBalance | undefined,
  code?: string,
): { available: number; used: number; total: number } {
  const available = bal ? availableBalance(bal) : 0;
  const used = bal?.used ?? 0;
  const pool =
    (bal?.accrued ?? 0) + (bal?.carried_forward ?? 0) + (bal?.adjusted ?? 0);
  const entitled = bal?.entitled ?? 0;
  // Prefer the working pool; fall back to statutory entitled when pool is empty.
  const total = pool > 0 ? pool : Math.max(entitled, available + used);
  if (code === "AL") {
    return {
      available: roundDays(available),
      used: roundDays(used),
      total: roundDays(total),
    };
  }
  return { available, used, total };
}

function renderRingSlots(
  slots: RingSlot[],
  byCode: Map<string, HrLeaveBalance>,
  policy: HrLeavePolicySettings,
  openGroupId: string | null,
  onOpenGroup: (groupId: string) => void,
) {
  return slots.map((slot) => {
    if (slot.kind === "single") {
      const code = slot.code;
      const bal = byCode.get(code);
      const type = findLeaveType(policy, code);
      if (!bal && !type?.active) return null;
      const { available, used, total } = ringMetrics(bal, code);
      return (
        <LeaveBalanceRing
          key={code}
          code={code}
          label={leaveTypeDisplayName(code, type)}
          available={available}
          used={used}
          total={total}
        />
      );
    }

    const { group } = slot;
    const stageRows = group.stages.map((code) => {
      const bal = byCode.get(code);
      const type = findLeaveType(policy, code);
      const metrics = ringMetrics(bal, code);
      return { code, bal, type, ...metrics };
    });
    const anyActive = stageRows.some(
      (row) => row.bal || row.type?.active !== false,
    );
    if (!anyActive) return null;

    const available = stageRows.reduce((s, r) => s + r.available, 0);
    const used = stageRows.reduce((s, r) => s + r.used, 0);
    const total = stageRows.reduce((s, r) => s + r.total, 0);
    const isOpen = openGroupId === group.id;

    return (
      <LeaveBalanceRing
        key={group.id}
        code={group.code}
        label={group.label}
        available={available}
        used={used}
        total={total}
        expanded={isOpen}
        hint="View pay stages"
        onClick={() => onOpenGroup(group.id)}
      />
    );
  });
}

export function LeaveEmployeeDetail({
  year,
  policy,
  staff,
  balances,
  adjustments,
  scheduledLeaves,
  scheduleLabels,
  annualLeaveCalculation = null,
  canManage,
  onBack,
}: LeaveEmployeeDetailProps) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [adjustCode, setAdjustCode] = useState("AL");
  const [adjustField, setAdjustField] = useState<"adjusted" | "carried_forward">(
    "adjusted",
  );
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [showOtherLeave, setShowOtherLeave] = useState(false);
  const [showOtherAllowances, setShowOtherAllowances] = useState(false);
  const [showManualAdjustment, setShowManualAdjustment] = useState(false);
  const [scheduleActionPending, startScheduleAction] = useTransition();
  const [editingLeave, setEditingLeave] = useState<LeaveCalendarEvent | null>(
    null,
  );
  const [activityLeave, setActivityLeave] = useState<ScheduledLeaveRange | null>(
    null,
  );
  const [scheduleActionKey, setScheduleActionKey] = useState<string | null>(
    null,
  );
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(
    null,
  );
  const [editAdjNewValue, setEditAdjNewValue] = useState("");
  const [editAdjReason, setEditAdjReason] = useState("");
  const [editAdjMessage, setEditAdjMessage] = useState<string | null>(null);
  const [editAdjPending, startEditAdjTransition] = useTransition();
  const [phCreditsOpen, setPhCreditsOpen] = useState(false);
  const [phCreditsPending, startPhCredits] = useTransition();
  const [phCreditsError, setPhCreditsError] = useState<string | null>(null);
  const [phCredits, setPhCredits] = useState<PhReplacementCreditEntry[]>([]);
  const [allowanceDetailsOpen, setAllowanceDetailsOpen] = useState(false);
  const [allowanceDetailsField, setAllowanceDetailsField] =
    useState<AllowanceDetailsField>("available");
  const [allowanceDetailsCode, setAllowanceDetailsCode] = useState("AL");
  const [allowanceDetailsPending, startAllowanceDetails] = useTransition();
  const [allowanceDetailsError, setAllowanceDetailsError] = useState<
    string | null
  >(null);
  const [allowanceDetailsDays, setAllowanceDetailsDays] = useState<{
    used: LeaveUsageDayEntry[];
    scheduled: LeaveUsageDayEntry[];
    pending: LeaveUsageDayEntry[];
  } | null>(null);

  const byCode = new Map(balances.map((b) => [b.leave_type_code, b]));
  const labelByCode = new Map(scheduleLabels.map((l) => [l.code, l]));
  const recentManualAdjustments = adjustments
    .filter((a) => isManualLeaveAdjustmentField(a.field))
    .slice(0, 8);
  const scheduledLeaveDays = scheduledLeaves.reduce((sum, r) => sum + r.days, 0);
  const joinedLabel = formatDayMonthYear(staff.joining_date);
  const terminatedLabel = formatDayMonthYear(staff.termination_date);
  const adjustType = findLeaveType(policy, adjustCode);
  const adjustSupportsCarry = canCarryForwardLeaveCode(adjustCode);
  const effectiveAdjustField =
    adjustField === "carried_forward" && !adjustSupportsCarry
      ? "adjusted"
      : adjustField;
  const primaryAllowances = PRIMARY_ALLOWANCE_CODES.map((code) =>
    byCode.get(code),
  ).filter((bal): bal is HrLeaveBalance => Boolean(bal));
  const otherAllowances = [...balances]
    .filter((bal) => !PRIMARY_ALLOWANCE_CODE_SET.has(bal.leave_type_code))
    .sort((a, b) => {
      const ia = policy.leaveTypes.findIndex((t) => t.code === a.leave_type_code);
      const ib = policy.leaveTypes.findIndex((t) => t.code === b.leave_type_code);
      if (ia !== ib) {
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      }
      return a.leave_type_code.localeCompare(b.leave_type_code);
    });
  const visibleAllowances = showOtherAllowances
    ? [...primaryAllowances, ...otherAllowances]
    : primaryAllowances;
  const leaveTypeOptions = scheduleLabels.map((label) => ({
    code: label.code,
    name: label.name,
    bgColor: label.bgColor,
    textColor: label.textColor,
    borderColor: label.borderColor,
  }));
  const validationHref = toScopedHref(
    `/hr/attendance/validation?staffId=${encodeURIComponent(staff.id)}`,
    scope,
    slug,
  );

  function rangeActionKey(range: ScheduledLeaveRange): string {
    return `${range.labelCode}:${range.fromDate}:${range.toDate}:${range.requestId ?? ""}`;
  }

  function runDeleteLeave(range: ScheduledLeaveRange) {
    const label =
      labelByCode.get(range.labelCode)?.name ??
      scheduleLeaveDisplayName(range.labelCode);
    const ok = window.confirm(
      `Delete ${label} (${formatLeaveRange(range.fromDate, range.toDate)}) from the schedule?`,
    );
    if (!ok) return;
    const key = rangeActionKey(range);
    setScheduleActionKey(key);
    startScheduleAction(async () => {
      const result = await rejectLeaveCalendarEntry({
        requestId: range.requestId,
        staffId: staff.id,
        fromDate: range.fromDate,
        toDate: range.toDate,
        labelCode: range.labelCode,
        clearSchedule: true,
      });
      setScheduleActionKey(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved("Leave removed from the schedule.");
      router.refresh();
    });
  }

  function runApproveLeave(range: ScheduledLeaveRange) {
    const key = rangeActionKey(range);
    setScheduleActionKey(key);
    startScheduleAction(async () => {
      const result = await approveLeaveCalendarEntry({
        requestId: range.requestId,
        staffId: staff.id,
        labelCode: range.labelCode,
        fromDate: range.fromDate,
        toDate: range.toDate,
        previousFromDate: range.fromDate,
        previousToDate: range.toDate,
        previousLabelCode: range.labelCode,
      });
      setScheduleActionKey(null);
      if (result.error) {
        window.alert(result.error);
        toast.error(result.error);
        return;
      }
      toast.saved("Leave approved.");
      router.refresh();
    });
  }
  const popupGroup = TIER_GROUPS.find((g) => g.id === expandedGroup) ?? null;
  const popupStages = popupGroup
    ? popupGroup.stages.map((code) => {
        const bal = byCode.get(code);
        const type = findLeaveType(policy, code);
        const metrics = ringMetrics(bal, code);
        return { code, type, ...metrics };
      })
    : [];
  const popupTotals = popupStages.reduce(
    (acc, row) => ({
      available: acc.available + row.available,
      used: acc.used + row.used,
      total: acc.total + row.total,
    }),
    { available: 0, used: 0, total: 0 },
  );

  function submitAdjust() {
    setMessage(null);
    const bal = byCode.get(adjustCode);
    if (!bal) {
      setMessage("Balance row not found for that leave type.");
      return;
    }
    if (
      effectiveAdjustField === "carried_forward" &&
      !canCarryForwardLeaveCode(adjustCode)
    ) {
      setMessage("Only AL and Public Holiday can carry days between years.");
      return;
    }
    const amount = Math.round(Number(delta));
    if (!Number.isFinite(amount) || amount === 0) {
      setMessage("Enter a non-zero whole-day adjustment.");
      return;
    }
    startTransition(async () => {
      const result = await adjustLeaveBalance({
        balanceId: bal.id,
        delta: amount,
        reason,
        field: effectiveAdjustField,
      });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setDelta("");
      setReason("");
      setMessage(
        effectiveAdjustField === "carried_forward"
          ? "Carried over days updated."
          : "Adjustment saved.",
      );
      router.refresh();
    });
  }

  function beginEditAdjustment(a: HrLeaveBalanceAdjustment) {
    setEditingAdjustmentId(a.id);
    setEditAdjNewValue(String(Math.round(a.new_value)));
    setEditAdjReason(a.reason);
    setEditAdjMessage(null);
  }

  function cancelEditAdjustment() {
    setEditingAdjustmentId(null);
    setEditAdjNewValue("");
    setEditAdjReason("");
    setEditAdjMessage(null);
  }

  function saveEditAdjustment(a: HrLeaveBalanceAdjustment) {
    setEditAdjMessage(null);
    const nextValue = Math.round(Number(editAdjNewValue));
    if (!Number.isFinite(nextValue)) {
      setEditAdjMessage("Enter a whole number of days.");
      return;
    }
    if (!editAdjReason.trim()) {
      setEditAdjMessage("A reason is required.");
      return;
    }
    startEditAdjTransition(async () => {
      const result = await updateLeaveBalanceAdjustment({
        adjustmentId: a.id,
        newValue: nextValue,
        reason: editAdjReason,
      });
      if (result.error) {
        setEditAdjMessage(result.error);
        return;
      }
      cancelEditAdjustment();
      toast.saved("Adjustment updated.");
      router.refresh();
    });
  }

  function openPhCredits() {
    setPhCredits([]);
    setPhCreditsError(null);
    setPhCreditsOpen(true);
    startPhCredits(async () => {
      const result = await getStaffPhReplacementCredits({
        staffId: staff.id,
        leaveYear: year,
      });
      if (result.error) {
        setPhCreditsError(result.error);
        return;
      }
      setPhCredits(result.credits);
    });
  }

  function openAllowanceDetails(
    code: string,
    field: AllowanceDetailsField,
  ) {
    setAllowanceDetailsCode(code);
    setAllowanceDetailsField(field);
    setAllowanceDetailsDays(null);
    setAllowanceDetailsError(null);
    setAllowanceDetailsOpen(true);
    startAllowanceDetails(async () => {
      const result = await getStaffAllowanceDetails({
        staffId: staff.id,
        leaveYear: year,
        leaveTypeCode: code,
      });
      if (result.error) {
        setAllowanceDetailsError(result.error);
        return;
      }
      setAllowanceDetailsDays({
        used: result.used,
        scheduled: result.scheduled,
        pending: result.pending,
      });
    });
  }

  function runDeleteAdjustment(a: HrLeaveBalanceAdjustment) {
    const change = a.new_value - a.previous_value;
    const ok = window.confirm(
      `Delete this ${a.field} adjustment (${change > 0 ? "+" : ""}${fmt(change)})? The live balance will be reversed.`,
    );
    if (!ok) return;
    startEditAdjTransition(async () => {
      const result = await deleteLeaveBalanceAdjustment({
        adjustmentId: a.id,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (editingAdjustmentId === a.id) cancelEditAdjustment();
      toast.saved("Adjustment deleted.");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-[83.333%] space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-black/55 hover:text-[#3D421F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all employees
      </button>

      <div className="flex items-start gap-4 rounded-xl border border-black/10 bg-white p-4 shadow-sm sm:gap-5 sm:p-5">
        <div className="shrink-0">
          <StaffPhotoThumbnail
            fullName={staff.full_name}
            photoUrl={staff.photo_url}
            className="h-20 w-16 rounded-lg border-0 sm:h-24 sm:w-20"
            size="fill"
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
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-2xl text-[#3D421F]">
            {staff.full_name}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-black/55">
            <StaffDirectoryLink staffId={staff.id} empNo={staff.emp_no} />
            {staff.department?.name ? (
              <>
                <span className="mx-1.5 text-black/25">·</span>
                {staff.department.name}
              </>
            ) : null}
            {joinedLabel ? (
              <>
                <span className="mx-1.5 text-black/25">·</span>
                Joined {joinedLabel}
              </>
            ) : null}
            {terminatedLabel ? (
              <>
                <span className="mx-1.5 text-black/25">·</span>
                Terminated {terminatedLabel}
              </>
            ) : null}
            {staff.probation_status ? (
              <>
                <span className="mx-1.5 text-black/25">·</span>
                Probation: {staff.probation_status}
              </>
            ) : null}
            <span className="mx-1.5 text-black/25">·</span>
            Year {year}
          </p>
          {staff.employment_status?.name || staff.working_status?.name ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {staff.employment_status?.name ? (
                <StatusBadge status={staff.employment_status.name} />
              ) : null}
              {staff.working_status?.name ? (
                <WorkingStatusBadge status={staff.working_status.name} />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {annualLeaveCalculation ? (
        <AnnualLeaveCalculationCard calculation={annualLeaveCalculation} />
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg text-[#3D421F]">
              Current balances
            </h3>
            <p className="mt-1 text-sm text-black/55">
              Remaining days in olive, days already taken in dark. Click sick or
              maternity for pay stages.
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-wider">
            <span className="inline-flex items-center gap-1.5 text-black/45">
              <span
                className="inline-block h-2 w-2 rounded-full bg-[var(--venue-secondary,#F0F3DD)] ring-1 ring-black/15"
                aria-hidden
              />
              Eligible
            </span>
            <span className="inline-flex items-center gap-1.5 text-[var(--venue-primary,#818a40)]">
              <span
                className="inline-block h-2 w-2 rounded-full bg-[var(--venue-primary,#818a40)]"
                aria-hidden
              />
              Left
            </span>
            <span className="inline-flex items-center gap-1.5 text-[#3D421F]">
              <span
                className="inline-block h-2 w-2 rounded-full bg-[#3D421F]"
                aria-hidden
              />
              Taken
            </span>
          </div>
        </div>
        <div className="mt-4 space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {renderRingSlots(
              PRIMARY_RING_SLOTS,
              byCode,
              policy,
              expandedGroup,
              setExpandedGroup,
            )}
          </div>

          <div className="space-y-4">
            <div className="flex justify-center">
              <button
                type="button"
                aria-expanded={showOtherLeave}
                onClick={() => setShowOtherLeave((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[#3D421F] shadow-sm transition",
                  "hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/40",
                  showOtherLeave && "border-[var(--venue-primary,#818a40)]/40 bg-[var(--venue-secondary,#F0F3DD)]/50",
                )}
              >
                Other Leave
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-black/45 transition-transform",
                    showOtherLeave && "rotate-180",
                  )}
                />
              </button>
            </div>
            {showOtherLeave ? (
              <div className="grid grid-cols-1 gap-3 border-t border-black/10 pt-6 sm:grid-cols-2 xl:grid-cols-4">
                {renderRingSlots(
                  SECONDARY_RING_SLOTS,
                  byCode,
                  policy,
                  expandedGroup,
                  setExpandedGroup,
                )}
              </div>
            ) : null}
          </div>
        </div>

        {popupGroup ? (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setExpandedGroup(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="leave-stages-title"
              className="w-full max-w-2xl rounded-xl border border-black/10 bg-white p-6 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-black/45">
                    {popupGroup.code}
                  </p>
                  <h2
                    id="leave-stages-title"
                    className="font-serif text-xl text-[#3D421F]"
                  >
                    {popupGroup.label} stages
                  </h2>
                  <p className="mt-1 text-sm text-black/55">
                    {popupTotals.available} left · {popupTotals.used} used
                    {popupTotals.total > 0
                      ? ` · ${popupTotals.total} total`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedGroup(null)}
                  className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/[0.04] hover:text-[#3D421F]"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {popupStages.map((row) => (
                  <LeaveBalanceRing
                    key={row.code}
                    code={row.code}
                    label={leaveTypeDisplayName(row.code, row.type)}
                    available={row.available}
                    used={row.used}
                    total={row.total}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-serif text-lg text-[#3D421F]">
              Allowances by kind
            </h3>
            <p className="mt-1 text-sm text-black/55">
              AL, PH, sick, and unpaid leave first. Other kinds stay hidden until
              you expand them.
            </p>
          </div>
          {otherAllowances.length > 0 ? (
            <button
              type="button"
              aria-expanded={showOtherAllowances}
              onClick={() => setShowOtherAllowances((v) => !v)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[#3D421F] shadow-sm transition",
                "hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/40",
                showOtherAllowances &&
                  "border-[var(--venue-primary,#818a40)]/40 bg-[var(--venue-secondary,#F0F3DD)]/50",
              )}
            >
              {showOtherAllowances
                ? "Hide other kinds"
                : `Show other kinds (${otherAllowances.length})`}
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-black/45 transition-transform",
                  showOtherAllowances && "rotate-180",
                )}
              />
            </button>
          ) : null}
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2 font-medium">Type</th>
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Statutory AL for this leave year from qualifying service (calendar days minus unpaid leave, ÷ 30). ≤6 months: 0. >6 and <12 months: months × 2. ≥12 months: 30 per completed year + pro-rata incomplete year."
                >
                  Entitled
                </th>
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Amount earned so far toward this year’s statutory entitlement. Matches Entitled: unpaid leave reduces qualifying service first, then the band is applied."
                >
                  Accrued
                </th>
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Days carried over from the previous leave year. Only AL and Public Holiday (PH-REPL) can carry. Auto-calculated from last year’s remaining balance (or joining-date estimate); HR can override below."
                >
                  Carried over
                </th>
                <th className="px-3 py-2 font-medium text-right">Adjusted</th>
                <th
                  className="border-l-2 border-r-2 border-black/20 px-3 py-2 font-medium text-right"
                  title="Working pool: Accrued + Carried over + Adjusted (for allowance types with no accrual, uses Entitled instead of Accrued)."
                >
                  Total
                </th>
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Days already taken (past) on the roster / approved usage. Click for dates."
                >
                  Used
                </th>
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Future leave days already marked on the roster (held against the balance). Click for dates."
                >
                  Scheduled
                </th>
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Leave request days waiting for approval (not on the roster yet). Click for dates."
                >
                  Pending
                </th>
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Remaining days: Total − Used − Scheduled − Pending. Click for the breakdown."
                >
                  Available
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {visibleAllowances.map((bal) => {
                const type = findLeaveType(policy, bal.leave_type_code);
                const isOther = !PRIMARY_ALLOWANCE_CODE_SET.has(
                  bal.leave_type_code,
                );
                const usageOnly = isUsageOnlyLeaveCode(bal.leave_type_code);
                const isCarryForwardType = canCarryForwardLeaveCode(
                  bal.leave_type_code,
                );
                const earnedPool =
                  bal.accrued > 0 || bal.entitled === 0
                    ? bal.accrued
                    : bal.entitled;
                const totalPool =
                  earnedPool + bal.carried_forward + bal.adjusted;
                return (
                  <tr
                    key={bal.id}
                    className={cn(
                      isCarryForwardType &&
                        "bg-[var(--venue-secondary,#F0F3DD)]/80",
                      !isCarryForwardType && isOther && "bg-black/[0.015]",
                    )}
                  >
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-black/45">
                        {bal.leave_type_code}
                      </span>
                      <span className="ml-2 text-[#3D421F]">
                        {leaveTypeDisplayName(bal.leave_type_code, type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {usageOnly ? (
                        "—"
                      ) : bal.leave_type_code === "PH-REPL" ? (
                        <EntitlementDatesLink
                          value={bal.entitled}
                          title="View public holiday dates that earned this credit"
                          onOpen={openPhCredits}
                        />
                      ) : (
                        fmt(bal.entitled)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {usageOnly ? (
                        "—"
                      ) : bal.leave_type_code === "PH-REPL" ? (
                        <EntitlementDatesLink
                          value={bal.accrued}
                          title="View public holiday dates that earned this credit"
                          onOpen={openPhCredits}
                        />
                      ) : (
                        fmt(bal.accrued)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {canCarryForwardLeaveCode(bal.leave_type_code)
                        ? fmt(bal.carried_forward)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(bal.adjusted)}
                    </td>
                    <td className="border-l-2 border-r-2 border-black/20 px-3 py-2 text-right tabular-nums font-medium">
                      {usageOnly ? "—" : fmt(totalPool)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <DaysLink
                        value={bal.used}
                        title="View days used"
                        onOpen={() =>
                          openAllowanceDetails(bal.leave_type_code, "used")
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <DaysLink
                        value={bal.scheduled}
                        title="View days scheduled"
                        onOpen={() =>
                          openAllowanceDetails(bal.leave_type_code, "scheduled")
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <DaysLink
                        value={bal.pending}
                        title="View pending request days"
                        onOpen={() =>
                          openAllowanceDetails(bal.leave_type_code, "pending")
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {usageOnly ? (
                        "—"
                      ) : (
                        <DaysLink
                          value={availableBalance(bal)}
                          title="View remaining days breakdown"
                          onOpen={() =>
                            openAllowanceDetails(
                              bal.leave_type_code,
                              "available",
                            )
                          }
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleAllowances.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-6 text-center text-sm text-black/45"
                  >
                    No AL / PH / SL balances for this year yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {canManage ? (
        <section>
          <button
            type="button"
            aria-expanded={showManualAdjustment}
            onClick={() => setShowManualAdjustment((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/40"
          >
            <h3 className="font-serif text-lg text-[#3D421F]">
              Manual adjustment
            </h3>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-black/45 transition-transform",
                showManualAdjustment && "rotate-180",
              )}
            />
          </button>
          <p className="mt-1 max-w-2xl text-sm text-black/55">
            Adjust the mid-year correction counter, or override carried-over
            days from last year (AL and Public Holiday only). A reason is
            required and kept in the audit history.
          </p>
          {showManualAdjustment ? (
            <Card className="mt-3 p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
            <div className="space-y-1.5 lg:col-span-3">
              <Label className="text-sm text-[#3D421F]">Leave type</Label>
              <select
                value={adjustCode}
                onChange={(e) => {
                  const next = e.target.value;
                  setAdjustCode(next);
                  if (
                    adjustField === "carried_forward" &&
                    !canCarryForwardLeaveCode(next)
                  ) {
                    setAdjustField("adjusted");
                  }
                }}
                className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
              >
                {[...primaryAllowances, ...otherAllowances].map((b) => {
                  const type = findLeaveType(policy, b.leave_type_code);
                  return (
                    <option key={b.id} value={b.leave_type_code}>
                      {b.leave_type_code}
                      {` — ${leaveTypeDisplayName(
                        b.leave_type_code,
                        type,
                      )}`}
                    </option>
                  );
                })}
              </select>
              <p className="text-xs text-black/45">
                {leaveTypeDisplayName(adjustCode, adjustType)}
              </p>
            </div>

            <div className="space-y-1.5 lg:col-span-3">
              <Label className="text-sm text-[#3D421F]">Apply to</Label>
              <select
                value={effectiveAdjustField}
                onChange={(e) =>
                  setAdjustField(
                    e.target.value === "carried_forward"
                      ? "carried_forward"
                      : "adjusted",
                  )
                }
                className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
              >
                <option value="adjusted">Adjusted (mid-year)</option>
                <option
                  value="carried_forward"
                  disabled={!adjustSupportsCarry}
                >
                  Carried over (from last year)
                </option>
              </select>
              <p className="text-xs text-black/45">
                {adjustSupportsCarry
                  ? "Carried over is the opening balance from last year."
                  : "This leave type cannot carry days between years."}
              </p>
            </div>

            <div className="space-y-1.5 lg:col-span-3">
              <Label className="text-sm text-[#3D421F]">Days (+/−)</Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Deduct one day"
                  onClick={() =>
                    setDelta((prev) => {
                      const n = Number(prev || 0) - 1;
                      return String(n);
                    })
                  }
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition hover:bg-black/[0.03]"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <Input
                  type="number"
                  step={1}
                  inputMode="numeric"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  placeholder="0"
                  className="h-10 min-w-[5.5rem] flex-1 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  aria-label="Add one day"
                  onClick={() =>
                    setDelta((prev) => {
                      const n = Number(prev || 0) + 1;
                      return String(n);
                    })
                  }
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition hover:bg-black/[0.03]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-black/45">
                Positive adds days; negative deducts.
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label className="text-sm text-[#3D421F]">Reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  effectiveAdjustField === "carried_forward"
                    ? "e.g. Opening balance from 2025 HR records"
                    : "e.g. HR correction after contract review"
                }
                className="h-10"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={pending || !reason.trim() || !delta.trim()}
              onClick={submitAdjust}
            >
              {pending
                ? "Saving…"
                : effectiveAdjustField === "carried_forward"
                  ? "Update carried over"
                  : "Apply adjustment"}
            </Button>
            {message ? (
              <p
                className={cn(
                  "text-sm",
                  message.toLowerCase().includes("saved") ||
                    message.toLowerCase().includes("updated")
                    ? "text-emerald-700"
                    : "text-amber-800",
                )}
              >
                {message}
              </p>
            ) : null}
          </div>

          {recentManualAdjustments.length > 0 ? (
            <div className="mt-5 border-t border-black/10 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                Recent adjustments
              </p>
              <ul className="mt-2 divide-y divide-black/5 rounded-lg border border-black/10 bg-white">
                {recentManualAdjustments.map((a) => {
                  const change = a.new_value - a.previous_value;
                  const isEditing = editingAdjustmentId === a.id;
                  if (isEditing) {
                    const previewChange =
                      Number.isFinite(Number(editAdjNewValue))
                        ? Math.round(Number(editAdjNewValue)) - a.previous_value
                        : change;
                    return (
                      <li key={a.id} className="space-y-2.5 px-3 py-2.5 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <span className="font-mono text-xs text-black/45">
                              {a.field}
                            </span>
                            <span className="mx-1.5 text-black/30">·</span>
                            <span className="tabular-nums text-[#3D421F]">
                              {fmt(a.previous_value)} →{" "}
                              {Number.isFinite(Number(editAdjNewValue))
                                ? fmt(Math.round(Number(editAdjNewValue)))
                                : "—"}
                            </span>
                            <span
                              className={cn(
                                "ml-2 tabular-nums text-xs font-medium",
                                previewChange > 0
                                  ? "text-emerald-700"
                                  : previewChange < 0
                                    ? "text-red-700"
                                    : "text-black/45",
                              )}
                            >
                              {previewChange > 0 ? "+" : ""}
                              {fmt(previewChange)}
                            </span>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-black/45">
                              By {a.author_name ?? "unknown user"}
                            </p>
                            <time className="text-xs text-black/40">
                              {formatAdjustmentWhen(a.created_at)}
                            </time>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-black/45">
                              New value
                            </Label>
                            <Input
                              type="number"
                              step={1}
                              inputMode="numeric"
                              value={editAdjNewValue}
                              onChange={(e) =>
                                setEditAdjNewValue(e.target.value)
                              }
                              className="h-9 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              disabled={editAdjPending}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-black/45">
                              Reason
                            </Label>
                            <Input
                              value={editAdjReason}
                              onChange={(e) => setEditAdjReason(e.target.value)}
                              className="h-9"
                              disabled={editAdjPending}
                            />
                          </div>
                          <div className="flex items-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              className="h-9"
                              disabled={
                                editAdjPending || !editAdjReason.trim()
                              }
                              onClick={() => saveEditAdjustment(a)}
                            >
                              {editAdjPending ? "Saving…" : "Save"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-9 text-[#3D421F]"
                              disabled={editAdjPending}
                              onClick={cancelEditAdjustment}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                        {editAdjMessage ? (
                          <p className="text-xs text-amber-800">
                            {editAdjMessage}
                          </p>
                        ) : null}
                      </li>
                    );
                  }
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm"
                    >
                      <div>
                        <span className="font-mono text-xs text-black/45">
                          {a.field}
                        </span>
                        <span className="mx-1.5 text-black/30">·</span>
                        <span className="tabular-nums text-[#3D421F]">
                          {fmt(a.previous_value)} → {fmt(a.new_value)}
                        </span>
                        <span
                          className={cn(
                            "ml-2 tabular-nums text-xs font-medium",
                            change > 0
                              ? "text-emerald-700"
                              : change < 0
                                ? "text-red-700"
                                : "text-black/45",
                          )}
                        >
                          {change > 0 ? "+" : ""}
                          {fmt(change)}
                        </span>
                        <p className="mt-0.5 text-black/55">{a.reason}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-xs text-black/45">
                            By {a.author_name ?? "unknown user"}
                          </p>
                          <time className="text-xs text-black/40">
                            {formatAdjustmentWhen(a.created_at)}
                          </time>
                        </div>
                        <button
                          type="button"
                          aria-label="Edit adjustment"
                          title="Edit adjustment"
                          onClick={() => beginEditAdjustment(a)}
                          disabled={editAdjPending || editingAdjustmentId != null}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-black/40 transition hover:bg-black/[0.04] hover:text-[#3D421F] disabled:opacity-40"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete adjustment"
                          title="Delete adjustment"
                          onClick={() => runDeleteAdjustment(a)}
                          disabled={editAdjPending || editingAdjustmentId != null}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-700/70 transition hover:bg-rose-50 hover:text-rose-800 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
            </Card>
          ) : null}
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-serif text-lg text-[#3D421F]">
                Scheduled leave
              </h3>
              {scheduledLeaveDays > 0 ? (
                <p className="text-sm text-black/50">
                  {scheduledLeaveDays} day{scheduledLeaveDays === 1 ? "" : "s"}{" "}
                  on roster · {year}
                </p>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-black/55">
              Leave days marked on this employee&apos;s schedule for {year}.
            </p>
          </div>
          <Link
            href={validationHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-[#3D421F] shadow-sm transition hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--venue-primary,#818a40)]/40"
          >
            Validation
            <ExternalLink className="h-3.5 w-3.5 text-black/45" />
          </Link>
        </div>
        {scheduledLeaves.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-black/15 bg-white/60 px-4 py-8 text-center">
            <p className="text-sm text-black/55">
              No leave days on the schedule for this year.
            </p>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-black/10 bg-white">
            <div
              className={cn(
                "grid min-w-[62rem] items-center gap-x-4 border-b border-black/10 bg-black/[0.02] px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-black/45",
                canManage
                  ? "grid-cols-[minmax(14rem,1.6fr)_5rem_6.5rem_8rem_10rem_10rem]"
                  : "grid-cols-[minmax(14rem,1.6fr)_5rem_6.5rem_8rem_10rem_3.5rem]",
              )}
            >
              <span>Leave</span>
              <span className="text-right">Days</span>
              <span className="text-right">Timing</span>
              <span className="text-right">Approval</span>
              <span className="text-right">Approved by</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="min-w-[62rem] divide-y divide-black/5">
              {scheduledLeaves.map((range) => {
                const label = labelByCode.get(range.labelCode);
                const name =
                  label?.name ?? scheduleLeaveDisplayName(range.labelCode);
                const timing = scheduledLeaveTimingStatus(
                  range.fromDate,
                  range.toDate,
                );
                const approvalStatus = range.approvalStatus ?? "scheduled";
                const rowKey = rangeActionKey(range);
                const rowBusy =
                  scheduleActionPending && scheduleActionKey === rowKey;
                const isApproved = approvalStatus === "approved";
                const isAbs = range.labelCode === "ABS";
                return (
                  <li
                    key={rowKey}
                    className={cn(
                      "grid items-center gap-x-4 px-4 py-3",
                      canManage
                        ? "grid-cols-[minmax(14rem,1.6fr)_5rem_6.5rem_8rem_10rem_10rem]"
                        : "grid-cols-[minmax(14rem,1.6fr)_5rem_6.5rem_8rem_10rem_3.5rem]",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="inline-flex min-w-[3.25rem] shrink-0 items-center justify-center rounded-md border px-2 py-1 font-mono text-xs font-medium"
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
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#3D421F]">
                          {name}
                        </p>
                        <p className="truncate text-xs text-black/50">
                          {formatLeaveRange(range.fromDate, range.toDate)}
                        </p>
                      </div>
                    </div>
                    <p className="whitespace-nowrap text-right tabular-nums text-sm text-black/55">
                      {range.days} day{range.days === 1 ? "" : "s"}
                    </p>
                    <div className="flex justify-end">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
                          timing.className,
                        )}
                      >
                        {timing.label}
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium",
                          approvalStatusStyle(approvalStatus),
                        )}
                        title={
                          range.approvalStatus === "approved"
                            ? "Approved for payroll (Validation or Leave)"
                            : range.requestId
                              ? "Matched leave request"
                              : "On roster with no leave request"
                        }
                      >
                        {leaveCalendarStatusLabel(approvalStatus)}
                      </span>
                    </div>
                    <div className="min-w-0 text-right">
                      {isApproved &&
                      (range.approvedByName || range.approvedAt) ? (
                        <>
                          <p className="truncate text-xs text-black/55">
                            {range.approvedByName ?? "Unknown user"}
                          </p>
                          {range.approvedAt ? (
                            <time className="text-xs text-black/40">
                              {formatAdjustmentWhen(range.approvedAt)}
                            </time>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs text-black/30">—</span>
                      )}
                    </div>
                    <div className="flex flex-nowrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActivityLeave(range)}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition hover:bg-black/[0.03]"
                        aria-label="Activity"
                        title="Activity history"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            disabled={rowBusy || scheduleActionPending}
                            onClick={() => runDeleteLeave(range)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-800 transition hover:bg-rose-100 disabled:opacity-50"
                            aria-label="Delete"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={rowBusy || scheduleActionPending}
                            onClick={() =>
                              setEditingLeave(
                                scheduledRangeToEvent(range, staff),
                              )
                            }
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition hover:bg-black/[0.03] disabled:opacity-50"
                            aria-label="Edit"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={
                              rowBusy ||
                              scheduleActionPending ||
                              isApproved
                            }
                            onClick={() => runApproveLeave(range)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
                            aria-label={
                              isApproved ? "Already approved" : "Approve"
                            }
                            title={
                              isApproved
                                ? "Already approved"
                                : isAbs
                                  ? "Approve absence for payroll"
                                  : "Approve"
                            }
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h3 className="font-serif text-lg text-[#3D421F]">Leave requests</h3>
        <div className="mt-3 rounded-xl border border-dashed border-black/15 bg-white/60 px-4 py-8 text-center">
          <p className="text-sm text-black/55">
            Leave requests for this employee will appear here.
          </p>
          <p className="mt-1 text-xs text-black/40">
            Create, approve, and cancel flows will be added in a later step.
          </p>
        </div>
      </section>

      <LeaveCalendarDialog
        key={editingLeave?.id ?? "leave-edit-closed"}
        open={Boolean(editingLeave)}
        event={editingLeave}
        leaveTypes={leaveTypeOptions}
        canManage={canManage}
        terminationDate={staff.termination_date}
        onClose={() => setEditingLeave(null)}
      />
      {activityLeave ? (
        <LeaveActivityDialog
          staffId={staff.id}
          staffName={staff.full_name}
          labelCode={activityLeave.labelCode}
          fromDate={activityLeave.fromDate}
          toDate={activityLeave.toDate}
          requestId={activityLeave.requestId}
          onClose={() => setActivityLeave(null)}
        />
      ) : null}

      {phCreditsOpen ? (
        <PhReplacementCreditsDialog
          year={year}
          staffName={staff.full_name}
          empNo={staff.emp_no}
          credits={phCredits}
          pending={phCreditsPending}
          error={phCreditsError}
          onClose={() => setPhCreditsOpen(false)}
        />
      ) : null}

      {allowanceDetailsOpen ? (
        <AllowanceDaysDialog
          year={year}
          staffName={staff.full_name}
          empNo={staff.emp_no}
          leaveTypeCode={allowanceDetailsCode}
          leaveTypeName={leaveTypeDisplayName(
            allowanceDetailsCode,
            findLeaveType(policy, allowanceDetailsCode),
          )}
          field={allowanceDetailsField}
          balance={byCode.get(allowanceDetailsCode) ?? null}
          days={allowanceDetailsDays}
          pending={allowanceDetailsPending}
          error={allowanceDetailsError}
          onClose={() => setAllowanceDetailsOpen(false)}
        />
      ) : null}
    </div>
  );
}

function DaysLink({
  value,
  title,
  onOpen,
}: {
  value: number;
  title: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded px-1 py-0.5 tabular-nums underline-offset-2 transition",
        "text-[var(--venue-primary,#818a40)] hover:bg-[var(--venue-secondary,#F0F3DD)] hover:underline",
      )}
      title={title}
      onClick={onOpen}
    >
      {fmt(value)}
    </button>
  );
}

function EntitlementDatesLink({
  value,
  title,
  onOpen,
}: {
  value: number;
  title: string;
  onOpen: () => void;
}) {
  return <DaysLink value={value} title={title} onOpen={onOpen} />;
}

function allowanceFieldCopy(field: AllowanceDetailsField): {
  title: string;
  description: string;
} {
  switch (field) {
    case "used":
      return {
        title: "Days used",
        description: "Roster days already taken (before today).",
      };
    case "scheduled":
      return {
        title: "Days scheduled",
        description: "Roster days from today onward, held against this balance.",
      };
    case "pending":
      return {
        title: "Days pending",
        description:
          "Leave request days waiting for approval and not yet on the roster.",
      };
    case "available":
      return {
        title: "Remaining days",
        description:
          "Total minus used, scheduled, and pending. Dates below are what has already been taken or held.",
      };
  }
}

function AllowanceDayList({
  days,
  emptyLabel,
}: {
  days: LeaveUsageDayEntry[];
  emptyLabel: string;
}) {
  if (days.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-black/15 bg-black/[0.02] px-3 py-5 text-center text-sm text-black/45">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="max-h-56 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/10">
      {days.map((day) => (
        <li
          key={`${day.date}:${day.labelCode}:${day.detail ?? ""}`}
          className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium text-[#3D421F]">
              {formatDayMonthYear(day.date) ?? day.date}
            </p>
            {day.detail ? (
              <p className="truncate text-xs text-black/50">{day.detail}</p>
            ) : null}
          </div>
          <span className="shrink-0 font-mono text-[11px] text-black/40">
            {day.labelCode}
          </span>
        </li>
      ))}
    </ul>
  );
}

function BreakdownRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 text-sm",
        emphasize && "border-t border-black/10 pt-2 font-medium",
      )}
    >
      <p className="text-[#3D421F]">{label}</p>
      <p className="tabular-nums text-[#3D421F]">{value}</p>
    </div>
  );
}

function AllowanceDaysDialog({
  year,
  staffName,
  empNo,
  leaveTypeCode,
  leaveTypeName,
  field,
  balance,
  days,
  pending,
  error,
  onClose,
}: {
  year: number;
  staffName: string;
  empNo: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  field: AllowanceDetailsField;
  balance: HrLeaveBalance | null;
  days: {
    used: LeaveUsageDayEntry[];
    scheduled: LeaveUsageDayEntry[];
    pending: LeaveUsageDayEntry[];
  } | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = allowanceFieldCopy(field);
  const earnedPool =
    balance && (balance.accrued > 0 || balance.entitled === 0)
      ? balance.accrued
      : (balance?.entitled ?? 0);
  const totalPool = balance
    ? earnedPool + balance.carried_forward + balance.adjusted
    : 0;
  const visibleDays =
    field === "used"
      ? (days?.used ?? [])
      : field === "scheduled"
        ? (days?.scheduled ?? [])
        : field === "pending"
          ? (days?.pending ?? [])
          : null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="allowance-days-title"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-black/10 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-black/45">
              {leaveTypeCode} · {year}
            </p>
            <h2
              id="allowance-days-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {copy.title}
            </h2>
            <p className="mt-1 truncate text-sm text-black/55">
              {leaveTypeName} · {staffName}{" "}
              <span className="font-mono text-xs">({empNo})</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/[0.04] hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-black/55">{copy.description}</p>

        {pending ? (
          <p className="mt-4 text-sm text-black/45">Loading…</p>
        ) : error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900/85">
            {error}
          </p>
        ) : field === "available" && balance ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-2 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-3">
              <BreakdownRow
                label={
                  balance.accrued > 0 || balance.entitled === 0
                    ? "Accrued"
                    : "Entitled"
                }
                value={fmt(earnedPool)}
              />
              <BreakdownRow
                label="Carried over"
                value={fmt(balance.carried_forward)}
              />
              <BreakdownRow label="Adjusted" value={fmt(balance.adjusted)} />
              <BreakdownRow
                label="Total"
                value={fmt(totalPool)}
                emphasize
              />
              <BreakdownRow
                label="Used"
                value={balance.used === 0 ? fmt(0) : `−${fmt(balance.used)}`}
              />
              <BreakdownRow
                label="Scheduled"
                value={
                  balance.scheduled === 0
                    ? fmt(0)
                    : `−${fmt(balance.scheduled)}`
                }
              />
              <BreakdownRow
                label="Pending"
                value={
                  balance.pending === 0 ? fmt(0) : `−${fmt(balance.pending)}`
                }
              />
              {balance.expired !== 0 ? (
                <BreakdownRow
                  label="Expired"
                  value={`−${fmt(Math.abs(balance.expired))}`}
                />
              ) : null}
              <BreakdownRow
                label="Available"
                value={fmt(availableBalance(balance))}
                emphasize
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                Used ({days?.used.length ?? 0})
              </p>
              <AllowanceDayList
                days={days?.used ?? []}
                emptyLabel={`No used days in ${year}.`}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                Scheduled ({days?.scheduled.length ?? 0})
              </p>
              <AllowanceDayList
                days={days?.scheduled ?? []}
                emptyLabel={`No scheduled days in ${year}.`}
              />
            </div>
            {(days?.pending.length ?? 0) > 0 || balance.pending > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                  Pending ({days?.pending.length ?? 0})
                </p>
                <AllowanceDayList
                  days={days?.pending ?? []}
                  emptyLabel={`No pending request days in ${year}.`}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4">
            <AllowanceDayList
              days={visibleDays ?? []}
              emptyLabel={`No matching days in ${year}.`}
            />
            {!pending && !error ? (
              <p className="mt-3 text-xs tabular-nums text-black/45">
                {(visibleDays ?? []).length} day
                {(visibleDays ?? []).length === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function PhReplacementCreditsDialog({
  year,
  staffName,
  empNo,
  credits,
  pending,
  error,
  onClose,
}: {
  year: number;
  staffName: string;
  empNo: string;
  credits: PhReplacementCreditEntry[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ph-credits-title"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-black/45">PH-REPL · {year}</p>
            <h2
              id="ph-credits-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              Public holiday credits
            </h2>
            <p className="mt-1 truncate text-sm text-black/55">
              {staffName}{" "}
              <span className="font-mono text-xs">({empNo})</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-black/45 transition-colors hover:bg-black/[0.04] hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-black/55">
          Dates this employee worked a public holiday after joining. Future
          rostered holidays do not count until the day is worked.
        </p>

        {pending ? (
          <p className="mt-4 text-sm text-black/45">Loading…</p>
        ) : error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900/85">
            {error}
          </p>
        ) : credits.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-black/15 bg-black/[0.02] px-3 py-6 text-center text-sm text-black/45">
            No PH replacement credits earned in {year}.
          </p>
        ) : (
          <ul className="mt-4 max-h-72 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/10">
            {credits.map((credit) => (
              <li
                key={credit.date}
                className="flex items-baseline justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[#3D421F]">
                    {formatDayMonthYear(credit.date) ?? credit.date}
                  </p>
                  <p className="truncate text-xs text-black/50">
                    {credit.holidayName?.trim() || "Public holiday"}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-black/40">
                  {credit.labelCode}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!pending && !error ? (
          <p className="mt-3 text-xs tabular-nums text-black/45">
            {credits.length} credit{credits.length === 1 ? "" : "s"} · one day
            per public holiday worked
          </p>
        ) : null}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return formatLeaveDays(n);
}

function formatAdjustmentWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}
