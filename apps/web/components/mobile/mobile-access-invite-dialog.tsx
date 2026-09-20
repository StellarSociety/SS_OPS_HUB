"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Mail, RefreshCw, Send, X } from "lucide-react";
import { AccessCredentialsBox } from "@/components/settings/access-credentials-box";
import { InviteLinkBox } from "@/components/settings/invite-link-box";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  inviteStaffFromMatrix,
  type MobileAccessMatrixRow,
} from "@/lib/actions/mobile-user-access";
import { resendUserInvite } from "@/lib/actions/users";
import { cn } from "@/lib/utils";

type Credentials = { email: string; password: string; loginUrl: string };

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function generatePassword(length = 14): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) out += chars[arr[i]! % chars.length];
  return out;
}

function accountStatusLabel(row: MobileAccessMatrixRow): string {
  if (row.inviteStatus === "accepted") return "Active";
  if (row.inviteStatus === "pending") return "Pending invitation";
  if (row.inviteStatus === "disabled") return "Disabled";
  return "Not invited";
}

function defaultEmailSource(row: MobileAccessMatrixRow): "work" | "personal" {
  if (row.workEmail) return "work";
  return "personal";
}

export function MobileAccessInviteDialog({
  row,
  onClose,
  onInvited,
}: {
  row: MobileAccessMatrixRow;
  onClose: () => void;
  onInvited: (patch: Partial<MobileAccessMatrixRow>) => void;
}) {
  const [emailSource, setEmailSource] = useState<"work" | "personal">(() =>
    defaultEmailSource(row),
  );
  const [changingEmail, setChangingEmail] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [password, setPassword] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedEmail =
    emailSource === "work" ? row.workEmail : row.personalEmail;
  const displayEmail = row.userId ? row.email : selectedEmail;
  const canPickEmail = Boolean(row.workEmail) && Boolean(row.personalEmail) && !row.userId;
  const isResend = Boolean(row.userId);
  const passwordTooShort = !sendEmail && password.length < 8;
  const canSend =
    !isPending &&
    (isResend || Boolean(selectedEmail)) &&
    (sendEmail || password.length >= 8);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPending, onClose]);

  function submit() {
    startTransition(async () => {
      if (isResend) {
        const result = await resendUserInvite(row.userId!);
        if ("error" in result && result.error) {
          toast.error(result.error);
          return;
        }
        if ("inviteLink" in result && result.inviteLink) {
          setInviteLink(result.inviteLink);
          toast.alert(
            "success" in result && result.success
              ? result.success
              : "Email not sent — copy the link below.",
          );
          return;
        }
        toast.saved(
          "success" in result && result.success
            ? result.success
            : "Invitation resent.",
        );
        onClose();
        return;
      }

      if (!row.staffId) return;
      const result = await inviteStaffFromMatrix(row.staffId, {
        emailSource,
        sendEmail,
        password: sendEmail ? undefined : password,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if ("userId" in result && result.userId) {
        onInvited({
          userId: result.userId,
          inviteStatus: "pending",
          email: selectedEmail,
          invitedAt: new Date().toISOString(),
        });
      }
      if ("credentials" in result && result.credentials) {
        setCredentials(result.credentials);
        toast.saved(result.success ?? "Account created.");
        return;
      }
      if ("inviteLink" in result && result.inviteLink) {
        setInviteLink(result.inviteLink);
        toast.alert(result.success ?? "Account created — email not sent.");
        return;
      }
      toast.saved(result.success ?? "Invitation sent.");
      onClose();
    });
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[10vh] backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-access-invite-title"
        className="w-full max-w-3xl rounded-xl border border-black/5 bg-white/95 p-4 shadow-xl backdrop-blur-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="mobile-access-invite-title"
            className="font-serif text-xl text-[#3D421F]"
          >
            Account
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md p-1 text-black/40 hover:bg-black/[0.04] hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-black/70">
            <span className="w-24 shrink-0 text-xs text-black/50">Full name</span>
            <span className="font-medium text-[#3D421F]">{row.name}</span>
          </div>

          {changingEmail && canPickEmail ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-xs text-black/50">
                  Login email
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["work", "Work", row.workEmail],
                    ["personal", "Personal", row.personalEmail],
                  ] as const
                ).map(([value, label, email]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-2",
                      emailSource === value
                        ? "border-[#818a40] bg-white"
                        : "border-black/10 bg-white/60",
                      !email && "opacity-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="invite-email-source"
                      checked={emailSource === value}
                      disabled={!email}
                      onChange={() => setEmailSource(value)}
                      className="accent-[#818a40]"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs text-black/50">{label}</span>
                      <span className="block truncate text-sm text-[#3D421F]">
                        {email ?? "Not set"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setChangingEmail(false)}
              >
                Done
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-black/70">
              <span className="w-24 shrink-0 text-xs text-black/50">
                Login email
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-black/40" />
                {displayEmail ?? "No email on the staff record"}
              </span>
              {canPickEmail ? (
                <button
                  type="button"
                  onClick={() => setChangingEmail(true)}
                  className="text-xs text-[#818a40] hover:underline"
                >
                  Change
                </button>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-black/50">
            <span>
              Status:{" "}
              <span className="font-medium text-black/70">
                {accountStatusLabel(row)}
              </span>
            </span>
            <span>Invited: {formatDate(row.invitedAt)}</span>
            <span>Accepted: {formatDate(row.inviteAcceptedAt)}</span>
            <span>Last login: {formatDate(row.lastLoginAt)}</span>
          </div>
        </div>

        {!isResend ? (
          <div className="mt-5 space-y-3 rounded-lg border border-black/10 bg-black/[0.015] p-3">
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
                    className="h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none placeholder:text-black/40 focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
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
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-black/5 pt-4">
          <Button
            type="button"
            size="sm"
            disabled={!canSend}
            onClick={submit}
          >
            <Send className="h-4 w-4" />
            {isResend ? "Resend invitation email" : "Send invitation"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>

        {inviteLink ? <div className="mt-4"><InviteLinkBox link={inviteLink} /></div> : null}
        {credentials ? (
          <div className="mt-4">
            <AccessCredentialsBox credentials={credentials} />
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
