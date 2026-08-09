"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  Mail,
  Search,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  OffboardingNoticeEmailRecordCard,
  OffboardingNoticeEmailRecordViewer,
} from "@/components/hr/offboarding-notice-email-record";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import {
  archiveOffboardingProcess,
  deleteOffboardingProcess,
  unarchiveOffboardingProcess,
} from "@/lib/actions/hr-offboarding";
import { listBoardingNoticeEmails, countSentBoardingNoticeEmailsByStaff } from "@/lib/actions/hr-boarding-email";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import {
  OFFBOARDING_PROCESS_STATUS_LABELS,
  OFFBOARDING_TERMINATION_KIND_OPTIONS,
  terminationKindLabel,
  type OffboardingLeaveHandling,
  type OffboardingNoticeEmailDelivery,
  type OffboardingProcess,
  type OffboardingProcessStatus,
  type OffboardingTerminationKind,
} from "@/lib/hr/offboarding-process";
import { cn } from "@/lib/utils";

type OffboardingProcessTableProps = {
  processes: OffboardingProcess[];
  onOpenProcess?: (process: OffboardingProcess) => void;
  canManage?: boolean;
};

const STATUS_FILTER_OPTIONS: OffboardingProcessStatus[] = [
  "draft",
  "in_progress",
  "settlement_pending",
  "completed",
  "cancelled",
];

type ArchiveFilter = "active" | "archived" | "all";

const selectClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

function recordSortTime(record: OffboardingNoticeEmailDelivery): number {
  const iso =
    record.status === "scheduled" && record.scheduledAt
      ? record.scheduledAt
      : record.sentAt;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function isArchived(process: OffboardingProcess): boolean {
  return Boolean(process.archivedAt);
}

export function OffboardingProcessTable({
  processes,
  onOpenProcess,
  canManage = false,
}: OffboardingProcessTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [kind, setKind] = useState<"" | OffboardingTerminationKind>("");
  const [status, setStatus] = useState<"" | OffboardingProcessStatus>("");
  const [leaveHandling, setLeaveHandling] = useState<
    "" | OffboardingLeaveHandling
  >("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [commsProcess, setCommsProcess] = useState<OffboardingProcess | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<OffboardingProcess | null>(
    null,
  );
  const [actionId, setActionId] = useState<string | null>(null);
  const [sentCounts, setSentCounts] = useState<Record<string, number>>({});

  const staffIdsKey = useMemo(
    () =>
      [...new Set(processes.map((p) => p.staffId))]
        .sort()
        .join(","),
    [processes],
  );

  useEffect(() => {
    if (!staffIdsKey) {
      setSentCounts({});
      return;
    }
    let cancelled = false;
    const staffIds = staffIdsKey.split(",");
    void countSentBoardingNoticeEmailsByStaff({ staffIds }).then((result) => {
      if (cancelled || !result.ok) return;
      setSentCounts(result.counts);
    });
    return () => {
      cancelled = true;
    };
  }, [staffIdsKey]);

  const departments = useMemo(() => {
    const names = new Set<string>();
    for (const row of processes) {
      if (row.departmentName?.trim()) names.add(row.departmentName.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [processes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return processes.filter((row) => {
      const archived = isArchived(row);
      if (archiveFilter === "active" && archived) return false;
      if (archiveFilter === "archived" && !archived) return false;
      if (department && row.departmentName !== department) return false;
      if (kind && row.terminationKind !== kind) return false;
      if (status && row.status !== status) return false;
      if (leaveHandling && row.leaveHandling !== leaveHandling) return false;
      if (!q) return true;
      return (
        row.fullName.toLowerCase().includes(q) ||
        row.empNo.toLowerCase().includes(q) ||
        (row.departmentName?.toLowerCase().includes(q) ?? false) ||
        (row.positionName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    processes,
    search,
    department,
    kind,
    status,
    leaveHandling,
    archiveFilter,
  ]);

  const filtersActive =
    Boolean(search.trim()) ||
    Boolean(department) ||
    Boolean(kind) ||
    Boolean(status) ||
    Boolean(leaveHandling) ||
    archiveFilter !== "active";

  function refreshAfterAction() {
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleArchiveToggle(process: OffboardingProcess) {
    setActionId(process.id);
    try {
      const result = isArchived(process)
        ? await unarchiveOffboardingProcess(process.id)
        : await archiveOffboardingProcess(process.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(
        isArchived(process)
          ? `Restored ${process.fullName}'s process.`
          : `Archived ${process.fullName}'s process.`,
      );
      refreshAfterAction();
    } finally {
      setActionId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setActionId(target.id);
    try {
      const result = await deleteOffboardingProcess(target.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(`Deleted ${target.fullName}'s offboarding process.`);
      setDeleteTarget(null);
      refreshAfterAction();
    } finally {
      setActionId(null);
    }
  }

  if (processes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <UserMinus
            className="h-8 w-8 text-[var(--venue-primary,#818a40)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">
            No offboarding processes yet. Start one to track an exit.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
          <Input
            placeholder="Search name, emp no, department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className={selectClass}
          aria-label="Filter by department"
        >
          <option value="">All departments</option>
          {departments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as "" | OffboardingTerminationKind)
          }
          className={selectClass}
          aria-label="Filter by termination type"
        >
          <option value="">All types</option>
          {OFFBOARDING_TERMINATION_KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={leaveHandling}
          onChange={(e) =>
            setLeaveHandling(e.target.value as "" | OffboardingLeaveHandling)
          }
          className={selectClass}
          aria-label="Filter by leave handling"
        >
          <option value="">All leave handling</option>
          <option value="pay_off">Pay off</option>
          <option value="use_on_last_days">Use leave</option>
        </select>
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as "" | OffboardingProcessStatus)
          }
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUS_FILTER_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {OFFBOARDING_PROCESS_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          value={archiveFilter}
          onChange={(e) => setArchiveFilter(e.target.value as ArchiveFilter)}
          className={selectClass}
          aria-label="Filter by archive state"
        >
          <option value="active">Current</option>
          <option value="archived">Archived</option>
          <option value="all">All (incl. archived)</option>
        </select>
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDepartment("");
              setKind("");
              setStatus("");
              setLeaveHandling("");
              setArchiveFilter("active");
            }}
            className="h-10 rounded-md px-3 text-sm font-medium text-black/55 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="text-sm text-black/50">
        {filtered.length} process{filtered.length === 1 ? "" : "es"}
        {filtersActive ? ` of ${processes.length}` : ""}
        {pending ? " · refreshing…" : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-white/40 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No processes match these filters.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 bg-[#f7f6f1] text-[10px] font-semibold uppercase tracking-wide text-black/45">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Notified</th>
                  <th className="px-4 py-3">Last day</th>
                  <th className="px-4 py-3 text-right">AL</th>
                  <th className="px-4 py-3 text-right">PH</th>
                  <th className="px-4 py-3">Leave handling</th>
                  <th className="px-4 py-3 text-right">Settlement</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-3 py-3 text-center">Communications</th>
                  {canManage ? (
                    <th className="px-3 py-3 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const archived = isArchived(row);
                  const busy = actionId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-black/5 last:border-0",
                        archived && "bg-black/[0.02] opacity-80",
                        onOpenProcess
                          ? "cursor-pointer hover:bg-[var(--venue-primary,#818a40)]/[0.06]"
                          : "hover:bg-black/[0.015]",
                      )}
                      onClick={() => onOpenProcess?.(row)}
                      onKeyDown={(e) => {
                        if (!onOpenProcess) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenProcess(row);
                        }
                      }}
                      tabIndex={onOpenProcess ? 0 : undefined}
                      role={onOpenProcess ? "button" : undefined}
                      aria-label={
                        onOpenProcess
                          ? `Open offboarding settings for ${row.fullName}`
                          : undefined
                      }
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-stretch gap-3">
                          <StaffPhotoThumbnail
                            fullName={row.fullName}
                            photoUrl={row.photoUrl}
                            size="fill"
                            className="min-h-14"
                            empNo={row.empNo}
                            department={row.departmentName}
                            position={row.positionName}
                            employeeStatus={row.employmentStatusName}
                            joiningDate={row.joiningDate}
                            terminationDate={row.terminationDate}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-[#3D421F]">
                              {row.fullName}
                              {archived ? (
                                <span className="ml-2 inline-flex rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/45">
                                  Archived
                                </span>
                              ) : null}
                            </p>
                            <div className="mt-0.5 text-xs text-black/45">
                              <StaffDirectoryLink
                                staffId={row.staffId}
                                empNo={row.empNo}
                                onClick={(e) => e.stopPropagation()}
                              />
                              {row.departmentName
                                ? ` · ${row.departmentName}`
                                : ""}
                            </div>
                            {row.positionName ? (
                              <div className="mt-0.5 text-xs text-black/45">
                                {row.positionName}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#3D421F]">
                        {terminationKindLabel(row.terminationKind)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-black/70">
                        {formatDateOnly(row.notificationDate)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-black/70">
                        {formatDateOnly(row.terminationDate)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#3D421F]">
                        {formatDays(row.alBalance)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#3D421F]">
                        {formatDays(row.phBalance)}
                      </td>
                      <td className="px-4 py-3 text-xs text-black/65">
                        {row.leaveHandling === "pay_off"
                          ? "Pay off"
                          : row.leaveEntries.length === 0
                            ? "Use leave"
                            : `Use leave · ${row.leaveEntries.length} entr${row.leaveEntries.length === 1 ? "y" : "ies"}`}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[#3D421F]">
                        {row.leaveHandling === "pay_off"
                          ? formatAed(row.settlement.estimatedTotal)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={row.status} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCommsProcess(row);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors",
                            (sentCounts[row.staffId] ?? 0) > 0
                              ? "text-emerald-700 hover:bg-emerald-50"
                              : "text-[var(--venue-primary,#818a40)] hover:bg-[var(--venue-primary,#818a40)]/10",
                          )}
                          aria-label={`View emails for ${row.fullName}${
                            (sentCounts[row.staffId] ?? 0) > 0
                              ? `, ${sentCounts[row.staffId]} sent`
                              : ""
                          }`}
                          title="Email communications"
                        >
                          <Mail className="h-5 w-5" strokeWidth={2} aria-hidden />
                          <span
                            className={cn(
                              "min-w-[1ch] text-sm font-semibold tabular-nums",
                              (sentCounts[row.staffId] ?? 0) > 0
                                ? "text-emerald-800"
                                : "text-[#3D421F]/70",
                            )}
                          >
                            {sentCounts[row.staffId] ?? 0}
                          </span>
                        </button>
                      </td>
                      {canManage ? (
                        <td className="px-3 py-3">
                          <div
                            className="flex items-center justify-end gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleArchiveToggle(row)}
                              className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
                              title={archived ? "Restore from archive" : "Archive"}
                              aria-label={
                                archived
                                  ? `Restore ${row.fullName}'s process`
                                  : `Archive ${row.fullName}'s process`
                              }
                            >
                              {busy ? (
                                <Loader2
                                  className="h-4 w-4 animate-spin"
                                  aria-hidden
                                />
                              ) : archived ? (
                                <ArchiveRestore className="h-4 w-4" aria-hidden />
                              ) : (
                                <Archive className="h-4 w-4" aria-hidden />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setDeleteTarget(row)}
                              className="rounded-md p-1.5 text-black/45 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                              title="Delete permanently"
                              aria-label={`Delete ${row.fullName}'s process`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {commsProcess ? (
        <EmployeeCommunicationsDialog
          process={commsProcess}
          onClose={() => setCommsProcess(null)}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteProcessDialog
          process={deleteTarget}
          busy={actionId === deleteTarget.id}
          onClose={() => {
            if (actionId === deleteTarget.id) return;
            setDeleteTarget(null);
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </div>
  );
}

function DeleteProcessDialog({
  process,
  busy,
  onClose,
  onConfirm,
}: {
  process: OffboardingProcess;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        disabled={busy}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-delete-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700/80">
              Delete permanently
            </p>
            <h2
              id="ob-delete-title"
              className="mt-0.5 font-serif text-lg text-[#3D421F]"
            >
              Delete {process.fullName}&apos;s process?
            </h2>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-black/65">
          <p>
            This permanently removes the offboarding process for{" "}
            <span className="font-medium text-[#3D421F]">{process.fullName}</span>
            {process.empNo ? ` (${process.empNo})` : ""}.
          </p>
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
            All related email records (drafts, scheduled, and sent) for this
            process will also be deleted. This cannot be undone.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 bg-[#faf9f6] px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
            className="text-[#3D421F]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="bg-rose-700 text-white hover:bg-rose-800 hover:opacity-100"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" aria-hidden />
                Delete process
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmployeeCommunicationsDialog({
  process,
  onClose,
}: {
  process: OffboardingProcess;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<OffboardingNoticeEmailDelivery[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRecords([]);
    setViewingId(null);

    void listBoardingNoticeEmails({
      staffId: process.staffId,
      processId: process.id,
    }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      const sorted = [...result.records].sort(
        (a, b) => recordSortTime(b) - recordSortTime(a),
      );
      setRecords(sorted);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [process.id, process.staffId]);

  const viewing = viewingId
    ? (records.find((r) => r.id === viewingId) ?? null)
    : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          aria-label="Close"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ob-comms-title"
          className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
                Email communications
              </p>
              <h2
                id="ob-comms-title"
                className="mt-0.5 truncate font-serif text-lg text-[#3D421F]"
              >
                {process.fullName}
              </h2>
              <p className="mt-0.5 text-sm text-black/50">
                {process.empNo}
                {process.departmentName ? ` · ${process.departmentName}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-black/50">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading emails…
              </div>
            ) : error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : records.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#d8d9c8] bg-[#faf9f6]/60 px-4 py-10 text-center">
                <Mail
                  className="mx-auto h-7 w-7 text-black/30"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <p className="mt-3 text-sm text-black/55">
                  No draft, scheduled, or sent emails for this employee yet.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {records.map((record) => (
                  <li key={record.id}>
                    <OffboardingNoticeEmailRecordCard
                      record={record}
                      onOpen={() => setViewingId(record.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {viewing ? (
        <OffboardingNoticeEmailRecordViewer
          record={viewing}
          onClose={() => setViewingId(null)}
        />
      ) : null}
    </>
  );
}

function formatDays(n: number): string {
  return `${(Math.round(n * 10) / 10).toLocaleString("en-AE", {
    maximumFractionDigits: 1,
  })} d`;
}

function StatusPill({ status }: { status: OffboardingProcessStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        statusClass(status),
      )}
    >
      {OFFBOARDING_PROCESS_STATUS_LABELS[status]}
    </span>
  );
}

function statusClass(status: OffboardingProcessStatus): string {
  switch (status) {
    case "draft":
      return "bg-black/5 text-black/55";
    case "in_progress":
      return "bg-amber-100 text-amber-900";
    case "settlement_pending":
      return "bg-sky-100 text-sky-900";
    case "completed":
      return "bg-emerald-100 text-emerald-900";
    case "cancelled":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-black/5 text-black/55";
  }
}
