"use client";

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FilePenLine,
  Filter,
  ListOrdered,
  Loader2,
  Mail,
  MessagesSquare,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import {
  getStaffCommunicationDetail,
  getStaffCommunicationThread,
  getStaffCommunicationThreadMessage,
  listStaffCommunications,
  type StaffCommunicationDetail,
  type StaffCommunicationItem,
  type StaffCommunicationKind,
  type StaffThreadMessageHeader,
} from "@/lib/actions/hr-staff-communications";
import { emailTemplateBodyToSafeFragment } from "@/lib/hr/email-message-format";
import { cn } from "@/lib/utils";

const LIST_CACHE_TTL_MS = 30_000;
const listCache = new Map<
  string,
  { at: number; items: StaffCommunicationItem[] }
>();
const inFlightLists = new Map<
  string,
  Promise<
    | { ok: true; items: StaffCommunicationItem[] }
    | { ok: false; error: string }
  >
>();

function formatWhenParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: "—", time: "" };
  }
  return {
    date: d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function formatWhenFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function kindBadgeClass(kind: StaffCommunicationKind): string {
  switch (kind) {
    case "boarding_email":
      return "bg-amber-50 text-amber-900 border-amber-200/80";
    case "payslip_email":
      return "bg-[var(--venue-secondary,#F0F3DD)]/80 text-[#3D421F] border-black/10";
    case "work_anniversary_email":
      return "bg-[var(--venue-primary,#6B7B3A)]/15 text-[#3D421F] border-[var(--venue-primary,#6B7B3A)]/25";
    case "updated_docs_request_email":
      return "bg-sky-50 text-sky-950 border-sky-200/80";
    case "uniform_terms_email":
      return "bg-violet-50 text-violet-950 border-violet-200/80";
    case "uniform_replacement_email":
      return "bg-orange-50 text-orange-950 border-orange-200/80";
    case "hub_invite_email":
      return "bg-slate-100 text-slate-800 border-slate-200/80";
    case "inbound_reply":
      return "bg-emerald-50 text-emerald-900 border-emerald-200/80";
  }
}

function kindShortLabel(kind: StaffCommunicationKind): string {
  switch (kind) {
    case "boarding_email":
      return "Boarding";
    case "payslip_email":
      return "Payslip";
    case "work_anniversary_email":
      return "Anniversary";
    case "updated_docs_request_email":
      return "Docs request";
    case "uniform_terms_email":
      return "Uniform";
    case "uniform_replacement_email":
      return "Uniform replace";
    case "hub_invite_email":
      return "Invite";
    case "inbound_reply":
      return "Reply";
  }
}

function statusLabel(status: string | null): string | null {
  if (!status) return null;
  const normalized = status.replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function statusClass(status: string | null): string {
  switch (status) {
    case "sent":
    case "received":
      return "text-emerald-800";
    case "failed":
    case "bounced":
      return "text-red-700";
    case "scheduled":
    case "queued":
      return "text-amber-800";
    case "draft":
      return "text-black/45";
    default:
      return "text-black/50";
  }
}

function CommunicationRow({
  item,
  onOpen,
  onOpenReplies,
}: {
  item: StaffCommunicationItem;
  onOpen: () => void;
  onOpenReplies?: () => void;
}) {
  const when = formatWhenParts(item.occurredAt);
  const status = statusLabel(item.status);
  const threadSize = item.threadSize > 0 ? item.threadSize : 0;
  const replyCount = Math.max(0, threadSize - 1);

  return (
    <li className="relative pl-6">
      <span
        className="absolute left-0 top-2.5 size-2.5 rounded-full border-2 border-white bg-[var(--venue-primary,#6B7B3A)] shadow-sm ring-1 ring-black/10"
        aria-hidden
      />
      <div className="flex w-full items-start gap-2 rounded-lg border border-black/8 bg-white/70 px-3 py-2.5 transition hover:border-black/15 hover:bg-white">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                kindBadgeClass(item.kind),
              )}
            >
              {kindShortLabel(item.kind)}
            </span>
            {status ? (
              <span
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wide",
                  statusClass(item.status),
                )}
              >
                {status}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-medium text-[#3D421F]">
            {item.title}
          </p>
          {item.subject ? (
            <p className="mt-0.5 truncate text-xs text-black/55">
              {item.subject}
            </p>
          ) : null}
          {item.to ? (
            <p className="mt-0.5 truncate text-[11px] text-black/45">
              To {item.to}
            </p>
          ) : null}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1.5 leading-tight">
          <div className="text-right">
            <p className="text-[11px] font-medium tabular-nums text-[#3D421F]">
              {when.date}
            </p>
            {when.time ? (
              <p className="mt-0.5 text-[10px] tabular-nums text-black/45">
                {when.time}
              </p>
            ) : null}
          </div>
          {replyCount > 0 ? (
            <button
              type="button"
              onClick={onOpenReplies}
              className="inline-flex items-center gap-1 rounded border border-[var(--venue-primary,#6B7B3A)]/30 bg-[var(--venue-primary,#6B7B3A)]/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[#3D421F] transition hover:bg-[var(--venue-primary,#6B7B3A)]/20"
              title={`Open ${replyCount} employee ${replyCount === 1 ? "reply" : "replies"}`}
            >
              <MessagesSquare className="h-3 w-3" strokeWidth={2.25} aria-hidden />
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function CommunicationDetailDialog({
  itemId,
  initialFocus,
  onClose,
}: {
  itemId: string;
  /** When "reply", open on the latest employee reply if the thread has one. */
  initialFocus?: "outbound" | "reply";
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<StaffCommunicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<StaffThreadMessageHeader[]>([]);
  const [threadIndex, setThreadIndex] = useState(0);
  const [bodyPending, setBodyPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    setThread([]);
    setThreadIndex(0);
    startTransition(() => {
      void (async () => {
        const [detailResult, threadResult] = await Promise.all([
          getStaffCommunicationDetail({ id: itemId }),
          getStaffCommunicationThread({ communicationId: itemId }),
        ]);
        if (cancelled) return;
        if (!detailResult.ok) {
          setError(detailResult.error);
          return;
        }

        const messages =
          threadResult.ok && threadResult.messages.length > 0
            ? threadResult.messages
            : [];
        setThread(messages);

        let startIndex = 0;
        if (messages.length > 0) {
          if (initialFocus === "reply") {
            // Latest inbound reply; fall back to last message.
            let latestReply = -1;
            for (let i = 0; i < messages.length; i++) {
              if (messages[i]?.direction === "inbound") latestReply = i;
            }
            startIndex = latestReply >= 0 ? latestReply : messages.length - 1;
          } else {
            const outboundIdx = messages.findIndex(
              (m) => m.direction === "outbound",
            );
            startIndex = outboundIdx >= 0 ? outboundIdx : 0;
          }
          setThreadIndex(startIndex);

          const startMsg = messages[startIndex];
          if (startMsg && (initialFocus === "reply" || startMsg.direction === "inbound")) {
            const bodyResult = await getStaffCommunicationThreadMessage({
              messageId: startMsg.id,
            });
            if (cancelled) return;
            if (bodyResult.ok) {
              setDetail(bodyResult.detail);
              return;
            }
          }
        }

        setDetail(detailResult.detail);
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [itemId, initialFocus]);

  function loadThreadMessage(nextIndex: number) {
    const header = thread[nextIndex];
    if (!header) return;
    setThreadIndex(nextIndex);
    setBodyPending(true);
    setError(null);
    void getStaffCommunicationThreadMessage({ messageId: header.id }).then(
      (result) => {
        setBodyPending(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDetail(result.detail);
      },
    );
  }

  const status = statusLabel(detail?.status ?? null);
  const displayKind =
    detail?.direction === "inbound" ? "inbound_reply" : (detail?.kind ?? null);
  const hasThreadNav = thread.length > 1;
  const currentHeader = thread[threadIndex] ?? null;
  const threadLabel =
    currentHeader?.direction === "inbound"
      ? `Reply ${thread.filter((m, i) => m.direction === "inbound" && i <= threadIndex).length} of ${thread.filter((m) => m.direction === "inbound").length}`
      : "Original email";

  return createPortal(
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
        aria-labelledby="staff-comms-detail-title"
        className="flex max-h-[min(92dvh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
              {hasThreadNav
                ? threadLabel
                : detail?.direction === "inbound"
                  ? "Reply"
                  : "Email record"}
            </p>
            <h2
              id="staff-comms-detail-title"
              className="mt-0.5 font-serif text-lg text-[#3D421F]"
            >
              {detail?.title ?? (pending ? "Loading…" : "Communication")}
            </h2>
            {detail ? (
              <p className="mt-0.5 text-sm text-black/50">
                {formatWhenFull(detail.occurredAt)}
                {status ? ` · ${status}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {hasThreadNav ? (
              <div className="mr-1 flex items-center gap-0.5 rounded-md border border-black/10 bg-black/[0.02] p-0.5">
                <button
                  type="button"
                  className="rounded p-1.5 text-black/55 transition hover:bg-white hover:text-[#3D421F] disabled:opacity-30"
                  disabled={threadIndex <= 0 || bodyPending}
                  onClick={() => loadThreadMessage(threadIndex - 1)}
                  aria-label="Previous message in thread"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[4.5rem] px-0.5 text-center text-[11px] font-semibold tabular-nums text-[#3D421F]">
                  {threadIndex + 1} / {thread.length}
                </span>
                <button
                  type="button"
                  className="rounded p-1.5 text-black/55 transition hover:bg-white hover:text-[#3D421F] disabled:opacity-30"
                  disabled={threadIndex >= thread.length - 1 || bodyPending}
                  onClick={() => loadThreadMessage(threadIndex + 1)}
                  aria-label="Next message in thread"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {(pending || bodyPending) && !detail ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-black/50">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading message…
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {detail ? (
            <>
              {bodyPending ? (
                <div className="flex items-center gap-2 text-xs text-black/45">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Loading message body…
                </div>
              ) : null}
              <dl className="grid gap-3 rounded-lg border border-black/10 bg-[#faf9f6] px-3 py-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-black/45">Type</dt>
                  <dd className="mt-0.5 text-[#3D421F]">
                    {displayKind ? (
                      <span
                        className={cn(
                          "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          kindBadgeClass(displayKind),
                        )}
                      >
                        {kindShortLabel(displayKind)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-black/45">Status</dt>
                  <dd
                    className={cn(
                      "mt-0.5 font-medium",
                      statusClass(detail.status),
                    )}
                  >
                    {status ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-black/45">
                    {detail.direction === "inbound" ? "From" : "To"}
                  </dt>
                  <dd className="mt-0.5 break-all text-[#3D421F]">
                    {detail.direction === "inbound"
                      ? detail.fromEmail?.trim() || (
                          <span className="text-black/40">—</span>
                        )
                      : detail.to?.trim() || (
                          <span className="text-black/40">—</span>
                        )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-black/45">
                    {detail.direction === "inbound" ? "To" : "From"}
                  </dt>
                  <dd className="mt-0.5 break-all text-[#3D421F]">
                    {detail.direction === "inbound"
                      ? detail.to?.trim() || (
                          <span className="text-black/40">—</span>
                        )
                      : detail.fromEmail?.trim() || (
                          <span className="text-black/40">
                            Email config default
                          </span>
                        )}
                  </dd>
                </div>
                {detail.templateName ? (
                  <div>
                    <dt className="text-xs text-black/45">Template</dt>
                    <dd className="mt-0.5 text-[#3D421F]">
                      {detail.templateName}
                    </dd>
                  </div>
                ) : null}
                {detail.provider ? (
                  <div>
                    <dt className="text-xs text-black/45">Provider</dt>
                    <dd className="mt-0.5 text-[#3D421F]">{detail.provider}</dd>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <dt className="text-xs text-black/45">Subject</dt>
                  <dd className="mt-0.5 text-[#3D421F]">
                    {detail.subject?.trim() || (
                      <span className="text-black/40">No subject</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-black/45">
                  Message
                </p>
                {detail.hasMessageBody && detail.message ? (
                  <div
                    className="rounded-lg border border-black/10 bg-white px-3 py-3 text-sm leading-relaxed text-[#3D421F] [&_a]:text-[var(--venue-primary,#6B7B3A)] [&_a]:underline"
                    dangerouslySetInnerHTML={{
                      __html: emailTemplateBodyToSafeFragment(detail.message),
                    }}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-black/10 bg-black/[0.02] px-3 py-4 text-sm text-black/50">
                    {detail.detailNote ?? "No message body on file."}
                  </div>
                )}
              </div>

              {detail.detailNote && detail.hasMessageBody ? (
                <p className="text-xs text-black/45">{detail.detailNote}</p>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-black/8 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-black/15 bg-white px-3 py-1.5 text-sm font-medium text-[#3D421F] transition hover:bg-black/5"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const KIND_FILTERS: Array<{
  id: "all" | StaffCommunicationKind;
  label: string;
}> = [
  { id: "all", label: "All types" },
  { id: "boarding_email", label: "Boarding" },
  { id: "payslip_email", label: "Payslip" },
  { id: "work_anniversary_email", label: "Anniversary" },
  { id: "updated_docs_request_email", label: "Docs request" },
  { id: "uniform_terms_email", label: "Uniform" },
  { id: "uniform_replacement_email", label: "Uniform replace" },
  { id: "hub_invite_email", label: "Invite" },
  { id: "inbound_reply", label: "Reply" },
];

const STATUS_FILTERS: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "all", label: "All statuses", icon: Filter },
  { id: "sent", label: "Sent", icon: Check },
  { id: "received", label: "Received", icon: Mail },
  { id: "scheduled", label: "Scheduled", icon: Clock3 },
  { id: "queued", label: "Queued", icon: ListOrdered },
  { id: "draft", label: "Draft", icon: FilePenLine },
  { id: "failed", label: "Failed", icon: XCircle },
  { id: "bounced", label: "Bounced", icon: AlertTriangle },
];

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition",
        active
          ? "border-[var(--venue-primary,#6B7B3A)]/40 bg-[var(--venue-primary,#6B7B3A)]/15 text-[#3D421F]"
          : "border-black/10 bg-white/70 text-black/50 hover:bg-black/5 hover:text-[#3D421F]",
      )}
    >
      {label}
    </button>
  );
}

function StatusIconFilter({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md border transition",
        active
          ? "border-[var(--venue-primary,#6B7B3A)]/40 bg-[var(--venue-primary,#6B7B3A)]/15 text-[#3D421F]"
          : "border-black/10 bg-white/70 text-black/45 hover:bg-black/5 hover:text-[#3D421F]",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
    </button>
  );
}

export function StaffCommunicationsTrail({
  staffId,
}: {
  staffId: string | null | undefined;
}) {
  const [loading, setLoading] = useState(Boolean(staffId));
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StaffCommunicationItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openFocus, setOpenFocus] = useState<"outbound" | "reply">("outbound");
  const [kindFilter, setKindFilter] = useState<"all" | StaffCommunicationKind>(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (!staffId) {
      setLoading(false);
      setError(null);
      setItems([]);
      setOpenId(null);
      return;
    }

    let cancelled = false;
    const cached = listCache.get(staffId);
    if (cached && Date.now() - cached.at < LIST_CACHE_TTL_MS) {
      setItems(cached.items);
      setLoading(false);
      setError(null);
    } else {
      setItems([]);
      setLoading(true);
      setError(null);
    }

    let request = inFlightLists.get(staffId);
    if (!request) {
      request = listStaffCommunications({ staffId }).finally(() => {
        inFlightLists.delete(staffId);
      });
      inFlightLists.set(staffId, request);
    }

    void request.then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        if (!(cached && Date.now() - cached.at < LIST_CACHE_TTL_MS)) {
          setItems([]);
        }
        setLoading(false);
        return;
      }
      listCache.set(staffId, { at: Date.now(), items: result.items });
      setItems(result.items);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [staffId]);

  const availableStatuses = (() => {
    const present = new Set<string>();
    for (const item of items) {
      if (item.status) present.add(item.status);
    }
    return STATUS_FILTERS.filter(
      (f) => f.id === "all" || present.has(f.id),
    );
  })();

  const availableKinds = (() => {
    const present = new Set<StaffCommunicationKind>();
    for (const item of items) present.add(item.kind);
    return KIND_FILTERS.filter(
      (f) => f.id === "all" || present.has(f.id),
    );
  })();

  const filteredItems = items.filter((item) => {
    if (kindFilter !== "all" && item.kind !== kindFilter) return false;
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    return true;
  });

  if (!staffId) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <Mail className="h-7 w-7 text-black/30" strokeWidth={1.5} aria-hidden />
        <p className="font-serif text-lg text-[#3D421F]">Communications</p>
        <p className="max-w-md text-sm text-black/50">
          Save this employee first to see their email trail.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex w-full flex-col p-5">
        <div className="mb-3 flex items-center gap-2">
          <Mail
            className="h-3.5 w-3.5 text-[#3D421F]/70"
            strokeWidth={2}
            aria-hidden
          />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#3D421F]">
            Communications trail
          </h3>
          {!error && items.length > 0 ? (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] tabular-nums text-black/45">
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : null}
              {filteredItems.length}
              {filteredItems.length !== items.length
                ? ` of ${items.length}`
                : ""}{" "}
              item{filteredItems.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {items.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-black/8 pb-4">
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Filter by type"
            >
              {availableKinds.map((filter) => (
                <FilterPill
                  key={filter.id}
                  label={filter.label}
                  active={kindFilter === filter.id}
                  onClick={() => setKindFilter(filter.id)}
                />
              ))}
            </div>
            {availableStatuses.length > 1 ? (
              <div
                className="ml-auto flex flex-wrap justify-end gap-1.5"
                role="group"
                aria-label="Filter by status"
              >
                {availableStatuses.map((filter) => (
                  <StatusIconFilter
                    key={filter.id}
                    label={filter.label}
                    icon={filter.icon}
                    active={statusFilter === filter.id}
                    onClick={() => setStatusFilter(filter.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-black/50">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading communications…
          </div>
        ) : error && items.length === 0 ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/10 bg-black/[0.02] px-4 py-10 text-center">
            <Mail
              className="mx-auto h-7 w-7 text-black/30"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="mt-3 text-sm text-black/55">
              No emails sent to this employee yet.
            </p>
            <p className="mt-1 text-xs text-black/40">
              Boarding, payslip, anniversary, docs, uniform, and invite emails
              appear here. Replies show on the original message once synced.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-black/10 bg-black/[0.02] px-4 py-8 text-center">
            <p className="text-sm text-black/55">
              No communications match these filters.
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-[var(--venue-primary,#6B7B3A)] underline-offset-2 hover:underline"
              onClick={() => {
                setKindFilter("all");
                setStatusFilter("all");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <ol className="relative space-y-2.5 before:absolute before:bottom-2 before:left-[4px] before:top-2 before:w-px before:bg-black/10">
            {filteredItems.map((item) => (
              <CommunicationRow
                key={item.id}
                item={item}
                onOpen={() => {
                  setOpenFocus("outbound");
                  setOpenId(item.id);
                }}
                onOpenReplies={() => {
                  setOpenFocus("reply");
                  setOpenId(item.id);
                }}
              />
            ))}
          </ol>
        )}
      </Card>

      {openId && typeof document !== "undefined" ? (
        <CommunicationDetailDialog
          itemId={openId}
          initialFocus={openFocus}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
