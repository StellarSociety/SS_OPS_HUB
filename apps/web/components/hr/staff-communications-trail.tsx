"use client";

import {
  AlertTriangle,
  Check,
  Clock3,
  FilePenLine,
  Filter,
  ListOrdered,
  Loader2,
  Mail,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import {
  getStaffCommunicationDetail,
  listStaffCommunications,
  type StaffCommunicationDetail,
  type StaffCommunicationItem,
  type StaffCommunicationKind,
} from "@/lib/actions/hr-staff-communications";
import { emailTemplateBodyToSafeFragment } from "@/lib/hr/email-message-format";
import { cn } from "@/lib/utils";

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
}: {
  item: StaffCommunicationItem;
  onOpen: () => void;
}) {
  const when = formatWhenParts(item.occurredAt);
  const status = statusLabel(item.status);

  return (
    <li className="relative pl-6">
      <span
        className="absolute left-0 top-2.5 size-2.5 rounded-full border-2 border-white bg-[var(--venue-primary,#6B7B3A)] shadow-sm ring-1 ring-black/10"
        aria-hidden
      />
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded-lg border border-black/8 bg-white/70 px-3 py-2.5 text-left transition hover:border-black/15 hover:bg-white"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
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
          </div>
          <div className="shrink-0 text-right leading-tight">
            <p className="text-[11px] font-medium tabular-nums text-[#3D421F]">
              {when.date}
            </p>
            {when.time ? (
              <p className="mt-0.5 text-[10px] tabular-nums text-black/45">
                {when.time}
              </p>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

function CommunicationDetailDialog({
  itemId,
  onClose,
}: {
  itemId: string;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<StaffCommunicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    startTransition(() => {
      void getStaffCommunicationDetail({ id: itemId }).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDetail(result.detail);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const status = statusLabel(detail?.status ?? null);

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
              Email record
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
          <button
            type="button"
            className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {pending && !detail ? (
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
              <dl className="grid gap-3 rounded-lg border border-black/10 bg-[#faf9f6] px-3 py-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-black/45">Type</dt>
                  <dd className="mt-0.5 text-[#3D421F]">
                    <span
                      className={cn(
                        "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        kindBadgeClass(detail.kind),
                      )}
                    >
                      {kindShortLabel(detail.kind)}
                    </span>
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
                  <dt className="text-xs text-black/45">To</dt>
                  <dd className="mt-0.5 break-all text-[#3D421F]">
                    {detail.to?.trim() || (
                      <span className="text-black/40">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-black/45">From</dt>
                  <dd className="mt-0.5 break-all text-[#3D421F]">
                    {detail.fromEmail?.trim() || (
                      <span className="text-black/40">
                        Connection / Transport default
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
];

const STATUS_FILTERS: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "all", label: "All statuses", icon: Filter },
  { id: "sent", label: "Sent", icon: Check },
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
    setLoading(true);
    setError(null);

    void listStaffCommunications({ staffId }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setItems([]);
        setLoading(false);
        return;
      }
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
          {!loading && !error ? (
            <span className="ml-auto text-[11px] tabular-nums text-black/45">
              {filteredItems.length}
              {filteredItems.length !== items.length
                ? ` of ${items.length}`
                : ""}{" "}
              item{filteredItems.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {!loading && !error && items.length > 0 ? (
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

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-black/50">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading communications…
          </div>
        ) : error ? (
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
              Boarding, payslip, anniversary, and docs-request emails will appear
              here by date and time.
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
                onOpen={() => setOpenId(item.id)}
              />
            ))}
          </ol>
        )}
      </Card>

      {openId && typeof document !== "undefined" ? (
        <CommunicationDetailDialog
          itemId={openId}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
