"use client";

import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mail,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { SalesImportProgressBar } from "@/components/sales/sales-import-progress-bar";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import {
  approvePayrollStep,
  emailPayrollExport,
  enterPaymentProcessing,
  reopenPayrollRun,
  requestPayrollApproval,
  type PendingPayrollApproval,
  type PayrollApproverCandidate,
} from "@/lib/actions/hr-payroll-approvals";
import {
  exportPayrollGl,
  generateWpsFile,
  markPayrollPaid,
  recalculatePayrollRun,
  type PayrollActionResult,
  type PayrollCsvResult,
} from "@/lib/actions/hr-payroll";
import type { HrPayrollApprovalsSettings } from "@/lib/hr/types";
import { HR_SETTINGS_PAY_APPROVALS_HREF } from "@/lib/hr/settings-nav";
import type { PayrollStatus } from "@/lib/hr/payroll";
import { isPayrollLocked } from "@/lib/hr/payroll";
import { downloadBase64File, downloadTextFile } from "@/lib/sales/vouchers-export";
import { cn } from "@/lib/utils";

export type WorkflowStepId =
  | "attendance"
  | "import_benefits"
  | "import_deductions"
  | "recalculate"
  | "hr_review"
  | "final_approval"
  | "payment_processing"
  | "paid_locked";

type StepState = "complete" | "current" | "pending" | "future";

type AuditEvent = {
  id: string;
  from_status: string | null;
  to_status: string;
  comment: string | null;
  created_at: string;
  actor_id?: string | null;
  actor_name?: string | null;
};

type StepAttribution = {
  at: string | null;
  by: string | null;
};

type PayrollWorkflowStepperProps = {
  runId: string;
  runStatus: PayrollStatus | string;
  attendanceHref: string;
  canEdit: boolean;
  currentUserId: string | null;
  approvalsSettings: HrPayrollApprovalsSettings;
  approvalCandidates: PayrollApproverCandidate[];
  pendingApprovals: PendingPayrollApproval[];
  userNames?: Record<string, string>;
  attendanceComplete: boolean;
  benefitsImported: boolean;
  deductionsImported: boolean;
  hasRecalculated: boolean;
  events: AuditEvent[];
  onOpenImportBenefits: () => void;
  onOpenImportDeductions: () => void;
  onMessage: (message: string | null) => void;
  onRefresh: () => void;
};

const STEP_DEFS: { id: WorkflowStepId; label: string }[] = [
  { id: "attendance", label: "Attendance" },
  { id: "import_benefits", label: "Import Benefits" },
  { id: "import_deductions", label: "Import Deductions" },
  { id: "recalculate", label: "Recalculate" },
  { id: "hr_review", label: "HR Review" },
  { id: "final_approval", label: "Final Approval" },
  { id: "payment_processing", label: "Payment Processing" },
  { id: "paid_locked", label: "Paid / Locked" },
];

function statusRank(status: string): number {
  const order = [
    "draft",
    "attendance_validated",
    "hr_review",
    "finance_review",
    "final_approval",
    "payment_processing",
    "paid",
    "locked",
  ];
  const idx = order.indexOf(status);
  return idx < 0 ? 0 : idx;
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-AE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fromEvent(
  event: AuditEvent | null | undefined,
  resolveName?: (userId: string) => string | null,
): StepAttribution {
  if (!event) return { at: null, by: null };
  const by =
    event.actor_name?.trim() ||
    (event.actor_id && resolveName
      ? resolveName(event.actor_id)
      : null) ||
    null;
  return {
    at: event.created_at,
    by,
  };
}

function findLatestEvent(
  events: AuditEvent[],
  predicate: (event: AuditEvent) => boolean,
): AuditEvent | null {
  return events.find(predicate) ?? null;
}

const EMAIL_SEND_STEPS = [
  "Building payroll package",
  "Connecting to mail server",
  "Delivering to recipients",
  "Saving copy to Sent",
] as const;

function ModalShell({
  title,
  onClose,
  children,
  footer,
  closeDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeDisabled?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        disabled={closeDisabled}
        onClick={() => {
          if (!closeDisabled) onClose();
        }}
      />
      <div className="relative z-10 flex max-h-[min(90vh,40rem)] w-full max-w-md flex-col rounded-xl border border-black/10 bg-white p-5 shadow-lg">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <h3 className="font-serif text-lg text-[#3D421F]">{title}</h3>
          <button
            type="button"
            className="text-sm text-black/45 hover:text-[#3D421F] disabled:opacity-40"
            disabled={closeDisabled}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="mt-4 shrink-0 border-t border-black/10 pt-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function PayrollWorkflowStepper({
  runId,
  runStatus,
  attendanceHref,
  canEdit,
  currentUserId,
  approvalsSettings,
  approvalCandidates,
  pendingApprovals,
  userNames = {},
  attendanceComplete,
  benefitsImported,
  deductionsImported,
  hasRecalculated,
  events,
  onOpenImportBenefits,
  onOpenImportDeductions,
  onMessage,
  onRefresh,
}: PayrollWorkflowStepperProps) {
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    null | "hr_review" | "final_approval" | "payment" | "audit"
  >(null);
  const [selectedApprovers, setSelectedApprovers] = useState<Set<string>>(
    () => new Set(),
  );
  const [otherFile, setOtherFile] = useState<{
    filename: string;
    base64: string;
    contentType?: string;
  } | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [emailSend, setEmailSend] = useState<{
    phase: "idle" | "sending" | "success" | "error";
    stepIndex: number;
    error: string | null;
  }>({ phase: "idle", stepIndex: 0, error: null });

  useEffect(() => {
    if (dialog !== "audit") setConfirmReopen(false);
  }, [dialog]);

  useEffect(() => {
    if (!pending) setBusyLabel(null);
  }, [pending]);

  useEffect(() => {
    if (emailSend.phase !== "sending") return;
    const id = window.setInterval(() => {
      setEmailSend((prev) => {
        if (prev.phase !== "sending") return prev;
        if (prev.stepIndex >= EMAIL_SEND_STEPS.length - 1) return prev;
        return { ...prev, stepIndex: prev.stepIndex + 1 };
      });
    }, 900);
    return () => window.clearInterval(id);
  }, [emailSend.phase]);

  const pendingHr = pendingApprovals.find(
    (a) => a.step === "hr_review" && a.status === "pending",
  );
  const pendingFinal = pendingApprovals.find(
    (a) => a.step === "final_approval" && a.status === "pending",
  );
  const approvedHr = pendingApprovals.find(
    (a) => a.step === "hr_review" && a.status === "approved",
  );
  const approvedFinal = pendingApprovals.find(
    (a) => a.step === "final_approval" && a.status === "approved",
  );

  const rank = statusRank(runStatus);
  const locked = isPayrollLocked(runStatus);
  const hrDone = rank >= statusRank("hr_review") || Boolean(approvedHr);
  const finalDone =
    rank >= statusRank("final_approval") || Boolean(approvedFinal);
  const paymentDone = rank >= statusRank("payment_processing");
  const paidDone = locked;

  const nameById = useMemo(() => {
    const map = new Map<string, string>(Object.entries(userNames));
    for (const c of approvalCandidates) map.set(c.id, c.fullName);
    return map;
  }, [approvalCandidates, userNames]);

  const stepMeta = useMemo(() => {
    function namesFor(ids: string[]): string {
      return ids.map((id) => nameById.get(id) ?? "User").join(", ");
    }

    const attendanceState: StepState = attendanceComplete
      ? "complete"
      : "current";
    const benefitsState: StepState = !attendanceComplete
      ? "future"
      : benefitsImported
        ? "complete"
        : "current";
    const deductionsState: StepState = !attendanceComplete
      ? "future"
      : deductionsImported
        ? "complete"
        : "current";
    const recalcState: StepState =
      !attendanceComplete
        ? "future"
        : hasRecalculated
          ? "complete"
          : "current";
    const hrState: StepState = hrDone
      ? "complete"
      : pendingHr
        ? "pending"
        : attendanceComplete && hasRecalculated
          ? "current"
          : "future";
    const finalState: StepState = finalDone
      ? "complete"
      : pendingFinal
        ? "pending"
        : hrDone
          ? "current"
          : "future";
    const paymentState: StepState = paymentDone
      ? "complete"
      : finalDone
        ? "current"
        : "future";
    const paidState: StepState = paidDone
      ? "complete"
      : paymentDone
        ? "current"
        : "future";

    const attendanceEvent = findLatestEvent(
      events,
      (e) =>
        e.to_status === "attendance_validated" ||
        /attendance/i.test(e.comment ?? ""),
    );
    const benefitsEvent = findLatestEvent(events, (e) =>
      /benefits imported/i.test(e.comment ?? ""),
    );
    const deductionsEvent = findLatestEvent(events, (e) =>
      /deductions imported/i.test(e.comment ?? ""),
    );
    const recalcEvent = findLatestEvent(events, (e) =>
      /recalculat/i.test(e.comment ?? ""),
    );
    const hrEvent = findLatestEvent(
      events,
      (e) =>
        e.to_status === "hr_review" ||
        /hr review/i.test(e.comment ?? ""),
    );
    const finalEvent = findLatestEvent(
      events,
      (e) =>
        e.to_status === "final_approval" ||
        /final approval/i.test(e.comment ?? ""),
    );
    const emailSentEvent = findLatestEvent(events, (e) =>
      /email sent|documents emailed|payroll documents emailed/i.test(
        e.comment ?? "",
      ),
    );
    const exportGeneratedEvent = findLatestEvent(events, (e) =>
      /payroll export generated/i.test(e.comment ?? ""),
    );
    const paymentEnteredEvent = findLatestEvent(
      events,
      (e) =>
        e.to_status === "payment_processing" ||
        /entered payment/i.test(e.comment ?? ""),
    );
    const paidEvent = findLatestEvent(
      events,
      (e) => e.to_status === "paid" || e.to_status === "locked",
    );

    function resolveName(userId: string): string | null {
      return nameById.get(userId) ?? null;
    }

    function attributionFromApproval(
      approved: PendingPayrollApproval | undefined,
      pending: PendingPayrollApproval | undefined,
      statusEvent: AuditEvent | null,
      done: boolean,
    ): StepAttribution {
      if (done && approved?.approved_at) {
        return {
          at: approved.approved_at,
          by:
            resolveName(approved.approved_by ?? "") ??
            fromEvent(statusEvent, resolveName).by,
        };
      }
      if (pending?.requested_at) {
        return {
          at: pending.requested_at,
          by:
            resolveName(pending.requested_by ?? "") ??
            fromEvent(statusEvent, resolveName).by,
        };
      }
      return fromEvent(statusEvent, resolveName);
    }

    const comments: Record<WorkflowStepId, string> = {
      attendance: attendanceComplete
        ? "Attendance cleared for pay"
        : "Needs validation for this period",
      import_benefits: benefitsImported
        ? "Benefits imported"
        : "Optional — import when ready",
      import_deductions: deductionsImported
        ? "Deductions imported"
        : "Optional — uniform & other charges",
      recalculate: hasRecalculated
        ? "Synced from attendance, benefits & deductions"
        : "Resync values before review",
      hr_review: hrDone
        ? "Approved"
        : pendingHr
          ? `Pending · ${namesFor(pendingHr.approver_user_ids)}`
          : "Request approval",
      final_approval: finalDone
        ? "Approved"
        : pendingFinal
          ? `Pending · ${namesFor(pendingFinal.approver_user_ids)}`
          : "Request approval",
      payment_processing: emailSentEvent
        ? "Email sent"
        : exportGeneratedEvent
          ? "Export generated"
          : paymentDone
            ? "Ready for export / email"
            : "Export or email payroll documents",
      paid_locked: paidDone
        ? "Month complete"
        : "Mark paid and lock when finished",
    };

    const attribution: Record<WorkflowStepId, StepAttribution> = {
      attendance: fromEvent(attendanceEvent, resolveName),
      import_benefits: fromEvent(benefitsEvent, resolveName),
      import_deductions: fromEvent(deductionsEvent, resolveName),
      recalculate: fromEvent(recalcEvent, resolveName),
      hr_review: attributionFromApproval(
        approvedHr,
        pendingHr,
        hrEvent,
        hrDone,
      ),
      final_approval: attributionFromApproval(
        approvedFinal,
        pendingFinal,
        finalEvent,
        finalDone,
      ),
      payment_processing: fromEvent(
        emailSentEvent ?? exportGeneratedEvent ?? paymentEnteredEvent,
        resolveName,
      ),
      paid_locked: fromEvent(paidEvent, resolveName),
    };

    return {
      attendance: {
        state: attendanceState,
        comment: comments.attendance,
        ...attribution.attendance,
      },
      import_benefits: {
        state: benefitsState,
        comment: comments.import_benefits,
        ...attribution.import_benefits,
      },
      import_deductions: {
        state: deductionsState,
        comment: comments.import_deductions,
        ...attribution.import_deductions,
      },
      recalculate: {
        state: recalcState,
        comment: comments.recalculate,
        ...attribution.recalculate,
      },
      hr_review: {
        state: hrState,
        comment: comments.hr_review,
        ...attribution.hr_review,
      },
      final_approval: {
        state: finalState,
        comment: comments.final_approval,
        ...attribution.final_approval,
      },
      payment_processing: {
        state: paymentState,
        comment: comments.payment_processing,
        ...attribution.payment_processing,
      },
      paid_locked: {
        state: paidState,
        comment: comments.paid_locked,
        ...attribution.paid_locked,
      },
    };
  }, [
    attendanceComplete,
    benefitsImported,
    deductionsImported,
    hasRecalculated,
    hrDone,
    finalDone,
    paymentDone,
    paidDone,
    pendingHr,
    pendingFinal,
    approvedHr,
    approvedFinal,
    events,
    nameById,
  ]);

  function runAction(
    label: string,
    action: () => Promise<PayrollActionResult>,
  ) {
    onMessage(null);
    setBusyLabel(
      label === "Recalculate"
        ? "Recalculating payroll…"
        : label.endsWith("…")
          ? label
          : `${label}…`,
    );
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          onMessage(result.error);
          return;
        }
        onMessage(result.warning ?? `${label} complete`);
        setDialog(null);
        onRefresh();
      } catch (err) {
        onMessage(err instanceof Error ? err.message : `${label} failed`);
      }
    });
  }

  function sendPayrollEmail() {
    if (pending || emailSend.phase === "sending") return;
    onMessage(null);
    setEmailSend({ phase: "sending", stepIndex: 0, error: null });
    startTransition(async () => {
      try {
        const result = await emailPayrollExport(runId, otherFile);
        if (!result.ok) {
          setEmailSend({
            phase: "error",
            stepIndex: 0,
            error: result.error,
          });
          onMessage(result.error);
          return;
        }
        setEmailSend({
          phase: "success",
          stepIndex: EMAIL_SEND_STEPS.length - 1,
          error: null,
        });
        onMessage(result.warning ?? "Payroll email sent");
        onRefresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Email send failed";
        setEmailSend({ phase: "error", stepIndex: 0, error: message });
        onMessage(message);
      }
    });
  }

  function closePaymentDialog() {
    if (emailSend.phase === "sending") return;
    setEmailSend({ phase: "idle", stepIndex: 0, error: null });
    setDialog(null);
  }

  function downloadCsv(
    label: string,
    action: () => Promise<PayrollCsvResult>,
  ) {
    onMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          onMessage(result.error);
          return;
        }
        if (result.base64) {
          downloadBase64File(
            result.base64,
            result.filename,
            result.mimeType ??
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          );
        } else if (result.csv != null) {
          downloadTextFile(
            result.csv,
            result.filename,
            result.mimeType ?? "text/csv;charset=utf-8",
          );
        }
        onMessage(`${label} downloaded`);
        if (runStatus === "final_approval") {
          await enterPaymentProcessing(runId);
        }
        onRefresh();
      } catch (err) {
        onMessage(err instanceof Error ? err.message : `${label} failed`);
      }
    });
  }

  function openApprovalDialog(step: "hr_review" | "final_approval") {
    const pool =
      step === "hr_review"
        ? approvalsSettings.hrReviewApproverUserIds
        : approvalsSettings.finalApprovalApproverUserIds;
    setSelectedApprovers(new Set(pool));
    setDialog(step);
  }

  function toggleApprover(id: string) {
    setSelectedApprovers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function poolCandidates(step: "hr_review" | "final_approval") {
    const pool = new Set(
      step === "hr_review"
        ? approvalsSettings.hrReviewApproverUserIds
        : approvalsSettings.finalApprovalApproverUserIds,
    );
    return approvalCandidates.filter((c) => pool.has(c.id));
  }

  async function onOtherFileChange(file: File | null) {
    if (!file) {
      setOtherFile(null);
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    setOtherFile({
      filename: file.name,
      base64: btoa(binary),
      contentType: file.type || undefined,
    });
  }

  function handleStepClick(id: WorkflowStepId) {
    if (pending) return;

    if (id === "attendance") {
      window.location.href = attendanceHref;
      return;
    }
    if (id === "import_benefits") {
      if (!canEdit || locked) return;
      onOpenImportBenefits();
      return;
    }
    if (id === "import_deductions") {
      if (!canEdit || locked) return;
      onOpenImportDeductions();
      return;
    }
    if (id === "recalculate") {
      if (!canEdit || locked) return;
      runAction("Recalculate", () => recalculatePayrollRun(runId));
      return;
    }
    if (id === "hr_review") {
      if (pendingHr && currentUserId && pendingHr.approver_user_ids.includes(currentUserId)) {
        runAction("Approve HR Review", () =>
          approvePayrollStep({ runId, step: "hr_review" }),
        );
        return;
      }
      if (!canEdit || hrDone || locked) return;
      openApprovalDialog("hr_review");
      return;
    }
    if (id === "final_approval") {
      if (
        pendingFinal &&
        currentUserId &&
        pendingFinal.approver_user_ids.includes(currentUserId)
      ) {
        runAction("Approve Final Approval", () =>
          approvePayrollStep({ runId, step: "final_approval" }),
        );
        return;
      }
      if (!canEdit || finalDone || locked) return;
      openApprovalDialog("final_approval");
      return;
    }
    if (id === "payment_processing") {
      if (!canEdit) return;
      if (!finalDone && !paymentDone) return;
      setOtherFile(null);
      setEmailSend({ phase: "idle", stepIndex: 0, error: null });
      setDialog("payment");
      return;
    }
    if (id === "paid_locked") {
      if (paidDone) {
        setDialog("audit");
        return;
      }
      if (!canEdit || !paymentDone) return;
      runAction("Mark paid", () => markPayrollPaid(runId));
    }
  }

  const canReopen =
    paidDone &&
    canEdit &&
    Boolean(currentUserId) &&
    approvalsSettings.reopenUserIds.includes(currentUserId!);

  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {STEP_DEFS.map((step, index) => {
          const meta = stepMeta[step.id];
          const isApproverPending =
            (step.id === "hr_review" &&
              pendingHr &&
              currentUserId &&
              pendingHr.approver_user_ids.includes(currentUserId)) ||
            (step.id === "final_approval" &&
              pendingFinal &&
              currentUserId &&
              pendingFinal.approver_user_ids.includes(currentUserId));
          const isRecalculating =
            pending &&
            busyLabel?.startsWith("Recalculating") &&
            step.id === "recalculate";

          return (
            <div key={step.id} className="flex items-center gap-1.5">
              {index > 0 ? (
                <ChevronRight
                  className="size-3.5 shrink-0 text-black/25"
                  aria-hidden
                />
              ) : null}
              {step.id === "attendance" ? (
                <Link
                  href={attendanceHref}
                  className={cn(
                    "inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold transition",
                    meta.state === "complete" &&
                      "bg-[var(--venue-primary,#818a40)] text-white",
                    meta.state === "current" &&
                      "border border-[var(--venue-primary,#818a40)] bg-white text-[#3D421F]",
                    (meta.state === "future" || meta.state === "pending") &&
                      "border border-black/10 bg-black/[0.03] text-black/45",
                  )}
                >
                  {step.label}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleStepClick(step.id)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold transition disabled:opacity-60",
                    meta.state === "complete" &&
                      "bg-[var(--venue-primary,#818a40)] text-white",
                    meta.state === "current" &&
                      "border border-[var(--venue-primary,#818a40)] bg-white text-[#3D421F] hover:bg-[var(--venue-secondary,#F0F3DD)]/50",
                    meta.state === "pending" &&
                      "border border-amber-400/70 bg-amber-50 text-amber-950",
                    meta.state === "future" &&
                      "border border-black/10 bg-black/[0.03] text-black/45",
                    isApproverPending && "ring-2 ring-amber-400/60",
                    isRecalculating && "opacity-90",
                  )}
                >
                  {isRecalculating
                    ? "Recalculating…"
                    : isApproverPending
                      ? `Approve ${step.label}`
                      : step.label}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {busyLabel ? <SalesImportProgressBar label={busyLabel} /> : null}

      <div>
        <button
          type="button"
          aria-expanded={activityOpen}
          onClick={() => setActivityOpen((open) => !open)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3D421F] transition hover:text-black/70"
        >
          <ChevronDown
            className={cn(
              "size-3.5 text-black/45 transition-transform",
              activityOpen && "rotate-180",
            )}
          />
          Payroll Activity
        </button>

        {activityOpen ? (
          <ul className="mt-2 space-y-1.5 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5">
            {STEP_DEFS.map((step) => {
              const meta = stepMeta[step.id];
              const whenWho = [
                meta.at ? formatTs(meta.at) : null,
                meta.by,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={`${step.id}-comment`}
                  className="grid grid-cols-1 items-baseline gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-[#3D421F]">
                      {step.label}
                    </span>
                    <span
                      className={cn(
                        "text-black/60",
                        meta.state === "complete" &&
                          "text-[var(--venue-primary,#818a40)]",
                        meta.state === "pending" && "text-amber-800",
                        meta.state === "current" && "text-[#3D421F]",
                      )}
                    >
                      {meta.comment}
                    </span>
                  </div>
                  {whenWho ? (
                    <p className="shrink-0 text-[11px] text-black/45 sm:text-right">
                      {whenWho}
                    </p>
                  ) : (
                    <span className="hidden sm:block" aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {dialog === "hr_review" || dialog === "final_approval" ? (
        <ModalShell
          title={
            dialog === "hr_review"
              ? "Request HR Review"
              : "Request Final Approval"
          }
          onClose={() => setDialog(null)}
        >
          <p className="text-sm text-black/55">
            Select who should receive the approval notification.
          </p>
          <ul className="mt-3 max-h-56 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/10">
            {poolCandidates(dialog).map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-black/20"
                    checked={selectedApprovers.has(c.id)}
                    onChange={() => toggleApprover(c.id)}
                  />
                  <span>
                    <span className="block font-medium text-[#3D421F]">
                      {c.fullName}
                    </span>
                    <span className="block text-xs text-black/45">
                      {c.email}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {poolCandidates(dialog).length === 0 ? (
            <p className="mt-3 text-sm text-amber-800">
              No approvers configured. Add them under HR Settings → Pay →
              Payroll Approvals.
            </p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending || selectedApprovers.size === 0}
              onClick={() =>
                runAction(
                  dialog === "hr_review"
                    ? "Request HR Review"
                    : "Request Final Approval",
                  () =>
                    requestPayrollApproval({
                      runId,
                      step: dialog,
                      approverUserIds: [...selectedApprovers],
                    }),
                )
              }
            >
              Send request
            </Button>
          </div>
        </ModalShell>
      ) : null}

      {dialog === "payment" ? (
        <ModalShell
          title={
            emailSend.phase === "sending"
              ? "Sending email…"
              : emailSend.phase === "success"
                ? "Email sent"
                : emailSend.phase === "error"
                  ? "Email failed"
                  : "Payment Processing"
          }
          onClose={closePaymentDialog}
          closeDisabled={emailSend.phase === "sending"}
        >
          {emailSend.phase === "sending" ||
          emailSend.phase === "success" ||
          emailSend.phase === "error" ? (
            <div className="space-y-4">
              {emailSend.phase === "success" ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="size-6" strokeWidth={2.5} />
                  </span>
                  <div>
                    <p className="font-medium text-emerald-950">
                      Payroll package delivered
                    </p>
                    <p className="mt-1 text-sm text-emerald-900/80">
                      Sent from {approvalsSettings.email.fromEmail} to{" "}
                      {approvalsSettings.email.toEmails.join(", ") ||
                        "configured recipients"}
                      .
                    </p>
                  </div>
                </div>
              ) : null}

              {emailSend.phase === "error" ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-red-100 text-red-700">
                    <XCircle className="size-6" />
                  </span>
                  <div>
                    <p className="font-medium text-red-950">
                      Could not send email
                    </p>
                    <p className="mt-1 text-sm text-red-900/80">
                      {emailSend.error ?? "Unknown error"}
                    </p>
                  </div>
                </div>
              ) : null}

              {emailSend.phase === "sending" ? (
                <div className="flex items-center gap-3 rounded-lg border border-black/8 bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--venue-primary,#818a40)] shadow-sm">
                    <Mail className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#3D421F]">
                      Sending payroll package…
                    </p>
                    <p className="truncate text-xs text-black/50">
                      To{" "}
                      {approvalsSettings.email.toEmails.join(", ") ||
                        "recipients"}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                      <div
                        className="h-full rounded-full bg-[var(--venue-primary,#818a40)] transition-[width] duration-500 ease-out"
                        style={{
                          width: `${Math.min(
                            95,
                            ((emailSend.stepIndex + 1) /
                              EMAIL_SEND_STEPS.length) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              <ol className="space-y-2">
                {EMAIL_SEND_STEPS.map((label, index) => {
                  const done =
                    emailSend.phase === "success" ||
                    (emailSend.phase === "sending" &&
                      index < emailSend.stepIndex);
                  const active =
                    emailSend.phase === "sending" &&
                    index === emailSend.stepIndex;
                  const failed =
                    emailSend.phase === "error" && index === 0;
                  return (
                    <li
                      key={label}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                        active && "bg-black/[0.03]",
                        failed && "opacity-50",
                      )}
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center">
                        {done ? (
                          <Check
                            className="size-4 text-emerald-600"
                            strokeWidth={2.5}
                          />
                        ) : active ? (
                          <Loader2 className="size-4 animate-spin text-[var(--venue-primary,#818a40)]" />
                        ) : (
                          <span className="size-1.5 rounded-full bg-black/20" />
                        )}
                      </span>
                      <span
                        className={cn(
                          "text-[#3D421F]",
                          !done && !active && "text-black/40",
                          done && "text-emerald-900",
                        )}
                      >
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>

              <div className="flex justify-end gap-2 pt-1">
                {emailSend.phase === "sending" ? (
                  <p className="w-full text-center text-xs text-black/45">
                    Please wait — this may take a few seconds.
                  </p>
                ) : emailSend.phase === "error" ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={closePaymentDialog}
                    >
                      Close
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={sendPayrollEmail}
                    >
                      Try again
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" onClick={closePaymentDialog}>
                    Done
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-black/55">
                Export the payroll document, download the GL file, or email the
                configured recipients.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !canEdit}
                  onClick={() =>
                    downloadCsv("Payroll export", () => generateWpsFile(runId))
                  }
                >
                  Export Payroll
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || !canEdit}
                  onClick={sendPayrollEmail}
                >
                  <Mail className="size-3.5" />
                  Send Email
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending || !canEdit}
                  onClick={() =>
                    downloadCsv("GL export", () => exportPayrollGl(runId))
                  }
                >
                  Export GL
                </Button>
                {approvalsSettings.email.attachOther ? (
                  <label className="mt-1 block text-sm text-[#3D421F]">
                    Other attachment
                    <input
                      type="file"
                      className="mt-1 block w-full text-xs"
                      onChange={(e) =>
                        void onOtherFileChange(e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                ) : null}
                <p className="text-[11px] text-black/45">
                  From {approvalsSettings.email.fromEmail} →{" "}
                  {approvalsSettings.email.toEmails.join(", ") ||
                    "no recipients"}
                </p>
              </div>
            </>
          )}
        </ModalShell>
      ) : null}

      {dialog === "audit" ? (
        <ModalShell
          title="Payroll audit"
          onClose={() => setDialog(null)}
          footer={
            <div className="space-y-2.5">
              {canReopen ? (
                confirmReopen ? (
                  <>
                    <p className="text-sm text-[#3D421F]">
                      Unlock this run and return it to{" "}
                      <span className="font-semibold">Final Approval</span> for
                      alterations? Payments already marked paid are not reversed
                      automatically.
                    </p>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => setConfirmReopen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        className="bg-rose-700 text-white hover:bg-rose-800 hover:opacity-100"
                        onClick={() =>
                          runAction("Reopen payroll", () =>
                            reopenPayrollRun(runId),
                          )
                        }
                      >
                        Confirm reopen
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-black/60">
                      Need to change figures after payment? Reopen unlocks the
                      run for authorized edits.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      className="w-full bg-rose-700 text-white hover:bg-rose-800 hover:opacity-100 sm:w-auto"
                      onClick={() => setConfirmReopen(true)}
                    >
                      Reopen for alterations
                    </Button>
                  </>
                )
              ) : (
                <p className="text-sm text-black/55">
                  Only people listed under{" "}
                  <Link
                    href={HR_SETTINGS_PAY_APPROVALS_HREF}
                    className="font-semibold text-[#3D421F] underline-offset-2 hover:underline"
                  >
                    Pay → Approvals → Paid / Locked — reopen
                  </Link>{" "}
                  can reopen a locked run.
                </p>
              )}
            </div>
          }
        >
          <ul className="space-y-2 text-sm">
            {events.length === 0 ? (
              <li className="text-black/45">No activity recorded.</li>
            ) : (
              events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-md border border-black/8 bg-black/[0.02] px-3 py-2"
                >
                  <p className="font-medium text-[#3D421F]">
                    {ev.from_status ? `${ev.from_status} → ` : ""}
                    {ev.to_status}
                  </p>
                  {ev.comment ? (
                    <p className="text-xs text-black/55">{ev.comment}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-black/40">
                    {formatTs(ev.created_at)}
                    {ev.actor_name ? ` · ${ev.actor_name}` : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
        </ModalShell>
      ) : null}
    </div>
  );
}
