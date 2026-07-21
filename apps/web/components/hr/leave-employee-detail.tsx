"use client";

import { useState, useTransition } from "react";
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
import { LeaveActivityDialog } from "@/components/hr/leave-activity-dialog";
import { LeaveBalanceRing } from "@/components/hr/leave-balance-ring";
import { LeaveCalendarDialog } from "@/components/hr/leave-calendar-dialog";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  adjustLeaveBalance,
  approveLeaveCalendarEntry,
  rejectLeaveCalendarEntry,
} from "@/lib/actions/hr-leave";
import {
  availableBalance,
  canCarryForwardLeaveCode,
  findLeaveType,
  isUsageOnlyLeaveCode,
  leaveCalendarStatusLabel,
  leaveTypeDisplayName,
  scheduleLeaveDisplayName,
  type LeaveCalendarEvent,
  type LeaveCalendarStatus,
  type ScheduledLeaveLabelStyle,
  type ScheduledLeaveRange,
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
    department: { name: string } | null;
  };
  balances: HrLeaveBalance[];
  adjustments: HrLeaveBalanceAdjustment[];
  scheduledLeaves: ScheduledLeaveRange[];
  scheduleLabels: ScheduledLeaveLabelStyle[];
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
): { available: number; used: number; total: number } {
  const available = bal ? availableBalance(bal) : 0;
  const used = bal?.used ?? 0;
  const pool =
    (bal?.accrued ?? 0) + (bal?.carried_forward ?? 0) + (bal?.adjusted ?? 0);
  const entitled = bal?.entitled ?? 0;
  // Prefer the working pool; fall back to statutory entitled when pool is empty.
  const total = pool > 0 ? pool : Math.max(entitled, available + used);
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
      const { available, used, total } = ringMetrics(bal);
      return (
        <LeaveBalanceRing
          key={code}
          code={code}
          label={leaveTypeDisplayName(code, type)}
          available={available}
          used={used}
          total={total > 0 ? total : undefined}
        />
      );
    }

    const { group } = slot;
    const stageRows = group.stages.map((code) => {
      const bal = byCode.get(code);
      const type = findLeaveType(policy, code);
      const metrics = ringMetrics(bal);
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
        total={total > 0 ? total : undefined}
        expanded={isOpen}
        hint="Click for stages"
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

  const byCode = new Map(balances.map((b) => [b.leave_type_code, b]));
  const labelByCode = new Map(scheduleLabels.map((l) => [l.code, l]));
  const scheduledLeaveDays = scheduledLeaves.reduce((sum, r) => sum + r.days, 0);
  const joinedLabel = formatDayMonthYear(staff.joining_date);
  const terminatedLabel = formatDayMonthYear(staff.termination_date);
  const adjustBalance = byCode.get(adjustCode);
  const adjustType = findLeaveType(policy, adjustCode);
  const adjustSupportsCarry = canCarryForwardLeaveCode(adjustCode);
  const effectiveAdjustField =
    adjustField === "carried_forward" && !adjustSupportsCarry
      ? "adjusted"
      : adjustField;
  const adjustAvailable = adjustBalance
    ? availableBalance(adjustBalance)
    : null;
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
        const metrics = ringMetrics(bal);
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
    const amount = Number(delta);
    if (!Number.isFinite(amount) || amount === 0) {
      setMessage("Enter a non-zero adjustment.");
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

  return (
    <div className="mx-auto w-full max-w-[66.666%] space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-black/55 hover:text-[#3D421F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to all employees
      </button>

      <div className="flex items-stretch gap-4 rounded-xl border border-black/10 bg-white p-4 shadow-sm sm:gap-5 sm:p-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-2xl text-[#3D421F]">
            {staff.full_name}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-black/55">
            <span className="font-mono text-xs text-black/45">
              {staff.emp_no}
            </span>
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
        </div>
        <div className="shrink-0 self-center">
          {staff.photo_url ? (
            <img
              src={staff.photo_url}
              alt={staff.full_name}
              className="h-20 w-16 rounded-lg border border-black/10 object-cover sm:h-24 sm:w-20"
            />
          ) : (
            <div
              className="flex h-20 w-16 items-center justify-center rounded-lg border border-dashed border-black/15 bg-black/[0.03] text-xs text-black/35 sm:h-24 sm:w-20"
              aria-hidden
            >
              No photo
            </div>
          )}
        </div>
      </div>

      <section>
        <h3 className="font-serif text-lg text-[#3D421F]">Current balances</h3>
        <p className="mt-1 text-sm text-black/55">
          Thick ring = entitlement. Amber = days taken, green = days left.
          Click sick or maternity for pay stages.
        </p>
        <div className="mt-4 space-y-6">
          <div className="flex flex-wrap justify-center gap-6">
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
              <div className="flex flex-wrap justify-center gap-6 border-t border-black/10 pt-6">
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
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
                {popupStages.map((row) => (
                  <LeaveBalanceRing
                    key={row.code}
                    code={row.code}
                    label={leaveTypeDisplayName(row.code, row.type)}
                    available={row.available}
                    used={row.used}
                    total={row.total > 0 ? row.total : undefined}
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
                  title="Statutory total for this leave year (policy × service). Under 1 year: months × days-per-month. From 1 year with no termination: full annual days (e.g. 30)."
                >
                  Entitled
                </th>
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Amount earned so far toward the entitled total. Under 1 year of service this matches Entitled; after 1 year it grows month by month (e.g. 2.5/month toward 30)."
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
                  title="Days already taken (past) on the roster / approved usage."
                >
                  Used
                </th>
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Future leave days already marked on the roster (held against the balance)."
                >
                  Scheduled
                </th>
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Leave request days waiting for approval (not on the roster yet)."
                >
                  Pending
                </th>
                <th className="px-3 py-2 font-medium text-right">Available</th>
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
                      {usageOnly ? "—" : fmt(bal.entitled)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {usageOnly ? "—" : fmt(bal.accrued)}
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
                      {fmt(bal.used)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(bal.scheduled)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(bal.pending)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {usageOnly ? "—" : fmt(availableBalance(bal))}
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
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg text-[#3D421F]">
                Manual adjustment
              </h3>
              <p className="mt-1 text-sm text-black/55">
                Adjust the mid-year correction counter, or override carried-over
                days from last year (AL and Public Holiday only). A reason is
                required and kept in the audit history.
              </p>
            </div>
            {adjustBalance && adjustAvailable != null ? (
              <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-right">
                <p className="text-[11px] uppercase tracking-wide text-black/45">
                  {adjustCode} available
                </p>
                <p className="font-serif text-xl tabular-nums text-[#3D421F]">
                  {fmt(adjustAvailable)}
                  <span className="ml-1 text-sm font-sans text-black/45">
                    days
                  </span>
                </p>
                <p className="text-xs text-black/45">
                  Adjusted: {fmt(adjustBalance.adjusted)}
                  {adjustSupportsCarry ? (
                    <>
                      {" "}
                      · Carried over: {fmt(adjustBalance.carried_forward)}
                    </>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
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
                  step={0.5}
                  inputMode="decimal"
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

          {adjustments.length > 0 ? (
            <div className="mt-5 border-t border-black/10 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                Recent adjustments
              </p>
              <ul className="mt-2 divide-y divide-black/5 rounded-lg border border-black/10 bg-white">
                {adjustments.slice(0, 8).map((a) => {
                  const change = a.new_value - a.previous_value;
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-sm"
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
                      <time className="text-xs text-black/40">
                        {formatAdjustmentWhen(a.created_at)}
                      </time>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Card>
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
                "grid min-w-[52rem] items-center gap-x-4 border-b border-black/10 bg-black/[0.02] px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-black/45",
                canManage
                  ? "grid-cols-[minmax(14rem,1.6fr)_5rem_6.5rem_8rem_10rem]"
                  : "grid-cols-[minmax(14rem,1.6fr)_5rem_6.5rem_8rem_3.5rem]",
              )}
            >
              <span>Leave</span>
              <span className="text-right">Days</span>
              <span className="text-right">Timing</span>
              <span className="text-right">Approval</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="min-w-[52rem] divide-y divide-black/5">
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
                        ? "grid-cols-[minmax(14rem,1.6fr)_5rem_6.5rem_8rem_10rem]"
                        : "grid-cols-[minmax(14rem,1.6fr)_5rem_6.5rem_8rem_3.5rem]",
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
                          {!isAbs ? (
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
                          ) : null}
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
    </div>
  );
}

function fmt(n: number): string {
  return String(Math.round(Number(n) || 0));
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
