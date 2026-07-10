"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Search, UserPlus } from "lucide-react";
import { inviteUser } from "@/lib/actions/users";
import {
  summarizePermissionModules,
  summarizePermissionVenues,
} from "@/lib/access/store";
import type { InviteableStaffRow, UserListRow } from "@/lib/access/types";
import type { Venue } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InviteUserPanel } from "@/components/settings/invite-user-panel";

type UsersListProps = {
  users: UserListRow[];
  inviteableStaff: InviteableStaffRow[];
  venues: Venue[];
};

function UserStatusBadge({ status }: { status: "active" | "disabled" }) {
  const active = status === "active";
  return (
    <span
      className={
        active
          ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
          : "inline-flex rounded-full bg-black/10 px-2 py-0.5 text-xs font-medium text-black/60"
      }
    >
      {active ? "Active" : "Disabled"}
    </span>
  );
}

export function UsersList({ users, inviteableStaff, venues }: UsersListProps) {
  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [, startTransition] = useTransition();

  const venueNames = useMemo(
    () => new Map(venues.map((v) => [v.id, v.name])),
    [venues],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (statusFilter && u.status !== statusFilter) return false;
      if (venueFilter && u.staff?.home_venue_id !== venueFilter) return false;
      if (!q) return true;
      return (
        (u.full_name?.toLowerCase().includes(q) ?? false) ||
        u.email.toLowerCase().includes(q) ||
        (u.staff?.emp_no.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, search, venueFilter, statusFilter]);

  function handleInvite(staffId: string) {
    startTransition(async () => {
      const result = await inviteUser(staffId);
      if (result.error) {
        alert(result.error);
        return;
      }
      setShowInvite(false);
      alert(result.success);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
            <Input
              placeholder="Search name, email, emp no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={venueFilter}
            onChange={(e) => setVenueFilter(e.target.value)}
            className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
          >
            <option value="">All home venues</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setShowInvite((v) => !v)}
          className="shrink-0"
        >
          <UserPlus className="h-4 w-4" />
          Invite user
        </Button>
      </div>

      {showInvite ? (
        <InviteUserPanel
          staff={inviteableStaff}
          onInvite={handleInvite}
          onCancel={() => setShowInvite(false)}
        />
      ) : null}

      <p className="text-sm text-black/50">
        {filtered.length} user{filtered.length === 1 ? "" : "s"}
      </p>

      <div className="hidden overflow-hidden rounded-lg border border-black/10 bg-white md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.02] text-xs uppercase tracking-wide text-black/50">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Home venue</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Access</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr
                key={u.id}
                className="border-b border-black/5 hover:bg-[var(--venue-secondary)]/30"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/settings/users/${u.id}`}
                    className="font-medium text-[#3D421F] hover:underline"
                  >
                    {u.full_name ?? u.email}
                  </Link>
                </td>
                <td className="px-4 py-3 text-black/70">{u.email}</td>
                <td className="px-4 py-3 text-black/70">
                  {u.staff?.home_venue?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-black/70">
                  {u.staff ? (
                    <span>
                      <span className="font-mono text-xs">{u.staff.emp_no}</span>
                      {" · "}
                      {u.staff.position?.name ?? "—"}
                      {u.staff.department?.name
                        ? ` · ${u.staff.department.name}`
                        : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <UserStatusBadge status={u.status} />
                </td>
                <td className="px-4 py-3 text-xs text-black/60">
                  <p>{summarizePermissionModules(u.permissions)}</p>
                  <p className="text-black/40">
                    {summarizePermissionVenues(u.permissions, venueNames)}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {filtered.map((u) => (
          <Link
            key={u.id}
            href={`/settings/users/${u.id}`}
            className="rounded-lg border border-black/10 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[#3D421F]">
                  {u.full_name ?? u.email}
                </p>
                <p className="text-xs text-black/50">{u.email}</p>
              </div>
              <UserStatusBadge status={u.status} />
            </div>
            <dl className="mt-3 space-y-1 text-xs text-black/60">
              <div className="flex justify-between gap-2">
                <dt className="text-black/40">Home</dt>
                <dd>{u.staff?.home_venue?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-black/40">Staff</dt>
                <dd>
                  {u.staff
                    ? `${u.staff.emp_no} · ${u.staff.position?.name ?? "—"}`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-black/40">Modules</dt>
                <dd>{summarizePermissionModules(u.permissions)}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-black/50">
          No users match your filters.
        </p>
      ) : null}
    </div>
  );
}
