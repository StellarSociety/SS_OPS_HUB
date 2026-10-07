"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowRight,
  Banknote,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ImageDown,
  Loader2,
  Search,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { StatusBadge } from "@/components/hr/status-badge";
import { toast } from "@/components/ui/toast";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import {
  buildPromotionsSnapshotFilename,
  downloadElementAsPng,
} from "@/lib/hr/promotions-snapshot";
import type {
  PathChangeKind,
  PromotionItem,
  PromotionStatus,
} from "@/lib/hr/promotions";
import { cn } from "@/lib/utils";

const filterFieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

type StatusFilter = "all" | PromotionStatus;

type View = "promotions" | "position" | "salary";

const VIEWS: {
  value: View;
  label: string;
  icon: LucideIcon;
  match: (item: PromotionItem) => boolean;
  /** Plural noun for counts and empty states. */
  noun: string;
  doneLabel: string;
}[] = [
  {
    value: "promotions",
    label: "Promotions",
    icon: TrendingUp,
    match: (i) => i.isPromotion,
    noun: "promotions",
    doneLabel: "Promoted",
  },
  {
    value: "position",
    label: "Position changes",
    icon: Briefcase,
    match: (i) => i.changeKind === "position" || i.changeKind === "both",
    noun: "position changes",
    doneLabel: "Applied",
  },
  {
    value: "salary",
    label: "Salary changes",
    icon: Banknote,
    match: (i) => i.changeKind === "salary" || i.changeKind === "both",
    noun: "salary changes",
    doneLabel: "Applied",
  },
];

const KIND_BADGE: Record<PathChangeKind, { label: string; className: string }> =
  {
    position: {
      label: "Position",
      className: "border-sky-200/80 bg-sky-50 text-sky-950",
    },
    salary: {
      label: "Salary",
      className: "border-emerald-200/80 bg-emerald-50 text-emerald-950",
    },
    both: {
      label: "Position & salary",
      className:
        "border-[var(--venue-primary)]/25 bg-[var(--venue-primary)]/10 text-[#3D421F]",
    },
  };

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
];

function daysUntil(iso: string, todayIso: string): number {
  const ms =
    Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function RoleCell({
  position,
  department,
}: {
  position: string | null;
  department: string | null;
}) {
  return (
    <div className="leading-tight">
      <div className="text-[#3D421F]">{position ?? "—"}</div>
      {department ? (
        <div className="text-xs text-black/45">{department}</div>
      ) : null}
    </div>
  );
}

function SalaryCell({ item }: { item: PromotionItem }) {
  const { fromWagePackage: from, toWagePackage: to } = item;
  if (from == null && to == null)
    return <span className="text-black/40">—</span>;
  const pct =
    from != null && to != null && from > 0
      ? Math.round(((to - from) / from) * 1000) / 10
      : null;
  return (
    <div className="leading-tight tabular-nums">
      <div className="flex items-center gap-1.5">
        <span className="text-black/50">{formatAed(from)}</span>
        <ArrowRight className="h-3 w-3 text-black/30" />
        <span className="font-medium text-[#3D421F]">{formatAed(to)}</span>
      </div>
      {pct != null && pct !== 0 ? (
        <div
          className={cn("text-xs", pct > 0 ? "text-green-700" : "text-red-700")}
        >
          {pct > 0 ? "+" : ""}
          {pct}%
        </div>
      ) : null}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--venue-secondary)] text-[var(--venue-primary)]">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-black/45">
          {label}
        </div>
        <div className="text-xl font-semibold tabular-nums text-[#3D421F]">
          {value}
        </div>
        <div className="text-xs text-black/45">{hint}</div>
      </div>
    </Card>
  );
}

/** Initials fallback keeps the snapshot clean when a photo cannot load. */
function SnapshotAvatar({
  fullName,
  photoUrl,
}: {
  fullName: string;
  photoUrl: string | null;
}) {
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-[#3D421F] text-[10px] font-medium text-white">
      {initials}
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- rasterized by html2canvas
        <img
          src={photoUrl}
          alt=""
          crossOrigin="anonymous"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}

function PromotionsTable({
  rows,
  todayIso,
  activeView,
  showRoles,
  showSalary,
  snapshot = false,
}: {
  rows: PromotionItem[];
  todayIso: string;
  activeView: (typeof VIEWS)[number];
  showRoles: boolean;
  showSalary: boolean;
  /** Static rendering for the PNG export: no links, sticky header, or lightbox. */
  snapshot?: boolean;
}) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead
        className={
          snapshot
            ? "bg-[var(--venue-secondary)]"
            : "sticky top-0 z-10 bg-[var(--venue-secondary)]/60 backdrop-blur"
        }
      >
        <tr className="text-xs font-semibold uppercase tracking-wide text-black/60">
          <th className="border-b border-black/10 px-3 py-2">Status</th>
          <th className="border-b border-black/10 px-3 py-2">Effective</th>
          <th className="border-b border-black/10 px-3 py-2">Emp no</th>
          <th className="border-b border-black/10 px-3 py-2">Employee</th>
          <th className="border-b border-black/10 px-3 py-2">Change</th>
          {showRoles ? (
            <>
              <th className="border-b border-black/10 px-3 py-2">From</th>
              <th className="border-b border-black/10 px-3 py-2">To</th>
            </>
          ) : (
            <th className="border-b border-black/10 px-3 py-2">Position</th>
          )}
          {showSalary ? (
            <th className="border-b border-black/10 px-3 py-2">Wage package</th>
          ) : null}
          <th className="border-b border-black/10 px-3 py-2">Reason</th>
          <th className="border-b border-black/10 px-3 py-2">Notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => {
          const days = daysUntil(item.effectiveDate, todayIso);
          return (
            <tr
              key={item.id}
              className="border-b border-black/5 align-top hover:bg-[var(--venue-secondary)]/30"
            >
              <td className="whitespace-nowrap px-3 py-2">
                {item.status === "scheduled" ? (
                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    Scheduled
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-green-200 bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    {activeView.doneLabel}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-black/70">
                <div>{formatDateOnly(item.effectiveDate)}</div>
                {item.status === "scheduled" ? (
                  <div className="text-xs text-amber-700">
                    in {days} day{days === 1 ? "" : "s"}
                  </div>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                {snapshot ? (
                  <span className="font-mono text-xs text-[var(--venue-primary,#818a40)]">
                    {item.empNo}
                  </span>
                ) : (
                  <StaffDirectoryLink
                    staffId={item.staffId}
                    empNo={item.empNo}
                  />
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <div className="flex items-center gap-2">
                  {snapshot ? (
                    <SnapshotAvatar
                      fullName={item.fullName}
                      photoUrl={item.photoUrl}
                    />
                  ) : (
                    <StaffPhotoThumbnail
                      fullName={item.fullName}
                      photoUrl={item.photoUrl}
                      size="sm"
                      className="h-8 w-8 rounded-full"
                      empNo={item.empNo}
                      position={item.toPositionName}
                      department={item.toDepartmentName}
                      employeeStatus={item.employmentStatus}
                    />
                  )}
                  <div className="leading-tight">
                    <div className="font-medium text-[#3D421F]">
                      {item.fullName}
                    </div>
                    <StatusBadge
                      status={item.employmentStatus}
                      className="mt-0.5 px-2 py-0 text-[10px]"
                    />
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                <span
                  className={cn(
                    "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    KIND_BADGE[item.changeKind].className,
                  )}
                >
                  {KIND_BADGE[item.changeKind].label}
                </span>
                {item.isPromotion && activeView.value !== "promotions" ? (
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                    Promotion
                  </div>
                ) : null}
              </td>
              {showRoles ? (
                <>
                  <td className="whitespace-nowrap px-3 py-2">
                    <RoleCell
                      position={item.fromPositionName}
                      department={item.fromDepartmentName}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <RoleCell
                      position={
                        item.toPositionName ??
                        item.fromPositionName ??
                        item.currentPositionName
                      }
                      department={
                        item.toDepartmentName ??
                        item.fromDepartmentName ??
                        item.currentDepartmentName
                      }
                    />
                  </td>
                </>
              ) : (
                <td className="whitespace-nowrap px-3 py-2">
                  <RoleCell
                    position={item.toPositionName ?? item.currentPositionName}
                    department={
                      item.toDepartmentName ?? item.currentDepartmentName
                    }
                  />
                </td>
              )}
              {showSalary ? (
                <td className="whitespace-nowrap px-3 py-2">
                  <SalaryCell item={item} />
                </td>
              ) : null}
              <td className="min-w-40 px-3 py-2 text-black/70">
                {item.reason || "—"}
              </td>
              <td className="min-w-48 max-w-80 px-3 py-2 text-black/55">
                {item.notes || "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function StaffPromotions({
  items,
  todayIso,
  canViewSalary,
  venueName,
  logoUrl,
}: {
  items: PromotionItem[];
  todayIso: string;
  canViewSalary: boolean;
  venueName: string;
  logoUrl: string | null;
}) {
  const snapshotRef = useRef<HTMLDivElement>(null);
  const [snapshotting, setSnapshotting] = useState(false);
  const [view, setView] = useState<View>("promotions");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [department, setDepartment] = useState("");

  const views = canViewSalary
    ? VIEWS
    : VIEWS.filter((v) => v.value !== "salary");
  const activeView = views.find((v) => v.value === view) ?? views[0];
  const viewItems = items.filter(activeView.match);
  const showRoles = activeView.value !== "salary";
  const showSalary = canViewSalary && activeView.value !== "position";

  const departments = [
    ...new Set(
      viewItems.flatMap((i) =>
        [
          i.toDepartmentName,
          i.fromDepartmentName,
          i.currentDepartmentName,
        ].filter((d): d is string => Boolean(d)),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));

  const yearStart = `${todayIso.slice(0, 4)}-01-01`;
  const counts = {
    scheduled: viewItems.filter((i) => i.status === "scheduled").length,
    completed: viewItems.filter((i) => i.status === "completed").length,
    thisYear: viewItems.filter(
      (i) => i.status === "completed" && i.effectiveDate >= yearStart,
    ).length,
  };

  const q = search.trim().toLowerCase();
  const filtered = viewItems
    .filter((i) => status === "all" || i.status === status)
    .filter(
      (i) =>
        !department ||
        i.toDepartmentName === department ||
        i.fromDepartmentName === department ||
        (!i.toDepartmentName && i.currentDepartmentName === department),
    )
    .filter(
      (i) =>
        !q ||
        i.fullName.toLowerCase().includes(q) ||
        i.empNo.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      // Upcoming first (soonest on top), then history (most recent on top).
      if (a.status !== b.status) return a.status === "scheduled" ? -1 : 1;
      return a.status === "scheduled"
        ? a.effectiveDate.localeCompare(b.effectiveDate)
        : b.effectiveDate.localeCompare(a.effectiveDate);
    });

  const anyFilter = Boolean(search || department || status !== "all");

  const statusLabel =
    STATUS_FILTERS.find((f) => f.value === status)?.label ?? "All";
  const snapshotSubtitle = [
    activeView.label,
    status === "all" ? "All statuses" : statusLabel,
    department || "All departments",
    q ? `Search: "${search.trim()}"` : null,
    `${filtered.length} record${filtered.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  async function downloadSnapshot() {
    if (snapshotting || filtered.length === 0) return;
    // Mount the off-screen layout synchronously so it can be captured now.
    flushSync(() => setSnapshotting(true));
    try {
      const node = snapshotRef.current;
      if (!node) throw new Error("Snapshot is not ready.");
      await downloadElementAsPng(
        node,
        buildPromotionsSnapshotFilename(
          venueName,
          `promotions-demotions ${activeView.label}`,
          todayIso,
        ),
      );
      toast.saved("Snapshot downloaded.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create the snapshot.",
      );
    } finally {
      setSnapshotting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Change type"
        className="inline-flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/60 p-1"
      >
        {views.map((v) => {
          const Icon = v.icon;
          const active = v.value === activeView.value;
          const count = items.filter(v.match).length;
          return (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setView(v.value);
                setDepartment("");
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-[var(--venue-secondary)] font-medium text-[#3D421F]"
                  : "text-black/55 hover:bg-black/5",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {v.label}
              <span className="rounded-full bg-black/5 px-1.5 text-xs tabular-nums text-black/55">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryTile
          icon={CalendarClock}
          label="Scheduled"
          value={counts.scheduled}
          hint="Effective date still ahead"
        />
        <SummaryTile
          icon={CheckCircle2}
          label={activeView.doneLabel}
          value={counts.completed}
          hint={`All recorded ${activeView.noun}`}
        />
        <SummaryTile
          icon={TrendingUp}
          label={`In ${todayIso.slice(0, 4)}`}
          value={counts.thisYear}
          hint="Completed this calendar year"
        />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Search &amp; filter
          </h3>
          {anyFilter ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setDepartment("");
                setStatus("all");
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-black/50 transition-colors hover:text-[#3D421F]"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
            <input
              placeholder="Search by name or emp no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(filterFieldClass, "pl-9")}
            />
          </div>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className={filterFieldClass}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="flex gap-1 rounded-md border border-black/10 bg-white p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatus(f.value)}
                className={cn(
                  "flex-1 rounded px-2 text-sm transition-colors",
                  status === f.value
                    ? "bg-[var(--venue-secondary)] font-medium text-[#3D421F]"
                    : "text-black/55 hover:bg-black/5",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-black/50">
          Showing {filtered.length} of {viewItems.length} {activeView.noun}. Add
          or schedule one from the employee&apos;s Employment path (Position /
          Salary change).
        </p>
        <button
          type="button"
          onClick={() => void downloadSnapshot()}
          disabled={snapshotting || filtered.length === 0}
          title="Download the table below as a PNG image"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/10 px-3 text-sm font-medium text-[#3D421F] transition hover:bg-[var(--venue-primary)]/20 disabled:opacity-50"
        >
          {snapshotting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ImageDown className="h-3.5 w-3.5" aria-hidden />
          )}
          Snapshot PNG
        </button>
      </div>

      {snapshotting ? (
        <div
          aria-hidden
          className="pointer-events-none fixed left-[-100000px] top-0"
        >
          <div
            ref={snapshotRef}
            className="w-[1400px] space-y-5 bg-white p-8 text-[#3D421F]"
          >
            <div className="flex items-center justify-between gap-6 border-b border-black/10 pb-5">
              <div className="flex items-center gap-5">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- rasterized by html2canvas
                  <img
                    src={logoUrl}
                    alt={venueName}
                    className="h-12 w-auto max-w-56 object-contain"
                  />
                ) : (
                  <span className="font-serif text-2xl">{venueName}</span>
                )}
                <div className="h-10 w-px bg-black/15" />
                <div>
                  <h1 className="font-serif text-3xl leading-tight">
                    Promotions / Demotions
                  </h1>
                  <p className="mt-1 text-sm text-black/55">
                    {snapshotSubtitle}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-black/50">
                <div className="font-medium text-[#3D421F]">{venueName}</div>
                <div>Generated {formatDateOnly(todayIso)}</div>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-black/10">
              <PromotionsTable
                rows={filtered}
                todayIso={todayIso}
                activeView={activeView}
                showRoles={showRoles}
                showSalary={showSalary}
                snapshot
              />
            </div>
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="max-h-[70vh] overflow-auto">
          <PromotionsTable
            rows={filtered}
            todayIso={todayIso}
            activeView={activeView}
            showRoles={showRoles}
            showSalary={showSalary}
          />
        </div>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-black/50">
            {viewItems.length === 0
              ? `No ${activeView.noun} recorded yet.`
              : `No ${activeView.noun} match your filters.`}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
