"use client";

import Image from "next/image";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { useMemo, useState } from "react";
import { Activity, Pencil, Search, X } from "lucide-react";
import { summarizePermissionVenues } from "@/lib/access/store";
import {
  inviteStatusOf,
  type InviteStatus,
  type UserListRow,
} from "@/lib/access/types";
import type { Venue } from "@/lib/types/database";
import { Card } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StatusBadge } from "@/components/hr/status-badge";
import { UserActivityDialog } from "@/components/settings/user-activity-dialog";
import { getUserInitials } from "@/lib/user/display";
import { resolveAvatarUrl } from "@/lib/user/resolve-avatar-url";
import { cn } from "@/lib/utils";

type UsersListProps = {
  users: UserListRow[];
  venues: Venue[];
};

type UserKind = "venue" | "group" | "external";

const KIND_LABELS: Record<UserKind, string> = {
  venue: "Venue employee",
  group: "Group employee",
  external: "External",
};

const filterFieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

function userKindOf(u: UserListRow): UserKind | null {
  if (u.is_external) return "external";
  if (!u.staff) return null;
  return u.staff.home_venue?.is_global ? "group" : "venue";
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function ClearButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Clear filter"
      className={cn(
        "absolute top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-black/5 text-black/45 transition-colors hover:bg-black/15 hover:text-[#3D421F]",
        className,
      )}
    >
      <X className="h-3 w-3" />
    </button>
  );
}

const STATUS_STYLES: Record<InviteStatus, { label: string; className: string }> = {
  accepted: {
    label: "Active",
    className: "bg-emerald-100 text-emerald-800",
  },
  pending: {
    label: "Pending invite",
    className: "bg-amber-100 text-amber-800",
  },
  disabled: {
    label: "Disabled",
    className: "bg-black/10 text-black/60",
  },
};

const actionButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition-colors hover:border-[var(--venue-primary)]/40 hover:bg-[var(--venue-secondary)]/40";

function RowActions({
  user,
  onActivity,
}: {
  user: UserListRow;
  onActivity: (user: UserListRow) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onActivity(user)}
        aria-label="View activity history"
        title="Activity history"
        className={actionButtonClass}
      >
        <Activity className="h-4 w-4" />
      </button>
      <Link
        href={`/settings/users/${user.id}`}
        aria-label="Edit user access"
        title="Edit access & account"
        className={actionButtonClass}
      >
        <Pencil className="h-4 w-4" />
      </Link>
    </div>
  );
}

function InviteStatusBadge({ user }: { user: UserListRow }) {
  const status = inviteStatusOf(user);
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}

function UserListAvatar({ user }: { user: UserListRow }) {
  const avatarUrl = resolveAvatarUrl({
    profileAvatarUrl: user.avatar_url,
    staffPhotoUrl: user.staff?.photo_url,
  });
  const initials = getUserInitials(user.full_name, user.email);
  const label = user.full_name?.trim() || user.email;

  return (
    <div
      className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-black/10 bg-black/[0.04]"
      title={label}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          fill
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#3D421F] text-[11px] font-medium text-white">
          {initials}
        </div>
      )}
    </div>
  );
}

export function UsersList({ users, venues }: UsersListProps) {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [employmentFilter, setEmploymentFilter] = useState("");
  const [accessFilter, setAccessFilter] = useState("");
  const [activityUser, setActivityUser] = useState<UserListRow | null>(null);

  const venueNames = useMemo(
    () => new Map(venues.map((v) => [v.id, v.name])),
    [venues],
  );

  const departments = useMemo(
    () => uniqueSorted(users.map((u) => u.staff?.department?.name)),
    [users],
  );
  const positions = useMemo(
    () => uniqueSorted(users.map((u) => u.staff?.position?.name)),
    [users],
  );
  const employmentStatuses = useMemo(
    () => uniqueSorted(users.map((u) => u.staff?.employment_status?.name)),
    [users],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (kindFilter && userKindOf(u) !== kindFilter) return false;
      if (departmentFilter && u.staff?.department?.name !== departmentFilter)
        return false;
      if (positionFilter && u.staff?.position?.name !== positionFilter)
        return false;
      if (
        employmentFilter &&
        u.staff?.employment_status?.name !== employmentFilter
      )
        return false;
      if (accessFilter && inviteStatusOf(u) !== accessFilter) return false;
      if (!q) return true;
      return (
        (u.full_name?.toLowerCase().includes(q) ?? false) ||
        u.email.toLowerCase().includes(q) ||
        (u.staff?.emp_no.toLowerCase().includes(q) ?? false)
      );
    });
  }, [
    users,
    search,
    kindFilter,
    departmentFilter,
    positionFilter,
    employmentFilter,
    accessFilter,
  ]);

  const internalUsers = useMemo(
    () => filtered.filter((u) => !u.is_external),
    [filtered],
  );
  const externalUsers = useMemo(
    () => filtered.filter((u) => u.is_external),
    [filtered],
  );

  const anyFilter =
    search !== "" ||
    kindFilter !== "" ||
    departmentFilter !== "" ||
    positionFilter !== "" ||
    employmentFilter !== "" ||
    accessFilter !== "";

  function clearAllFilters() {
    setSearch("");
    setKindFilter("");
    setDepartmentFilter("");
    setPositionFilter("");
    setEmploymentFilter("");
    setAccessFilter("");
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Search &amp; filter
          </h3>
          {anyFilter ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-black/50 transition-colors hover:text-[#3D421F]"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="relative">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className={cn(filterFieldClass, kindFilter && "pr-14")}
            >
              <option value="">All user kinds</option>
              <option value="venue">{KIND_LABELS.venue}</option>
              <option value="group">{KIND_LABELS.group}</option>
              <option value="external">{KIND_LABELS.external}</option>
            </select>
            {kindFilter ? (
              <ClearButton
                onClick={() => setKindFilter("")}
                className="right-7"
              />
            ) : null}
          </div>

          <SearchableSelect
            value={departmentFilter}
            onChange={setDepartmentFilter}
            options={departments.map((d) => ({ value: d, label: d }))}
            placeholder="All departments"
            searchPlaceholder="Search department…"
          />

          <SearchableSelect
            value={positionFilter}
            onChange={setPositionFilter}
            options={positions.map((p) => ({ value: p, label: p }))}
            placeholder="All positions"
            searchPlaceholder="Search position…"
          />

          <SearchableSelect
            value={employmentFilter}
            onChange={setEmploymentFilter}
            options={employmentStatuses.map((s) => ({ value: s, label: s }))}
            placeholder="All employment statuses"
            searchPlaceholder="Search employment status…"
          />

          <div className="relative">
            <select
              value={accessFilter}
              onChange={(e) => setAccessFilter(e.target.value)}
              className={cn(filterFieldClass, accessFilter && "pr-14")}
            >
              <option value="">All access statuses</option>
              <option value="accepted">Active</option>
              <option value="pending">Pending invite</option>
              <option value="disabled">Disabled</option>
            </select>
            {accessFilter ? (
              <ClearButton
                onClick={() => setAccessFilter("")}
                className="right-7"
              />
            ) : null}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
            <input
              placeholder="Employee name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(filterFieldClass, "pl-9", search && "pr-9")}
            />
            {search ? (
              <ClearButton onClick={() => setSearch("")} className="right-2" />
            ) : null}
          </div>
        </div>
      </Card>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#3D421F]">Employee Users</h3>
          <p className="text-sm text-black/50">
            {internalUsers.length} user{internalUsers.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="hidden overflow-hidden rounded-lg border border-black/10 bg-white md:block">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[7%]" />
              <col className="w-[15%]" />
              <col className="w-[19%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-4 py-3" aria-label="Avatar" />
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Home venue</th>
                <th className="px-4 py-3">Employee number</th>
                <th className="px-4 py-3">Employment status</th>
                <th className="px-4 py-3">Access status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {internalUsers.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-black/5 hover:bg-[var(--venue-secondary)]/30"
                >
                  <td className="px-4 py-3">
                    <UserListAvatar user={u} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/settings/users/${u.id}`}
                      className="block truncate font-medium text-[#3D421F] hover:underline"
                    >
                      {u.full_name ?? u.email}
                    </Link>
                  </td>
                  <td className="truncate px-4 py-3 text-black/70">{u.email}</td>
                  <td className="truncate px-4 py-3 text-black/70">
                    {u.staff?.home_venue?.name ?? "—"}
                  </td>
                  <td className="truncate px-4 py-3 text-black/70">
                    {u.staff?.emp_no ? (
                      <span className="font-mono text-xs">{u.staff.emp_no}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="truncate px-4 py-3 text-black/70">
                    <StatusBadge status={u.staff?.employment_status?.name} />
                  </td>
                  <td className="px-4 py-3">
                    <InviteStatusBadge user={u} />
                  </td>
                  <td className="px-4 py-3">
                    <RowActions user={u} onActivity={setActivityUser} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:hidden">
          {internalUsers.map((u) => (
            <Link
              key={u.id}
              href={`/settings/users/${u.id}`}
              className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <UserListAvatar user={u} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#3D421F]">
                      {u.full_name ?? u.email}
                    </p>
                    <p className="truncate text-xs text-black/50">{u.email}</p>
                  </div>
                </div>
                <InviteStatusBadge user={u} />
              </div>
              <dl className="mt-3 space-y-1 text-xs text-black/60">
                <div className="flex justify-between gap-2">
                  <dt className="text-black/40">Home venue</dt>
                  <dd>{u.staff?.home_venue?.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-black/40">Employee number</dt>
                  <dd>{u.staff?.emp_no ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-black/40">Employment status</dt>
                  <dd>
                    <StatusBadge status={u.staff?.employment_status?.name} />
                  </dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>

        {internalUsers.length === 0 ? (
          <p className="py-8 text-center text-sm text-black/50">
            No internal users match your filters.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#3D421F]">External users</h3>
          <p className="text-sm text-black/50">
            {externalUsers.length} user{externalUsers.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="hidden overflow-hidden rounded-lg border border-black/10 bg-white md:block">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[7%]" />
              <col className="w-[16%]" />
              <col className="w-[20%]" />
              <col className="w-[37%]" />
              <col className="w-[11%]" />
              <col className="w-[9%]" />
            </colgroup>
            <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-4 py-3" aria-label="Avatar" />
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Venues with access</th>
                <th className="px-4 py-3">Access status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {externalUsers.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-black/5 hover:bg-[var(--venue-secondary)]/30"
                >
                  <td className="px-4 py-3">
                    <UserListAvatar user={u} />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/settings/users/${u.id}`}
                      className="block truncate font-medium text-[#3D421F] hover:underline"
                    >
                      {u.full_name ?? u.email}
                    </Link>
                  </td>
                  <td className="truncate px-4 py-3 text-black/70">{u.email}</td>
                  <td className="truncate px-4 py-3 text-black/70">
                    {summarizePermissionVenues(u.permissions, venueNames)}
                  </td>
                  <td className="px-4 py-3">
                    <InviteStatusBadge user={u} />
                  </td>
                  <td className="px-4 py-3">
                    <RowActions user={u} onActivity={setActivityUser} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 md:hidden">
          {externalUsers.map((u) => (
            <Link
              key={u.id}
              href={`/settings/users/${u.id}`}
              className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <UserListAvatar user={u} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[#3D421F]">
                      {u.full_name ?? u.email}
                    </p>
                    <p className="truncate text-xs text-black/50">{u.email}</p>
                  </div>
                </div>
                <InviteStatusBadge user={u} />
              </div>
              <dl className="mt-3 space-y-1 text-xs text-black/60">
                <div className="flex justify-between gap-2">
                  <dt className="text-black/40">Venues with access</dt>
                  <dd>{summarizePermissionVenues(u.permissions, venueNames)}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>

        {externalUsers.length === 0 ? (
          <p className="py-8 text-center text-sm text-black/50">
            No external users match your filters.
          </p>
        ) : null}
      </section>

      {activityUser ? (
        <UserActivityDialog
          userId={activityUser.id}
          userName={activityUser.full_name ?? activityUser.email}
          onClose={() => setActivityUser(null)}
        />
      ) : null}
    </div>
  );
}
