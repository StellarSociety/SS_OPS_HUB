"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useScopedHref } from "@/components/providers/venue-scope-provider";
import {
  Building2,
  RefreshCw,
  Search,
  UserPlus,
  UserRoundPlus,
} from "lucide-react";
import { inviteExternalUser, inviteUser } from "@/lib/actions/users";
import { staffInviteEmail } from "@/lib/access/store";
import type { InviteableStaffRow } from "@/lib/access/types";
import { AccessCredentialsBox } from "@/components/settings/access-credentials-box";
import { InviteLinkBox } from "@/components/settings/invite-link-box";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type InvitePath = "current" | "other" | "external";

const fieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition placeholder:text-black/40 focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

function generatePassword(length = 14): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) {
    out += chars[arr[i]! % chars.length];
  }
  return out;
}

type Credentials = { email: string; password: string; loginUrl: string };

type InviteUserPanelProps = {
  staff: InviteableStaffRow[];
  currentVenueId: string | null;
  onClose?: () => void;
};

const TABS: { key: InvitePath; label: string; icon: typeof UserPlus }[] = [
  { key: "current", label: "This venue", icon: UserPlus },
  { key: "other", label: "Another venue", icon: Building2 },
  { key: "external", label: "External person", icon: UserRoundPlus },
];

export function InviteUserPanel({
  staff,
  currentVenueId,
  onClose,
}: InviteUserPanelProps) {
  const router = useRouter();
  const usersHref = useScopedHref("/settings/users");
  const close = onClose ?? (() => router.push(usersHref));
  const [path, setPath] = useState<InvitePath>("current");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [emailSource, setEmailSource] = useState<"work" | "personal">("work");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [password, setPassword] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  type InviteResult = {
    error?: string;
    success?: string;
    warning?: string;
    inviteLink?: string;
    credentials?: Credentials;
    userId?: string;
  };

  function resetResults() {
    setInviteLink(null);
    setCredentials(null);
    setCreatedUserId(null);
  }

  function handleResult(result: InviteResult) {
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.userId) setCreatedUserId(result.userId);
    if (result.credentials) {
      setCredentials(result.credentials);
      toast.saved(result.success ?? "Account created.");
      router.refresh();
      return;
    }
    if (result.inviteLink) {
      setInviteLink(result.inviteLink);
      toast.alert(result.success ?? "Account created — email not sent.");
      router.refresh();
      return;
    }
    toast.saved(result.success ?? "Invitation sent.");
    close();
    router.refresh();
  }

  const passwordTooShort = !sendEmail && password.length < 8;

  const scoped = useMemo(() => {
    return staff.filter((s) => {
      if (path === "current") return s.home_venue_id === currentVenueId;
      if (path === "other") return s.home_venue_id !== currentVenueId;
      return false;
    });
  }, [staff, path, currentVenueId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return scoped.filter((s) => {
      if (!q) return true;
      return (
        s.full_name.toLowerCase().includes(q) ||
        s.emp_no.toLowerCase().includes(q) ||
        (s.work_email?.toLowerCase().includes(q) ?? false) ||
        (s.personal_email?.toLowerCase().includes(q) ?? false) ||
        (s.home_venue?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [scoped, search]);

  const selected = staff.find((s) => s.id === selectedId);
  const selectedEmail = selected
    ? emailSource === "work"
      ? selected.work_email
      : selected.personal_email
    : null;

  function handleStaffInvite() {
    if (!selected) return;
    resetResults();
    startTransition(async () => {
      handleResult(
        await inviteUser(selected.id, {
          emailSource,
          sendEmail,
          password: sendEmail ? undefined : password,
        }),
      );
    });
  }

  function handleExternalInvite() {
    resetResults();
    startTransition(async () => {
      handleResult(
        await inviteExternalUser({
          fullName: externalName,
          email: externalEmail,
          sendEmail,
          password: sendEmail ? undefined : password,
        }),
      );
    });
  }

  const deliveryControls = (
    <div className="space-y-3 rounded-lg border border-black/10 bg-black/[0.015] p-3">
      <label className="flex cursor-pointer items-center gap-3">
        <span className="relative inline-flex items-center">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-5 w-9 rounded-full bg-black/20 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#818a40] peer-checked:after:translate-x-4" />
        </span>
        <span className="text-sm text-[#3D421F]">
          Send invitation email
          <span className="ml-1 text-xs text-black/40">
            {sendEmail
              ? "(user sets their own password)"
              : "(you set the password & share it)"}
          </span>
        </span>
      </label>

      {!sendEmail ? (
        <div className="space-y-1.5">
          <span className="text-xs text-black/50">Access password</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={fieldClass}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setPassword(generatePassword())}
            >
              <RefreshCw className="h-4 w-4" /> Generate
            </Button>
          </div>
          {passwordTooShort && password.length > 0 ? (
            <p className="text-xs text-red-600">
              Password must be at least 8 characters.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="font-serif text-xl text-[#3D421F]">Invite user</h2>
        <p className="mt-1 text-sm text-black/60">
          Create an account from HR staff details, or add someone outside the
          team.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = path === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setPath(tab.key);
                setSelectedId("");
              }}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "border-[#818a40] bg-[var(--venue-secondary)]/50 text-[#3D421F]"
                  : "border-black/10 text-black/60 hover:border-black/20"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {path === "external" ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ext-name" className="text-[#3D421F]">
                Full name
              </Label>
              <input
                id="ext-name"
                value={externalName}
                onChange={(e) => setExternalName(e.target.value)}
                placeholder="e.g. Jane Contractor"
                className={fieldClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ext-email" className="text-[#3D421F]">
                Email
              </Label>
              <input
                id="ext-email"
                type="email"
                value={externalEmail}
                onChange={(e) => setExternalEmail(e.target.value)}
                placeholder="jane@example.com"
                className={fieldClass}
              />
            </div>
          </div>
          <p className="text-xs text-black/50">
            External users are not linked to an HR staff record. Their login name
            is the first word of the full name.
          </p>

          {deliveryControls}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                isPending ||
                !externalName.trim() ||
                !externalEmail.trim() ||
                passwordTooShort
              }
              onClick={handleExternalInvite}
            >
              {isPending
                ? sendEmail
                  ? "Sending…"
                  : "Creating…"
                : sendEmail
                  ? "Send invitation"
                  : "Create account"}
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
            <input
              placeholder="Search staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(fieldClass, "pl-9")}
            />
          </div>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-black/10">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-black/50">
                {path === "other"
                  ? "No staff from other venues. With a single venue configured, this list is empty by design."
                  : "No inviteable staff found. Add a staff record in HR first, or all staff may already have accounts."}
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
                        <p className="font-medium text-[#3D421F]">
                          {s.full_name}
                        </p>
                        <p className="text-xs text-black/50">
                          {s.emp_no} · {s.home_venue?.name ?? "—"}
                          {s.position?.name ? ` · ${s.position.name}` : ""}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selected ? (
            <div className="space-y-3 rounded-lg bg-[var(--venue-secondary)]/40 p-4 text-sm">
              <p>
                <span className="text-black/50">Name:</span> {selected.full_name}
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-black/40">
                  Login email
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                      emailSource === "work"
                        ? "border-[#818a40] bg-white"
                        : "border-black/10 bg-white/60"
                    } ${!selected.work_email ? "opacity-50" : ""}`}
                  >
                    <input
                      type="radio"
                      name="email-source"
                      checked={emailSource === "work"}
                      disabled={!selected.work_email}
                      onChange={() => setEmailSource("work")}
                      className="accent-[#818a40]"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs text-black/50">Work</span>
                      <span className="block truncate text-[#3D421F]">
                        {selected.work_email ?? "Not set"}
                      </span>
                    </span>
                  </label>
                  <label
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                      emailSource === "personal"
                        ? "border-[#818a40] bg-white"
                        : "border-black/10 bg-white/60"
                    } ${!selected.personal_email ? "opacity-50" : ""}`}
                  >
                    <input
                      type="radio"
                      name="email-source"
                      checked={emailSource === "personal"}
                      disabled={!selected.personal_email}
                      onChange={() => setEmailSource("personal")}
                      className="accent-[#818a40]"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs text-black/50">
                        Personal
                      </span>
                      <span className="block truncate text-[#3D421F]">
                        {selected.personal_email ?? "Not set"}
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          {selected ? deliveryControls : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                !selectedId || !selectedEmail || isPending || passwordTooShort
              }
              onClick={handleStaffInvite}
            >
              {isPending
                ? sendEmail
                  ? "Sending…"
                  : "Creating…"
                : sendEmail
                  ? "Send invitation"
                  : "Create account"}
            </Button>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {credentials ? (
        <AccessCredentialsBox
          credentials={credentials}
          manageHref={
            createdUserId ? `/settings/users/${createdUserId}` : undefined
          }
        />
      ) : null}
      {inviteLink ? <InviteLinkBox link={inviteLink} /> : null}
    </Card>
  );
}
