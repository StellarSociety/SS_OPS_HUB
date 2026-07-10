"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { InviteableStaffRow } from "@/lib/access/types";
import { staffInviteEmail } from "@/lib/access/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type InviteUserPanelProps = {
  staff: InviteableStaffRow[];
  onInvite: (staffId: string) => void;
  onCancel: () => void;
};

export function InviteUserPanel({
  staff,
  onInvite,
  onCancel,
}: InviteUserPanelProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return staff.filter((s) => {
      if (!q) return true;
      return (
        s.full_name.toLowerCase().includes(q) ||
        s.emp_no.toLowerCase().includes(q) ||
        (s.work_email?.toLowerCase().includes(q) ?? false) ||
        (s.personal_email?.toLowerCase().includes(q) ?? false) ||
        (s.home_venue?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [staff, search]);

  const selected = staff.find((s) => s.id === selectedId);
  const email = selected ? staffInviteEmail(selected) : null;

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="font-serif text-xl text-[#3D421F]">Invite user</h2>
        <p className="mt-1 text-sm text-black/60">
          Select a staff record — name and email come from HR. Group staff
          (home = Global) and venue staff are both listed.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
        <Input
          placeholder="Search staff…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-lg border border-black/10">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-black/50">
            No inviteable staff found. Create a staff record in HR first, or all
            staff may already have accounts.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {filtered.map((s) => {
              const staffEmail = staffInviteEmail(s);
              const disabled = !staffEmail;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full px-4 py-3 text-left text-sm transition-colors ${
                      selectedId === s.id
                        ? "bg-[var(--venue-primary)]/10"
                        : "hover:bg-black/[0.02]"
                    } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <p className="font-medium text-[#3D421F]">{s.full_name}</p>
                    <p className="text-xs text-black/50">
                      {s.emp_no} · {s.home_venue?.name ?? "—"}
                      {s.position?.name ? ` · ${s.position.name}` : ""}
                    </p>
                    <p className="text-xs text-black/40">
                      {staffEmail ?? "No email — add on HR record first"}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected ? (
        <div className="rounded-lg bg-[var(--venue-secondary)]/40 p-4 text-sm">
          <p>
            <span className="text-black/50">Name:</span> {selected.full_name}
          </p>
          <p>
            <span className="text-black/50">Email:</span>{" "}
            {email ?? "Missing — update staff record in HR"}
          </p>
          <p>
            <span className="text-black/50">Home venue:</span>{" "}
            {selected.home_venue?.name ?? "—"}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!selectedId || !email}
          onClick={() => onInvite(selectedId)}
        >
          Send invitation
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
