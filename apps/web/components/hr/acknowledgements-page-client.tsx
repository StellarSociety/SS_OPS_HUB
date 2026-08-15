"use client";

import { useEffect, useMemo, useState, useTransition, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, ChevronDown, ChevronRight, FileDown, Loader2, Mail, ScrollText, Search, X, XCircle } from "lucide-react";
import { AcknowledgementCertificateDialog } from "@/components/hr/acknowledgement-certificate-dialog";
import { AcknowledgementEmployeeExportDialog } from "@/components/hr/acknowledgement-employee-export-dialog";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { StatusBadge } from "@/components/hr/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAcknowledgementSendHistory,
  getAcknowledgementSentEmail,
  sendAcknowledgementReminder,
} from "@/lib/actions/hr-acknowledgements";
import {
  acknowledgementReminderLabel,
  acknowledgementReminderSubject,
  HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS,
  type AcknowledgementSendHistory,
  type HrAcknowledgementSentEmail,
  type HrEmailAcknowledgementRecord,
  type HrEmailAcknowledgementStatus,
} from "@/lib/hr/acknowledgement";
import {
  extractAckButton,
  innerMessageHtml,
  looksLikeFullEmailHtml,
} from "@/lib/hr/acknowledgement-email-preview";
import { formatDateOnly } from "@/lib/hr/derived";
import { emailTemplateBodyToSafeFragment } from "@/lib/hr/email-message-format";
import type { StaffWithLookups } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: Array<HrEmailAcknowledgementStatus | "all"> = [
  "all",
  "pending",
  "acknowledged",
  "not_acknowledged",
];

const REMINDER_SEND_STEPS = [
  "Preparing reminder…",
  "Connecting to mail…",
  "Delivering email…",
  "Confirming delivery…",
] as const;

type ReminderSendPhase = "confirm" | "sending" | "success" | "error";

type ReminderSendState = {
  recordId: string;
  staffName: string;
  to: string;
  originalSubject: string;
  reminderLabel: string;
  reminderSubject: string;
  phase: ReminderSendPhase;
  error: string | null;
  sentTo: string | null;
};

function statusBadgeClass(status: HrEmailAcknowledgementStatus): string {
  if (status === "acknowledged") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "not_acknowledged") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = formatDateOnly(iso.slice(0, 10));
  const time = iso.slice(11, 16);
  return time ? `${date} ${time}` : date;
}

export function AcknowledgementsPageClient({
  records,
  staff = [],
  view = "all",
  canRemind = false,
}: {
  records: HrEmailAcknowledgementRecord[];
  staff?: StaffWithLookups[];
  view?: "all" | "employees";
  canRemind?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<HrEmailAcknowledgementStatus | "all">(
    "all",
  );
  const [emailRecordId, setEmailRecordId] = useState<string | null>(null);
  const [certificateRecordId, setCertificateRecordId] = useState<string | null>(
    null,
  );
  const [exportEmployeeKey, setExportEmployeeKey] = useState<string | null>(
    null,
  );
  const [expandedStaffIds, setExpandedStaffIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [reminderCounts, setReminderCounts] = useState<Record<string, number>>(
    {},
  );
  const [reminderSend, setReminderSend] = useState<ReminderSendState | null>(
    null,
  );
  const [reminderSendStep, setReminderSendStep] = useState(0);
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null);
  const certificateRecord =
    records.find((row) => row.id === certificateRecordId) ?? null;

  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.id, member])),
    [staff],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      const member = row.staffId ? staffById.get(row.staffId) : null;
      const haystack = [
        row.staffName,
        row.empNo ?? "",
        row.subject,
        row.emailKindLabel,
        row.recipientEmail ?? "",
        row.comments,
        member?.position?.name ?? "",
        member?.department?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, records, staffById, status]);

  const employeeGroups = useMemo(
    () => groupAcknowledgementEmployees(filtered, staffById),
    [filtered, staffById],
  );
  const exportGroup = useMemo(() => {
    if (!exportEmployeeKey) return null;
    return (
      groupAcknowledgementEmployees(records, staffById).find(
        (group) => group.key === exportEmployeeKey,
      ) ?? null
    );
  }, [exportEmployeeKey, records, staffById]);

  useEffect(() => {
    if (reminderSend?.phase !== "sending") return;
    const timer = window.setInterval(() => {
      setReminderSendStep((prev) =>
        prev >= REMINDER_SEND_STEPS.length - 1 ? prev : prev + 1,
      );
    }, 700);
    return () => window.clearInterval(timer);
  }, [reminderSend?.phase]);

  function openRemindConfirm(id: string) {
    const row = records.find((record) => record.id === id);
    const reminderCount = reminderCounts[id] ?? row?.reminderCount ?? 0;
    const reminderNumber = reminderCount + 1;
    const originalSubject = row?.subject ?? "";
    setReminderSend({
      recordId: id,
      staffName: row?.staffName ?? "Employee",
      to: row?.recipientEmail?.trim() || "",
      originalSubject,
      reminderLabel: acknowledgementReminderLabel(reminderNumber),
      reminderSubject: acknowledgementReminderSubject(
        originalSubject,
        reminderNumber,
      ),
      phase: "confirm",
      error: null,
      sentTo: null,
    });
    setReminderSendStep(0);
  }

  async function sendReminder(id: string) {
    const row = records.find((record) => record.id === id);
    const reminderCount = reminderCounts[id] ?? row?.reminderCount ?? 0;
    const reminderNumber = reminderCount + 1;
    const originalSubject = row?.subject ?? "";
    setReminderSend((prev) =>
      prev && prev.recordId === id
        ? { ...prev, phase: "sending", error: null }
        : {
            recordId: id,
            staffName: row?.staffName ?? "Employee",
            to: row?.recipientEmail?.trim() || "",
            originalSubject,
            reminderLabel: acknowledgementReminderLabel(reminderNumber),
            reminderSubject: acknowledgementReminderSubject(
              originalSubject,
              reminderNumber,
            ),
            phase: "sending",
            error: null,
            sentTo: null,
          },
    );
    setReminderSendStep(0);
    setRemindingId(id);
    const result = await sendAcknowledgementReminder(id);
    setRemindingId(null);
    if (!result.ok) {
      setReminderSend((prev) =>
        prev ? { ...prev, phase: "error", error: result.error } : prev,
      );
      return;
    }
    setReminderSendStep(REMINDER_SEND_STEPS.length - 1);
    setReminderCounts((prev) => ({
      ...prev,
      [id]: result.reminderCount,
    }));
    setReminderSend((prev) =>
      prev
        ? { ...prev, phase: "success", sentTo: result.to, error: null }
        : prev,
    );
  }

  function toggleExpanded(key: string) {
    setExpandedStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/35" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee, subject, comments…"
            className="h-10 pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as HrEmailAcknowledgementStatus | "all")
          }
          className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
        >
          {STATUS_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === "all"
                ? "All statuses"
                : HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 bg-white/60 px-4 py-10 text-center text-sm text-black/50">
          {records.length === 0
            ? "No acknowledgements yet. Tick “Requires acknowledgement” on an email template, then send it."
            : "No acknowledgements match this search."}
        </p>
      ) : view === "employees" ? (
        <div className="space-y-3">
          {employeeGroups.map((group) => (
            <EmployeeAcknowledgementCard
              key={group.key}
              group={group}
              expanded={expandedStaffIds.has(group.key)}
              onToggle={() => toggleExpanded(group.key)}
              onOpenEmail={setEmailRecordId}
              onOpenCertificate={setCertificateRecordId}
              onOpenExport={setExportEmployeeKey}
              canRemind={canRemind}
              remindingId={remindingId}
              reminderCounts={reminderCounts}
              onRemind={openRemindConfirm}
              onOpenHistory={setHistoryRecordId}
            />
          ))}
        </div>
      ) : (
        <AllRecordsTable
          rows={filtered}
          onOpenEmail={setEmailRecordId}
          onOpenCertificate={setCertificateRecordId}
          canRemind={canRemind}
          remindingId={remindingId}
          reminderCounts={reminderCounts}
          onRemind={openRemindConfirm}
          onOpenHistory={setHistoryRecordId}
        />
      )}

      <AcknowledgementSentEmailDialog
        recordId={emailRecordId}
        onClose={() => setEmailRecordId(null)}
      />
      <AcknowledgementSendHistoryDialog
        recordId={historyRecordId}
        onClose={() => setHistoryRecordId(null)}
      />
      <AcknowledgementReminderSendDialog
        send={reminderSend}
        stepIndex={reminderSendStep}
        onClose={() => {
          if (reminderSend?.phase === "sending") return;
          setReminderSend(null);
          setReminderSendStep(0);
        }}
        onConfirm={() => {
          if (!reminderSend || reminderSend.phase !== "confirm") return;
          void sendReminder(reminderSend.recordId);
        }}
        onRetry={() => {
          if (!reminderSend || reminderSend.phase === "sending") return;
          void sendReminder(reminderSend.recordId);
        }}
      />
      <AcknowledgementCertificateDialog
        record={certificateRecord}
        department={
          certificateRecord?.staffId
            ? staffById.get(certificateRecord.staffId)?.department?.name ?? null
            : null
        }
        position={
          certificateRecord?.staffId
            ? staffById.get(certificateRecord.staffId)?.position?.name ?? null
            : null
        }
        onClose={() => setCertificateRecordId(null)}
      />
      <AcknowledgementEmployeeExportDialog
        staffName={exportGroup?.staffName ?? ""}
        empNo={exportGroup?.empNo ?? null}
        department={exportGroup?.staff?.department?.name ?? null}
        position={exportGroup?.staff?.position?.name ?? null}
        records={exportGroup?.records ?? null}
        onClose={() => setExportEmployeeKey(null)}
      />
    </div>
  );
}

type EmployeeAckGroup = {
  key: string;
  staff: StaffWithLookups | null;
  staffName: string;
  empNo: string | null;
  staffId: string | null;
  records: HrEmailAcknowledgementRecord[];
};

function groupAcknowledgementEmployees(
  records: HrEmailAcknowledgementRecord[],
  staffById: Map<string, StaffWithLookups>,
): EmployeeAckGroup[] {
  const groups = new Map<string, EmployeeAckGroup>();
  for (const row of records) {
    const key = row.staffId || `name:${row.staffName}|emp:${row.empNo ?? ""}`;
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(row);
      continue;
    }
    const member = row.staffId ? staffById.get(row.staffId) ?? null : null;
    groups.set(key, {
      key,
      staff: member,
      staffName: member?.full_name ?? row.staffName,
      empNo: member?.emp_no ?? row.empNo,
      staffId: member?.id ?? row.staffId,
      records: [row],
    });
  }
  return [...groups.values()].sort((a, b) =>
    a.staffName.localeCompare(b.staffName, undefined, { sensitivity: "base" }),
  );
}

function countByStatus(
  records: HrEmailAcknowledgementRecord[],
  status: HrEmailAcknowledgementStatus,
) {
  return records.filter((row) => row.status === status).length;
}

function CertificateButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex size-11 items-center justify-center rounded-md text-[var(--venue-primary,#818a40)] transition hover:bg-[var(--venue-primary,#818a40)]/10"
      aria-label={label}
      title="View certificate"
      onClick={onClick}
    >
      <ScrollText className="size-6" strokeWidth={2} />
    </button>
  );
}

function ReminderCountTag({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`View ${acknowledgementReminderLabel(count)} and sent messages`}
      className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-primary,#818a40)]/10 px-2 text-xs font-semibold text-[var(--venue-primary,#818a40)] underline decoration-[var(--venue-primary,#818a40)]/50 underline-offset-2 hover:bg-[var(--venue-primary,#818a40)]/15 hover:decoration-[var(--venue-primary,#818a40)]"
    >
      {count}
    </button>
  );
}

function RemindButton({
  row,
  canRemind,
  reminding,
  reminderCount,
  onRemind,
  onOpenHistory,
}: {
  row: HrEmailAcknowledgementRecord;
  canRemind: boolean;
  reminding: boolean;
  reminderCount: number;
  onRemind: (id: string) => void;
  onOpenHistory: (id: string) => void;
}) {
  const tag = (
    <ReminderCountTag
      count={reminderCount}
      onOpen={() => onOpenHistory(row.id)}
    />
  );

  if (row.status !== "pending" || !canRemind) {
    return reminderCount > 0 ? tag : <span className="text-black/30">—</span>;
  }

  const noEmail = !row.recipientEmail?.trim();
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 px-2.5 text-xs"
        disabled={reminding || noEmail}
        title={
          noEmail
            ? "No employee email on this acknowledgement"
            : reminderCount > 0
              ? `Send the next reminder (${acknowledgementReminderLabel(reminderCount + 1)})`
              : "Send a reminder that acknowledgement is mandatory"
        }
        onClick={() => onRemind(row.id)}
      >
        {reminding ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Bell className="size-3.5" strokeWidth={2} />
        )}
        Remind
      </Button>
      {tag}
    </div>
  );
}

function AllRecordsTable({
  rows,
  onOpenEmail,
  onOpenCertificate,
  canRemind,
  remindingId,
  reminderCounts,
  onRemind,
  onOpenHistory,
}: {
  rows: HrEmailAcknowledgementRecord[];
  onOpenEmail: (id: string) => void;
  onOpenCertificate: (id: string) => void;
  canRemind: boolean;
  remindingId: string | null;
  reminderCounts: Record<string, number>;
  onRemind: (id: string) => void;
  onOpenHistory: (id: string) => void;
}) {
  return (
    <div className="min-w-0 max-h-[min(36rem,calc(100dvh-16rem))] overflow-auto rounded-xl border border-black/10 bg-white">
      <table className="w-max min-w-full text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)] text-xs uppercase tracking-wide text-black/50">
          <tr>
            <th className="w-10 px-2 py-2.5 font-medium">
              <span className="sr-only">Email</span>
            </th>
            <th className="px-3 py-2.5 font-medium">Employee</th>
            <th className="px-3 py-2.5 font-medium">Subject</th>
            <th className="px-3 py-2.5 font-medium">Sent</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Confirmed</th>
            <th className="px-3 py-2.5 font-medium">Reminder</th>
            <th className="w-24 px-2 py-2.5 text-center font-medium">
              Certificate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-black/5 last:border-0">
              <td className="px-2 py-2.5">
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-md text-[var(--venue-primary,#818a40)] transition hover:bg-[var(--venue-primary,#818a40)]/10"
                  aria-label={`View sent email for ${row.staffName}`}
                  onClick={() => onOpenEmail(row.id)}
                >
                  <Mail className="size-4" strokeWidth={2} />
                </button>
              </td>
              <td className="px-3 py-2.5">
                <p className="font-medium text-[#3D421F]">{row.staffName}</p>
                <p className="text-xs text-black/45">
                  {row.empNo || "—"} · {row.emailKindLabel}
                </p>
              </td>
              <td className="max-w-[18rem] truncate px-3 py-2.5 text-[#3D421F]">
                {row.subject}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-black/60">
                {formatDateTime(row.sentAt)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    statusBadgeClass(row.status),
                  )}
                >
                  {HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS[row.status]}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-black/60">
                {formatDateTime(row.respondedAt)}
              </td>
              <td className="px-3 py-2.5">
                <RemindButton
                  row={row}
                  canRemind={canRemind}
                  reminding={remindingId === row.id}
                  reminderCount={reminderCounts[row.id] ?? row.reminderCount}
                  onRemind={onRemind}
                  onOpenHistory={onOpenHistory}
                />
              </td>
              <td className="px-2 py-2.5 text-center">
                <div className="flex justify-center">
                  <CertificateButton
                    label={`View certificate for ${row.staffName}`}
                    onClick={() => onOpenCertificate(row.id)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeAcknowledgementCard({
  group,
  expanded,
  onToggle,
  onOpenEmail,
  onOpenCertificate,
  onOpenExport,
  canRemind,
  remindingId,
  reminderCounts,
  onRemind,
  onOpenHistory,
}: {
  group: EmployeeAckGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenEmail: (id: string) => void;
  onOpenCertificate: (id: string) => void;
  onOpenExport: (key: string) => void;
  canRemind: boolean;
  remindingId: string | null;
  reminderCounts: Record<string, number>;
  onRemind: (id: string) => void;
  onOpenHistory: (id: string) => void;
}) {
  const member = group.staff;
  const pendingCount = countByStatus(group.records, "pending");
  const acknowledgedCount = countByStatus(group.records, "acknowledged");
  const declinedCount = countByStatus(group.records, "not_acknowledged");

  function stopRowToggle(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-white/70">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            <tr
              className="cursor-pointer border-b border-black/5 last:border-0 transition-colors hover:bg-[var(--venue-secondary,#F0F3DD)]/40"
              onClick={onToggle}
            >
              <td className="px-4 py-3 align-middle">
                <div className="flex items-stretch gap-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      stopRowToggle(event);
                      onToggle();
                    }}
                    className="shrink-0 self-center rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
                    aria-expanded={expanded}
                    aria-label={
                      expanded
                        ? "Collapse acknowledgement records"
                        : "Expand acknowledgement records"
                    }
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  {member ? (
                    <StaffPhotoThumbnail
                      fullName={member.full_name}
                      photoUrl={member.photo_url}
                      size="fill"
                      empNo={member.emp_no}
                      department={member.department?.name}
                      position={member.position?.name}
                      employeeStatus={member.employment_status?.name}
                      workingStatus={member.working_status?.name}
                      nationality={member.nationality?.name}
                      dob={member.dob}
                      joiningDate={member.joining_date}
                      terminationDate={member.termination_date}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[#3D421F]">
                      {group.staffName}
                    </div>
                    <div className="mt-0.5 text-xs text-black/45">
                      {group.staffId && group.empNo ? (
                        <span onClick={stopRowToggle}>
                          <StaffDirectoryLink
                            staffId={group.staffId}
                            empNo={group.empNo}
                          />
                        </span>
                      ) : (
                        group.empNo || "—"
                      )}
                      {member?.position?.name ? ` · ${member.position.name}` : ""}
                    </div>
                    {member ? (
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-black/45">
                        <StatusBadge status={member.employment_status?.name} />
                        <span>
                          Joined{" "}
                          {member.joining_date
                            ? formatDateOnly(member.joining_date)
                            : "—"}
                          {" · "}
                          Terminated{" "}
                          {member.termination_date
                            ? formatDateOnly(member.termination_date)
                            : "—"}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="flex flex-col items-end justify-center gap-1">
                      <span className="text-xs font-medium tabular-nums text-[#3D421F]">
                        {group.records.length}{" "}
                        {group.records.length === 1 ? "record" : "records"}
                      </span>
                      <div className="flex flex-wrap justify-end gap-1">
                        {pendingCount > 0 ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              statusBadgeClass("pending"),
                            )}
                          >
                            {pendingCount} pending
                          </span>
                        ) : null}
                        {acknowledgedCount > 0 ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              statusBadgeClass("acknowledged"),
                            )}
                          >
                            {acknowledgedCount} acknowledged
                          </span>
                        ) : null}
                        {declinedCount > 0 ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              statusBadgeClass("not_acknowledged"),
                            )}
                          >
                            {declinedCount} not acknowledged
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="flex size-12 shrink-0 items-center justify-center self-center rounded-md text-[var(--venue-primary,#818a40)] transition hover:bg-[var(--venue-primary,#818a40)]/10"
                      aria-label={`Export certificates for ${group.staffName}`}
                      title="Export certificates"
                      onClick={(event) => {
                        stopRowToggle(event);
                        onOpenExport(group.key);
                      }}
                    >
                      <FileDown className="size-7" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {expanded ? (
        <div className="overflow-x-auto border-t border-black/10 bg-black/[0.015]">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-black/45">
              <tr>
                <th className="w-10 px-4 py-2.5 font-medium">
                  <span className="sr-only">Email</span>
                </th>
                <th className="px-4 py-2.5 font-medium">Subject</th>
                <th className="px-4 py-2.5 font-medium">Sent</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Confirmed</th>
                <th className="px-4 py-2.5 font-medium">Reminder</th>
                <th className="w-24 px-2 py-2.5 text-center font-medium">
                  Certificate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {group.records.map((row) => (
                <tr key={row.id} className="text-[#3D421F]">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-md text-[var(--venue-primary,#818a40)] transition hover:bg-[var(--venue-primary,#818a40)]/10"
                      aria-label={`View sent email for ${row.subject}`}
                      onClick={() => onOpenEmail(row.id)}
                    >
                      <Mail className="size-4" strokeWidth={2} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{row.subject}</p>
                    <p className="text-xs text-black/45">{row.emailKindLabel}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-black/65">
                    {formatDateTime(row.sentAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        statusBadgeClass(row.status),
                      )}
                    >
                      {HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-black/65">
                    {formatDateTime(row.respondedAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <RemindButton
                      row={row}
                      canRemind={canRemind}
                      reminding={remindingId === row.id}
                      reminderCount={reminderCounts[row.id] ?? row.reminderCount}
                      onRemind={onRemind}
                      onOpenHistory={onOpenHistory}
                    />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <div className="flex justify-center">
                      <CertificateButton
                        label={`View certificate for ${row.subject}`}
                        onClick={() => onOpenCertificate(row.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function AcknowledgementSentEmailDialog({
  recordId,
  onClose,
}: {
  recordId: string | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState<HrAcknowledgementSentEmail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordId) {
      setEmail(null);
      setError(null);
      return;
    }
    setEmail(null);
    setError(null);
    startTransition(async () => {
      const result = await getAcknowledgementSentEmail(recordId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEmail(result.email);
    });
  }, [recordId]);

  useEffect(() => {
    if (!recordId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, recordId]);

  if (!recordId || typeof document === "undefined") return null;

  const html = email?.html?.trim() || "";
  const rawText = email?.text?.trim() || "";
  const text = rawText && !looksLikeFullEmailHtml(rawText) ? rawText : "";
  const messageHtml = text
    ? emailTemplateBodyToSafeFragment(text)
    : innerMessageHtml(html);
  const ackButton = extractAckButton(html);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ack-sent-email-title"
        className="flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="ack-sent-email-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              Sent email
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              {email
                ? `${email.staffName} · ${email.emailKindLabel}`
                : "Loading the message that was sent."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {pending && !email && !error ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-black/45">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sent email…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              {error}
            </p>
          ) : email ? (
            <div className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-black/45">To</dt>
                  <dd className="mt-0.5 break-all text-[#3D421F]">
                    {email.to || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-black/45">From</dt>
                  <dd className="mt-0.5 break-all text-[#3D421F]">
                    {email.from || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-black/45">Sent</dt>
                  <dd className="mt-0.5 text-[#3D421F]">
                    {formatDateTime(email.sentAt)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-black/45">Subject</dt>
                  <dd className="mt-0.5 text-[#3D421F]">{email.subject}</dd>
                </div>
              </dl>

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-black/45">
                  Message
                </p>
                {messageHtml ? (
                  <div className="space-y-4 rounded-lg border border-black/10 bg-white px-3 py-3">
                    <div
                      className="text-sm leading-relaxed text-[#3D421F] [&_a]:text-[var(--venue-primary,#6B7B3A)] [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: messageHtml }}
                    />
                    {ackButton ? (
                      <div className="flex justify-center pb-1 pt-1">
                        <a
                          href={ackButton.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block rounded-lg px-[22px] py-3 text-center text-sm font-bold leading-tight text-white"
                          style={{
                            backgroundColor: "var(--venue-primary, #818a40)",
                          }}
                        >
                          {ackButton.label}
                        </a>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-black/15 px-3 py-8 text-center text-sm text-black/45">
                    The email body is not stored for this send.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-black/10 px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AcknowledgementSendHistoryDialog({
  recordId,
  onClose,
}: {
  recordId: string | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [history, setHistory] = useState<AcknowledgementSendHistory | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordId) {
      setHistory(null);
      setError(null);
      return;
    }
    setHistory(null);
    setError(null);
    startTransition(async () => {
      const result = await getAcknowledgementSendHistory(recordId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setHistory(result.history);
    });
  }, [recordId]);

  useEffect(() => {
    if (!recordId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, recordId]);

  if (!recordId || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ack-send-history-title"
        className="flex max-h-[min(92vh,40rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="ack-send-history-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              Sent messages & reminders
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              {history
                ? `${history.staffName} · ${history.emailKindLabel}`
                : "Loading the original send and reminder emails."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 hover:bg-black/5 hover:text-[#3D421F]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
          {pending && !history && !error ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-black/45">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sent messages…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
              {error}
            </p>
          ) : history ? (
            <div className="max-h-full min-h-0 overflow-auto rounded-xl border border-black/10">
              <table className="w-max min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)] text-xs uppercase tracking-wide text-black/50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                      Send
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                      Sent
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                      Subject
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                      To
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                      From
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-black/5 last:border-0"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            item.kind === "original"
                              ? "border-black/15 bg-white text-[#3D421F]"
                              : "border-[var(--venue-primary,#818a40)]/30 bg-[var(--venue-primary,#818a40)]/10 text-[var(--venue-primary,#818a40)]",
                          )}
                        >
                          {item.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-black/60">
                        {formatDateTime(item.sentAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[#3D421F]">
                        {item.subject}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[#3D421F]">
                        {item.to || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[#3D421F]">
                        {item.from || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-black/10 px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AcknowledgementReminderSendDialog({
  send,
  stepIndex,
  onClose,
  onConfirm,
  onRetry,
}: {
  send: ReminderSendState | null;
  stepIndex: number;
  onClose: () => void;
  onConfirm: () => void;
  onRetry: () => void;
}) {
  useEffect(() => {
    if (!send) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && send.phase !== "sending") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, send]);

  if (!send || typeof document === "undefined") return null;

  const title =
    send.phase === "confirm"
      ? "Send reminder?"
      : send.phase === "sending"
        ? "Sending email…"
        : send.phase === "success"
          ? "Email sent"
          : "Email failed";

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (send.phase === "sending") return;
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ack-reminder-send-title"
        className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-xl"
      >
        <h2
          id="ack-reminder-send-title"
          className="font-serif text-lg text-[#3D421F]"
        >
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-black/50">
          {send.phase === "confirm"
            ? "Confirm before this reminder email is sent."
            : `${send.staffName}${send.reminderLabel ? ` · ${send.reminderLabel}` : ""}`}
        </p>

        <div className="mt-4">
          {send.phase === "confirm" ? (
            <div className="space-y-3">
              <p className="text-sm text-black/65">
                Send <strong>{send.reminderLabel}</strong> to{" "}
                <strong>{send.staffName}</strong> that acknowledgement is
                necessary and mandatory.
              </p>
              <div className="rounded-lg border border-black/10 bg-black/[0.02] px-3 py-3 text-sm text-[#3D421F]">
                <p className="font-medium">{send.staffName}</p>
                <p className="mt-1 break-all text-xs text-black/50">
                  To {send.to || "—"}
                </p>
                <p className="mt-2 text-xs text-black/45">Subject</p>
                <p className="mt-0.5 text-sm">{send.reminderSubject}</p>
              </div>
            </div>
          ) : null}

          {send.phase === "sending" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-black/8 bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--venue-primary,#818a40)] shadow-sm">
                  <Mail className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#3D421F]">
                    {REMINDER_SEND_STEPS[stepIndex]}
                  </p>
                  <p className="truncate text-xs text-black/50">
                    To {send.to || "employee"}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                    <div
                      className="h-full rounded-full bg-[var(--venue-primary,#818a40)] transition-[width] duration-500 ease-out"
                      style={{
                        width: `${Math.min(
                          95,
                          ((stepIndex + 1) / REMINDER_SEND_STEPS.length) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <ul className="space-y-1.5 text-xs text-black/50">
                {REMINDER_SEND_STEPS.map((label, index) => {
                  const done = index <= stepIndex;
                  return (
                    <li
                      key={label}
                      className={cn(
                        "flex items-center gap-2",
                        done ? "text-[#3D421F]" : "text-black/35",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded-full",
                          done
                            ? "bg-[var(--venue-primary,#818a40)] text-white"
                            : "border border-black/15",
                        )}
                      >
                        {done ? (
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        ) : null}
                      </span>
                      {label}
                    </li>
                  );
                })}
              </ul>
              <p className="text-center text-xs text-black/45">
                Please wait — this may take a few seconds.
              </p>
            </div>
          ) : null}

          {send.phase === "success" ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="size-6" strokeWidth={2.5} />
              </span>
              <div>
                <p className="font-medium text-emerald-950">
                  Reminder delivered
                </p>
                <p className="mt-1 text-sm text-emerald-900/80">
                  Sent to {send.sentTo || send.to || "employee"}
                </p>
              </div>
            </div>
          ) : null}

          {send.phase === "error" ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-red-100 text-red-700">
                <XCircle className="size-6" />
              </span>
              <div>
                <p className="font-medium text-red-950">Could not send email</p>
                <p className="mt-1 text-sm text-red-900/80">
                  {send.error || "Unknown error"}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {send.phase === "sending" ? null : (
          <div className="mt-5 flex justify-end gap-2">
            {send.phase === "confirm" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button type="button" className="h-9" onClick={onConfirm}>
                  Send reminder
                </Button>
              </>
            ) : send.phase === "error" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                  onClick={onClose}
                >
                  Close
                </Button>
                <Button type="button" className="h-9" onClick={onRetry}>
                  Try again
                </Button>
              </>
            ) : (
              <Button type="button" className="h-9" onClick={onClose}>
                Done
              </Button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
