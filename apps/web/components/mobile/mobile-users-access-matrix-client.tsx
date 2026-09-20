"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Image from "next/image";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Mail,
  Search,
  UserPlus,
} from "lucide-react";
import { MobileAccessInviteDialog } from "@/components/mobile/mobile-access-invite-dialog";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import {
  ACCESS_LEVEL_SWITCH_CLASS,
  AccessLevelSwitch,
} from "@/components/ui/access-level-switch";
import { DateInput } from "@/components/ui/date-input";
import { StatusBadge } from "@/components/hr/status-badge";
import { toast } from "@/components/ui/toast";
import {
  setMobileAccessBlock,
  setMobileMatrixAccess,
  type MobileAccessMatrixData,
  type MobileAccessMatrixRow,
} from "@/lib/actions/mobile-user-access";
import { ACCESS_MATRIX_LEVELS, type AccessMatrixLevel } from "@/lib/access/matrix";
import { ModuleIcon } from "@/components/modules/module-icon";
import { getOverviewModuleByKey } from "@/lib/modules-registry";
import { getUserInitials } from "@/lib/user/display";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";
import { cn } from "@/lib/utils";

type Props = {
  data: MobileAccessMatrixData;
};

type SortDir = "asc" | "desc";
type SortKey = "name" | "webapp" | "invite" | "block" | string;

const LEVEL_SORT: Record<AccessMatrixLevel, number> = {
  hidden: 0,
  none: 1,
  viewer: 2,
  editor: 3,
};

const INVITE_SORT: Record<MobileAccessMatrixRow["inviteStatus"], number> = {
  none: 0,
  pending: 1,
  accepted: 2,
  disabled: 3,
};

function compareRows(
  a: MobileAccessMatrixRow,
  b: MobileAccessMatrixRow,
  sortKey: SortKey,
  sortDir: SortDir,
) {
  const dir = sortDir === "asc" ? 1 : -1;
  let cmp = 0;
  if (sortKey === "name") {
    cmp = a.name.localeCompare(b.name);
  } else if (sortKey === "webapp") {
    cmp = a.webAppCount - b.webAppCount;
  } else if (sortKey === "invite") {
    cmp = INVITE_SORT[a.inviteStatus] - INVITE_SORT[b.inviteStatus];
  } else if (sortKey === "block") {
    const rank = (row: MobileAccessMatrixRow) =>
      row.blockedNow ? 2 : row.accessBlockedUntil ? 1 : 0;
    cmp = rank(a) - rank(b);
    if (cmp === 0) {
      cmp = (a.accessBlockedUntil ?? "").localeCompare(b.accessBlockedUntil ?? "");
    }
  } else {
    cmp =
      LEVEL_SORT[a.levels[sortKey] ?? "none"] -
      LEVEL_SORT[b.levels[sortKey] ?? "none"];
  }
  if (cmp === 0) cmp = a.name.localeCompare(b.name);
  return cmp * dir;
}

function groupByDepartment(
  rows: MobileAccessMatrixRow[],
  compare: (a: MobileAccessMatrixRow, b: MobileAccessMatrixRow) => number,
) {
  const groups = new Map<string, MobileAccessMatrixRow[]>();
  const sort = new Map<string, number>();
  for (const row of rows) {
    const list = groups.get(row.department) ?? [];
    list.push(row);
    groups.set(row.department, list);
    sort.set(row.department, Math.min(sort.get(row.department) ?? 999, row.departmentSort));
  }
  return [...groups.entries()]
    .sort((a, b) => {
      const sortDiff = (sort.get(a[0]) ?? 999) - (sort.get(b[0]) ?? 999);
      if (sortDiff !== 0) return sortDiff;
      return a[0].localeCompare(b[0]);
    })
    .map(([department, members]) => ({
      department,
      members: [...members].sort(compare),
    }));
}

function SortLabel({
  label,
  sortKey,
  activeKey,
  sortDir,
  onSort,
  className,
  align = "start",
}: {
  label: ReactNode;
  sortKey: SortKey;
  activeKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "start" | "center";
}) {
  const active = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 transition-colors hover:text-[#3D421F]",
        align === "center" && "justify-center",
        className,
      )}
      aria-label={`Sort by ${typeof label === "string" ? label : sortKey}`}
    >
      {typeof label === "string" ? <span>{label}</span> : label}
      {active ? (
        sortDir === "asc" ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-black/25" />
      )}
    </button>
  );
}

export function MobileUsersAccessMatrixClient({ data }: Props) {
  const [rows, setRows] = useState(() => [...data.active, ...data.out, ...data.external]);
  const [query, setQuery] = useState("");
  const [outOpen, setOutOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(data.external.length > 0 && data.active.length === 0);
  const [inviteRow, setInviteRow] = useState<MobileAccessMatrixRow | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const apps = data.apps;
  const hubKey = data.hubKey;
  const colCount = 5 + apps.length;
  const headCell =
    "border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]";
  const stickyHead = cn(
    headCell,
    "sticky left-0 z-30 min-w-[220px] border-r px-3 py-2 shadow-[2px_0_6px_rgba(61,66,31,0.08)]",
  );
  const stickyName =
    "sticky left-0 z-10 min-w-[220px] border-r border-black/10 bg-[var(--venue-secondary,#F0F3DD)] px-3 py-2 shadow-[2px_0_6px_rgba(61,66,31,0.08)]";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        (row.empNo?.toLowerCase().includes(q) ?? false) ||
        (row.position?.toLowerCase().includes(q) ?? false) ||
        row.department.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const active = filtered.filter(
    (row) => row.kind === "staff" && !data.out.some((item) => item.key === row.key),
  );
  const out = filtered.filter((row) => data.out.some((item) => item.key === row.key));
  const external = filtered.filter((row) => row.kind === "external");

  function patchRow(key: string, patch: Partial<MobileAccessMatrixRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function run(key: string, task: () => Promise<{ error?: string; success?: string }>) {
    setPendingKey(key);
    startTransition(async () => {
      const result = await task();
      setPendingKey(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.success) toast.saved(result.success);
    });
  }

  function onLevel(row: MobileAccessMatrixRow, moduleKey: string, level: AccessMatrixLevel) {
    if (!row.userId) {
      toast.alert("Invite this person first.");
      return;
    }
    const previous = row.levels[moduleKey];
    patchRow(row.key, { levels: { ...row.levels, [moduleKey]: level } });
    run(row.key, async () => {
      const result = await setMobileMatrixAccess({
        userId: row.userId!,
        moduleKey,
        level,
      });
      if (result.error) {
        patchRow(row.key, { levels: { ...row.levels, [moduleKey]: previous } });
      }
      return result;
    });
  }

  function onInvite(row: MobileAccessMatrixRow) {
    setInviteRow(row);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  const tableHead = (
    <thead className="sticky top-0 z-20 bg-[var(--venue-secondary,#F0F3DD)]">
      <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-black/50">
        <th
          className={stickyHead}
          aria-sort={sortKey === "name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        >
          <SortLabel
            label="Name"
            sortKey="name"
            activeKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
          />
        </th>
        <th
          className={cn(headCell, "min-w-[88px] px-2 py-2")}
          aria-sort={sortKey === "webapp" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        >
          <SortLabel
            label="WebApp"
            sortKey="webapp"
            activeKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
          />
        </th>
        <th
          className={cn(headCell, "min-w-[132px] px-2 py-2 text-center")}
          aria-sort={sortKey === hubKey ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        >
          <SortLabel
            align="center"
            sortKey={hubKey}
            activeKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            className="w-full"
            label={
              <span className="flex flex-col items-center leading-tight">
                <span>Personal</span>
                <span className="font-normal normal-case tracking-normal">Employee Hub</span>
              </span>
            }
          />
        </th>
        {apps.map((app) => {
          const overview = getOverviewModuleByKey(app.key);
          return (
            <th
              key={app.key}
              className={cn(headCell, "min-w-[132px] px-1 py-2 text-center")}
              aria-sort={sortKey === app.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
            >
              <SortLabel
                align="center"
                sortKey={app.key}
                activeKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                className="w-full"
                label={
                  <span className="flex flex-col items-center gap-1">
                    {overview ? (
                      <ModuleIcon iconKey={overview.iconKey} className="h-4 w-4 text-[#3D421F]" />
                    ) : null}
                    <span className="max-w-[7.5rem] leading-tight normal-case tracking-normal">
                      {app.label}
                    </span>
                  </span>
                }
              />
            </th>
          );
        })}
        <th
          className={cn(headCell, "min-w-[120px] px-2 py-2")}
          aria-sort={sortKey === "invite" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        >
          <SortLabel
            label="Invitation"
            sortKey="invite"
            activeKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
          />
        </th>
        <th
          className={cn(headCell, "min-w-[200px] px-2 py-2")}
          aria-sort={sortKey === "block" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        >
          <SortLabel
            label="Access block"
            sortKey="block"
            activeKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
          />
        </th>
      </tr>
    </thead>
  );

  function renderRow(row: MobileAccessMatrixRow) {
    const busy = isPending && pendingKey === row.key;
    const canEditRow = data.canEdit && !busy;
    const photo = resolveAvatarUrl({
      staffPhotoUrl: row.photoUrl,
      preferStaffPhoto: row.kind === "staff",
    });
    const initials = getUserInitials(row.name, "");

    return (
      <tr key={row.key} className="border-t border-black/5 hover:bg-black/[0.015]">
        <td className={stickyName}>
          <div className="flex items-center gap-2.5">
            {photo ? (
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-black/10">
                <Image src={photo} alt="" fill className="object-cover" unoptimized />
              </div>
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3D421F] text-[10px] font-medium text-white">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#3D421F]">{row.name}</p>
              {row.position &&
              !(row.kind === "external" && !row.empNo && row.position === "External") ? (
                <p className="truncate text-[11px] text-black/50">{row.position}</p>
              ) : null}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-black/45">
                {row.staffId && row.empNo ? (
                  <StaffDirectoryLink
                    staffId={row.staffId}
                    empNo={row.empNo}
                    className="text-[11px]"
                  />
                ) : row.empNo ? (
                  <span className="font-mono text-[11px] text-black/55">{row.empNo}</span>
                ) : (
                  <span>{row.kind === "external" ? "External" : "No emp no"}</span>
                )}
                {row.employmentStatus ? <StatusBadge status={row.employmentStatus} /> : null}
              </p>
            </div>
          </div>
        </td>
        <td className="px-2 py-2 text-sm">
          {row.userId ? (
            <Link
              href={`/settings/users/${row.userId}`}
              className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
            >
              {row.webAppCount} {row.webAppCount === 1 ? "app" : "apps"}
            </Link>
          ) : (
            <span className="text-black/35">—</span>
          )}
        </td>
        <td className="px-1 py-2 text-center">
          <AccessLevelSwitch
            name={`${row.name} Personal Employee Hub`}
            value={row.levels[hubKey] ?? "none"}
            disabled={!canEditRow || !row.userId}
            onChange={(level) => onLevel(row, hubKey, level)}
          />
        </td>
        {apps.map((app) => (
          <td key={app.key} className="px-1 py-2 text-center">
            <AccessLevelSwitch
              name={`${row.name} ${app.label}`}
              value={row.levels[app.key] ?? "none"}
              disabled={!canEditRow || !row.userId}
              onChange={(level) => onLevel(row, app.key, level)}
            />
          </td>
        ))}
        <td className="px-2 py-2">
          <InviteCell
            row={row}
            canEdit={canEditRow}
            onInvite={() => onInvite(row)}
          />
        </td>
        <td className="px-2 py-2">
          <BlockCell
            row={row}
            canEdit={canEditRow}
            onSave={(next) => {
              if (!row.userId) {
                toast.alert("Invite this person first.");
                return;
              }
              const previous = {
                blockedNow: row.blockedNow,
                accessBlockedUntil: row.accessBlockedUntil,
                accessBlockFromTermination: row.accessBlockFromTermination,
              };
              patchRow(row.key, next);
              run(row.key, async () => {
                const result = await setMobileAccessBlock({
                  userId: row.userId!,
                  blockedNow: next.blockedNow ?? row.blockedNow,
                  until: next.accessBlockedUntil ?? row.accessBlockedUntil,
                  fromTermination:
                    next.accessBlockFromTermination ?? row.accessBlockFromTermination,
                });
                if ("error" in result && result.error) patchRow(row.key, previous);
                return result;
              });
            }}
          />
        </td>
      </tr>
    );
  }

  function renderGroups(list: MobileAccessMatrixRow[]) {
    return groupByDepartment(list, (a, b) => compareRows(a, b, sortKey, sortDir)).map((group) => (
      <tbody key={group.department}>
        <tr>
          <td
            colSpan={colCount}
            className="border-y border-black/5 bg-[color-mix(in_srgb,var(--venue-primary)_16%,var(--venue-secondary,#F0F3DD))] p-0"
          >
            <div className="sticky left-0 z-[15] w-max px-3 py-1.5 font-serif text-sm text-[#3D421F]">
              {group.department}
              <span className="ml-2 text-xs font-sans text-black/40">{group.members.length}</span>
            </div>
          </td>
        </tr>
        {group.members.map(renderRow)}
      </tbody>
    ));
  }

  function renderSorted(list: MobileAccessMatrixRow[]) {
    const ignoreDepartment = sortKey !== "name" || sortDir !== "asc";
    if (!ignoreDepartment) return renderGroups(list);
    return (
      <tbody>
        {[...list]
          .sort((a, b) => compareRows(a, b, sortKey, sortDir))
          .map(renderRow)}
      </tbody>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <p className="max-w-3xl text-sm text-black/60">
          All venue employees, grouped by department. Each switch is Hidden, No
          access, Viewer, or Editor — the same grants as{" "}
          <Link href="/settings/users" className="font-medium text-[#3D421F] underline-offset-2 hover:underline">
            Users &amp; access
          </Link>
          .
        </p>
        <label className="relative block w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, emp no, department…"
            className="h-10 w-full rounded-md border border-black/10 bg-white pl-9 pr-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
          />
        </label>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-black/55">
        <div
          className="inline-flex items-center gap-0.5 rounded-full border border-black/10 bg-white p-0.5"
          aria-hidden
        >
          {ACCESS_MATRIX_LEVELS.map((level) => (
            <span
              key={level.value}
              title={`${level.short} — ${level.label}`}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white",
                ACCESS_LEVEL_SWITCH_CLASS[level.value],
              )}
            >
              {level.short}
            </span>
          ))}
        </div>
        {ACCESS_MATRIX_LEVELS.map((level) => (
          <span key={level.value}>
            <span className="font-semibold text-[#3D421F]">{level.short}</span>{" "}
            {level.label}
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-black/10 bg-white/70">
        <table className="min-w-max border-separate border-spacing-0 text-sm">
          {tableHead}
          {active.length > 0 ? (
            renderSorted(active)
          ) : (
            <tbody>
              <tr>
                <td colSpan={colCount} className="px-3 py-8 text-center text-sm text-black/45">
                  No active staff match this search.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>

      {data.external.length > 0 ? (
        <SectionToggle
          open={externalOpen}
          onToggle={() => setExternalOpen((value) => !value)}
          title="External users"
          count={external.length}
        >
          <div className="max-h-[min(40vh,22rem)] min-h-0 overflow-auto rounded-xl border border-black/10 bg-white/70">
            <table className="min-w-max border-separate border-spacing-0 text-sm">
              {tableHead}
              {renderSorted(external)}
            </table>
          </div>
        </SectionToggle>
      ) : null}

      {data.out.length > 0 ? (
        <SectionToggle
          open={outOpen}
          onToggle={() => setOutOpen((value) => !value)}
          title="OUT employees"
          count={out.length}
        >
          <div className="max-h-[min(40vh,22rem)] min-h-0 overflow-auto rounded-xl border border-black/10 bg-white/70">
            <table className="min-w-max border-separate border-spacing-0 text-sm">
              {tableHead}
              {renderSorted(out)}
            </table>
          </div>
        </SectionToggle>
      ) : null}

      {inviteRow ? (
        <MobileAccessInviteDialog
          row={inviteRow}
          onClose={() => setInviteRow(null)}
          onInvited={(patch) => patchRow(inviteRow.key, patch)}
        />
      ) : null}
    </div>
  );
}

function SectionToggle({
  open,
  onToggle,
  title,
  count,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0 space-y-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-medium text-[#3D421F]"
      >
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        {title}
        <span className="text-xs font-normal text-black/40">{count}</span>
      </button>
      {open ? children : null}
    </div>
  );
}

function InviteCell({
  row,
  canEdit,
  onInvite,
}: {
  row: MobileAccessMatrixRow;
  canEdit: boolean;
  onInvite: () => void;
}) {
  if (row.inviteStatus === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <Check className="h-3.5 w-3.5" /> Accepted
      </span>
    );
  }
  if (row.inviteStatus === "pending") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-amber-700">Pending</span>
        <button
          type="button"
          disabled={!canEdit}
          onClick={onInvite}
          title="Resend invitation"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-black/10 text-[#3D421F] hover:bg-black/[0.04] disabled:opacity-40"
        >
          <Mail className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  if (row.inviteStatus === "disabled") {
    return <span className="text-xs font-medium text-black/40">Disabled</span>;
  }
  return (
    <button
      type="button"
      disabled={!canEdit || !row.staffId}
      onClick={onInvite}
      title={row.hasEmail ? "Invite to the hub" : "No email on the staff record"}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2 text-xs font-medium text-[#3D421F] hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <UserPlus className="h-3.5 w-3.5" />
      Invite
    </button>
  );
}

function BlockCell({
  row,
  canEdit,
  onSave,
}: {
  row: MobileAccessMatrixRow;
  canEdit: boolean;
  onSave: (patch: Partial<MobileAccessMatrixRow>) => void;
}) {
  const hasUser = Boolean(row.userId);
  const termLocked = row.accessBlockFromTermination && Boolean(row.terminationDate);

  return (
    <div className="flex min-w-[11.5rem] flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-[11px] text-black/60">
        <input
          type="checkbox"
          checked={row.blockedNow}
          disabled={!canEdit || !hasUser}
          onChange={(e) => onSave({ blockedNow: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-black/20 accent-red-600"
        />
        <Ban className="h-3 w-3 text-red-600" />
        Block now
      </label>
      <DateInput
        aria-label={`Access block date for ${row.name}`}
        value={row.accessBlockedUntil ?? ""}
        disabled={!canEdit || !hasUser || termLocked}
        inputClassName="h-8 text-xs"
        onChange={(iso) =>
          onSave({
            accessBlockedUntil: iso || null,
            accessBlockFromTermination: false,
          })
        }
      />
      {row.terminationDate ? (
        <label className="flex items-center gap-1.5 text-[11px] text-black/50">
          <input
            type="checkbox"
            checked={row.accessBlockFromTermination}
            disabled={!canEdit || !hasUser}
            onChange={(e) =>
              onSave({
                accessBlockFromTermination: e.target.checked,
                accessBlockedUntil: e.target.checked
                  ? row.terminationDate
                  : row.accessBlockedUntil,
              })
            }
            className="h-3.5 w-3.5 rounded border-black/20 accent-[#818a40]"
          />
          Use termination date
        </label>
      ) : null}
    </div>
  );
}
