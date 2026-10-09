"use client";

import {
  ArrowLeft,
  BellRing,
  Check,
  ChevronDown,
  Loader2,
  Mail,
  Pencil,
  Search,
  Send,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PolicyProgress, useScoper } from "@/components/hr/policies-list-client";
import { PolicyEditorDialog } from "@/components/hr/policy-editor-dialog";
import { RichDocument } from "@/components/hr/rich-text-editor";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { sendAcknowledgementReminder } from "@/lib/actions/hr-acknowledgements";
import { revalidatePolicies, sendPolicyToEmployee } from "@/lib/actions/hr-policies";
import {
  HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS,
  type HrEmailAcknowledgementStatus,
} from "@/lib/hr/acknowledgement";
import type {
  PolicyRecipientRecord,
  PolicyStaffOption,
  PolicySummary,
} from "@/lib/hr/policies";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

const STATUS_BADGE: Record<HrEmailAcknowledgementStatus, string> = {
  acknowledged: "border-emerald-200 bg-emerald-50 text-emerald-900",
  pending: "border-amber-200 bg-amber-50 text-amber-900",
  not_acknowledged: "border-red-200 bg-red-50 text-red-900",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function PolicyDetailClient({
  policy,
  records,
  staff,
  canManage,
}: {
  policy: PolicySummary;
  records: PolicyRecipientRecord[];
  staff: PolicyStaffOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const scoped = useScoper();
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | HrEmailAcknowledgementStatus>("all");
  const [allVersions, setAllVersions] = useState(false);
  const [reminding, setReminding] = useState<string | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);

  const photoByStaff = useMemo(
    () => new Map(staff.map((s) => [s.id, s.photoUrl])),
    [staff],
  );

  /** Latest status per employee for the current version. */
  const currentStatus = useMemo(() => {
    const map = new Map<string, HrEmailAcknowledgementStatus>();
    for (const record of records) {
      if (record.version !== policy.version || !record.staffId) continue;
      if (!map.has(record.staffId)) map.set(record.staffId, record.status);
    }
    return map;
  }, [records, policy.version]);

  const needle = query.trim().toLowerCase();
  const filtered = records.filter((record) => {
    if (!allVersions && record.version !== policy.version) return false;
    if (status !== "all" && record.status !== status) return false;
    if (!needle) return true;
    return [record.staffName, record.empNo ?? "", record.recipientEmail ?? "", record.comments]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  async function remind(record: PolicyRecipientRecord) {
    setReminding(record.id);
    const result = await sendAcknowledgementReminder(record.id);
    setReminding(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.saved(`Reminder sent to ${result.to}.`);
    router.refresh();
  }

  const { sent, acknowledged, pending, declined } = policy.current;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={scoped("/hr/communications/policies")}
            className="inline-flex items-center gap-1 text-xs font-medium text-black/50 hover:text-[#3D421F]"
          >
            <ArrowLeft className="size-3.5" />
            All policies
          </Link>
          <h2 className="mt-1 font-serif text-2xl text-[#3D421F]">{policy.title}</h2>
          <p className="mt-0.5 text-sm text-black/55">
            Version {policy.version}
            {policy.archived ? " · Archived" : ""}
            {policy.description ? ` · ${policy.description}` : ""}
          </p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1.5 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
              onClick={() => setSending(true)}
              disabled={policy.archived}
              title={policy.archived ? "Restore the policy to send it" : undefined}
            >
              <Send className="size-3.5" />
              Send to employees
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Sent" value={sent} hint={`Employees, version ${policy.version}`} />
        <Stat label="Acknowledged" value={acknowledged} tone="text-emerald-700" />
        <Stat label="Pending" value={pending} tone="text-amber-700" />
        <Stat label="Not acknowledged" value={declined} tone="text-red-700" />
      </div>
      {sent > 0 ? (
        <Card className="p-4">
          <PolicyProgress policy={policy} />
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div
          className={cn(
            "flex items-center justify-between gap-3 bg-[var(--venue-secondary,#F0F3DD)]/60 px-5 py-3",
            documentOpen && "border-b border-black/5",
          )}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
              Policy text · version {policy.version}
            </p>
            <p className="truncate text-sm text-[#3D421F]">Subject: {policy.subject}</p>
          </div>
          <button
            type="button"
            onClick={() => setDocumentOpen((value) => !value)}
            aria-expanded={documentOpen}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#3D421F] hover:underline"
          >
            {documentOpen ? "Hide policy text" : "Show policy text"}
            <ChevronDown
              className={cn("size-3.5 transition-transform", documentOpen && "rotate-180")}
            />
          </button>
        </div>
        {documentOpen ? (
          <div className="px-6 py-5">
            <RichDocument html={policy.message} className="mx-auto max-w-3xl" />
          </div>
        ) : null}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/35" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee, email, comments…"
            className="h-10 pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className={fieldClass}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="not_acknowledged">Not acknowledged</option>
        </select>
        {policy.version > 1 ? (
          <select
            value={allVersions ? "all" : "current"}
            onChange={(e) => setAllVersions(e.target.value === "all")}
            className={fieldClass}
          >
            <option value="current">Version {policy.version}</option>
            <option value="all">All versions</option>
          </select>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 bg-white/60 px-4 py-10 text-center text-sm text-black/50">
          {records.length === 0
            ? "Not sent to anyone yet."
            : "No records match these filters."}
        </p>
      ) : (
        <div className="min-w-0 overflow-auto rounded-xl border border-black/10 bg-white">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Employee</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Sent</th>
                <th className="px-3 py-2.5 font-medium">Responded</th>
                {allVersions ? <th className="px-3 py-2.5 font-medium">Version</th> : null}
                <th className="px-3 py-2.5 font-medium">Comments</th>
                {canManage ? <th className="px-3 py-2.5 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.id} className="border-b border-black/5 align-top last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <StaffPhotoThumbnail
                        photoUrl={record.staffId ? (photoByStaff.get(record.staffId) ?? null) : null}
                        fullName={record.staffName}
                        empNo={record.empNo}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-[#3D421F]">{record.staffName}</p>
                        <p className="text-xs text-black/45">
                          {record.staffId && record.empNo ? (
                            <StaffDirectoryLink staffId={record.staffId} empNo={record.empNo} />
                          ) : (
                            record.empNo
                          )}
                          {record.recipientEmail ? ` · ${record.recipientEmail}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        STATUS_BADGE[record.status],
                      )}
                    >
                      {HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS[record.status]}
                    </span>
                    {record.reminderCount > 0 ? (
                      <span className="ml-1.5 text-[11px] text-black/40">
                        {record.reminderCount} reminder{record.reminderCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-black/60">
                    {formatWhen(record.sentAt)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-black/60">
                    {formatWhen(record.respondedAt)}
                  </td>
                  {allVersions ? (
                    <td className="px-3 py-2.5 text-black/60">v{record.version}</td>
                  ) : null}
                  <td className="min-w-48 max-w-80 px-3 py-2.5 text-black/60">
                    {record.comments || "—"}
                  </td>
                  {canManage ? (
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {record.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() => void remind(record)}
                          disabled={reminding === record.id}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 text-xs font-medium text-[#3D421F] hover:bg-black/5 disabled:opacity-50"
                        >
                          {reminding === record.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <BellRing className="size-3.5" />
                          )}
                          Remind
                        </button>
                      ) : (
                        <span className="text-black/30">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <PolicyEditorDialog
          policy={policy}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.saved("Policy saved.");
            router.refresh();
          }}
        />
      ) : null}

      {sending ? (
        <SendPolicyDialog
          policy={policy}
          staff={staff}
          currentStatus={currentStatus}
          onClose={() => {
            setSending(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "text-[#3D421F]",
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-black/45">{label}</div>
      <div className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</div>
      {hint ? <div className="text-xs text-black/45">{hint}</div> : null}
    </Card>
  );
}

type SendResult = { staffId: string; name: string; ok: boolean; detail: string };

function SendPolicyDialog({
  policy,
  staff,
  currentStatus,
  onClose,
}: {
  policy: PolicySummary;
  staff: PolicyStaffOption[];
  currentStatus: Map<string, HrEmailAcknowledgementStatus>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [departmentFilter, setDepartmentFilter] = useState<Set<string>>(new Set());
  const [hideSent, setHideSent] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"select" | "sending" | "done">("select");
  const [results, setResults] = useState<SendResult[]>([]);
  const [currentName, setCurrentName] = useState("");

  const departments = [
    ...new Set(staff.map((s) => s.department).filter((d): d is string => Boolean(d))),
  ].sort((a, b) => a.localeCompare(b));

  const needle = deferredQuery.trim().toLowerCase();
  const visible = staff.filter((s) => {
    if (hideSent && currentStatus.has(s.id)) return false;
    if (departmentFilter.size > 0 && !departmentFilter.has(s.department ?? "")) return false;
    if (!needle) return true;
    return [s.fullName, s.empNo, s.email ?? "", s.position ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
  const selectable = visible.filter((s) => s.email);
  const allVisibleSelected =
    selectable.length > 0 && selectable.every((s) => selected.has(s.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Everyone with an email (respecting "hide already sent"), ignoring filters. */
  const everyone = staff.filter((s) => s.email && !(hideSent && currentStatus.has(s.id)));
  const everyoneSelected = everyone.length > 0 && everyone.every((s) => selected.has(s.id));

  function toggleEveryone() {
    setSelected(everyoneSelected ? new Set() : new Set(everyone.map((s) => s.id)));
  }

  function toggleDepartment(name: string) {
    setDepartmentFilter((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of selectable) {
        if (allVisibleSelected) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });
  }

  async function sendAll() {
    const queue = staff.filter((s) => selected.has(s.id));
    if (queue.length === 0) return;
    setPhase("sending");
    setResults([]);
    for (const person of queue) {
      setCurrentName(person.fullName);
      let result: SendResult;
      try {
        const res = await sendPolicyToEmployee({ policyId: policy.id, staffId: person.id });
        result = res.ok
          ? { staffId: person.id, name: person.fullName, ok: true, detail: res.to }
          : { staffId: person.id, name: person.fullName, ok: false, detail: res.error };
      } catch (err) {
        result = {
          staffId: person.id,
          name: person.fullName,
          ok: false,
          detail: err instanceof Error ? err.message : "Failed to send.",
        };
      }
      setResults((prev) => [...prev, result]);
    }
    await revalidatePolicies();
    setPhase("done");
  }

  const total = selected.size;
  const doneCount = results.length;
  const failed = results.filter((r) => !r.ok);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (phase !== "sending" && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-policy-title"
        className="flex max-h-[min(92dvh,48rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="border-b border-black/8 px-6 py-4">
          <h2 id="send-policy-title" className="font-serif text-xl text-[#3D421F]">
            {phase === "sending"
              ? "Sending emails…"
              : phase === "done"
                ? failed.length === 0
                  ? "Emails sent"
                  : "Finished with errors"
                : "Send policy"}
          </h2>
          <p className="mt-1 text-sm text-black/55">
            {policy.title} · version {policy.version}
          </p>
        </div>

        {phase === "select" ? (
          <>
            <div className="space-y-3 border-b border-black/8 px-6 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/35" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, emp no, position…"
                  className="h-10 pl-9"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-black/45">
                  Departments
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDepartmentFilter(new Set())}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      departmentFilter.size === 0
                        ? "border-[#3D421F] bg-[#3D421F] text-white"
                        : "border-black/15 bg-white text-black/60 hover:bg-black/5",
                    )}
                  >
                    All
                  </button>
                  {departments.map((d) => {
                    const on = departmentFilter.has(d);
                    const count = staff.filter((s) => s.department === d).length;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDepartment(d)}
                        aria-pressed={on}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium",
                          on
                            ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)] text-white"
                            : "border-black/15 bg-white text-black/60 hover:bg-black/5",
                        )}
                      >
                        {d} <span className={on ? "text-white/75" : "text-black/35"}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <label className="flex items-center gap-2 text-[#3D421F]">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-black/20"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    disabled={selectable.length === 0}
                  />
                  {departmentFilter.size > 0 || needle
                    ? `Select all shown (${selectable.length})`
                    : `Select all listed (${selectable.length})`}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                  onClick={toggleEveryone}
                  disabled={everyone.length === 0}
                >
                  {everyoneSelected ? "Clear selection" : `Select everyone (${everyone.length})`}
                </Button>
                <label className="flex items-center gap-2 text-xs text-black/55">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-black/20"
                    checked={hideSent}
                    onChange={(e) => setHideSent(e.target.checked)}
                  />
                  Hide employees already sent version {policy.version}
                </label>
              </div>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-black/5 overflow-y-auto px-6">
              {visible.length === 0 ? (
                <li className="py-10 text-center text-sm text-black/45">
                  {hideSent && currentStatus.size > 0
                    ? "Everyone shown has already been sent this version."
                    : "No employees match."}
                </li>
              ) : (
                visible.map((s) => {
                  const prior = currentStatus.get(s.id);
                  return (
                    <li key={s.id}>
                      <label
                        className={cn(
                          "flex items-center gap-3 py-2.5",
                          s.email ? "cursor-pointer" : "cursor-not-allowed opacity-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 rounded border-black/20"
                          checked={selected.has(s.id)}
                          onChange={() => toggle(s.id)}
                          disabled={!s.email}
                        />
                        <StaffPhotoThumbnail photoUrl={s.photoUrl} fullName={s.fullName} empNo={s.empNo} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-[#3D421F]">
                            {s.fullName}
                          </span>
                          <span className="block truncate text-xs text-black/45">
                            {[s.empNo, s.position, s.email ?? "No email on record"]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        {prior ? (
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                              STATUS_BADGE[prior],
                            )}
                          >
                            {HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS[prior]}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="flex items-center gap-3 rounded-lg border border-black/8 bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--venue-primary,#818a40)] shadow-sm">
                {phase === "done" ? <Check className="size-5" /> : <Mail className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#3D421F]">
                  {phase === "done"
                    ? `${doneCount - failed.length} of ${total} sent`
                    : `Sending ${Math.min(doneCount + 1, total)} of ${total}…`}
                </p>
                <p className="truncate text-xs text-black/50">
                  {phase === "done" ? "Each email includes an acknowledgement button." : `To ${currentName}`}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                  <div
                    className="h-full rounded-full bg-[var(--venue-primary,#818a40)] transition-[width] duration-500 ease-out"
                    style={{ width: `${total > 0 ? (doneCount / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
            <ul className="space-y-1.5 text-xs">
              {results.map((r) => (
                <li
                  key={r.staffId}
                  className={cn("flex items-start gap-2", r.ok ? "text-[#3D421F]" : "text-red-800")}
                >
                  {r.ok ? (
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-700" strokeWidth={3} />
                  ) : (
                    <XCircle className="mt-0.5 size-3.5 shrink-0" />
                  )}
                  <span>
                    <span className="font-medium">{r.name}</span>{" "}
                    <span className="text-black/50">{r.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {phase === "sending" ? (
              <p className="text-center text-xs text-black/45">
                Please keep this window open until every email is sent.
              </p>
            ) : null}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-black/8 px-6 py-4">
          {phase === "select" ? (
            <>
              <span className="mr-auto text-xs text-black/50">{total} selected</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                onClick={() => void sendAll()}
                disabled={total === 0}
              >
                <Send className="size-3.5" />
                Send to {total} employee{total === 1 ? "" : "s"}
              </Button>
            </>
          ) : phase === "done" ? (
            <Button
              type="button"
              size="sm"
              className="bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
              onClick={onClose}
            >
              Done
            </Button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
