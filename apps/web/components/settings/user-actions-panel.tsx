"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useScopedHref } from "@/components/providers/venue-scope-provider";
import { Ban, KeyRound, Mail, Pencil, RefreshCw, Send, Trash2 } from "lucide-react";
import {
  changeUserEmail,
  changeUserName,
  deleteUser,
  resendUserInvite,
  resetUserPassword,
  setUserPassword,
  suspendAllAccess,
} from "@/lib/actions/users";
import { inviteStatusOf, type UserListRow } from "@/lib/access/types";
import { AccessCredentialsBox } from "@/components/settings/access-credentials-box";
import { InviteLinkBox } from "@/components/settings/invite-link-box";
import { UserAvatarField } from "@/components/profile/user-avatar-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

/** The shared Input is styled for the dark login screen; this makes it legible
 * on the light settings cards. */
const lightInput =
  "border-black/10 bg-white text-[#3D421F] placeholder:text-black/40 focus-visible:ring-offset-white";

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

/** Confirmation shown when a user tries to leave an edit with unsaved changes. */
function ExitConfirmBar({
  onKeepEditing,
  onDiscard,
  onSave,
  saving,
  canSave,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
      <span className="text-xs font-medium text-amber-800">
        You have unsaved changes. What would you like to do?
      </span>
      <Button type="button" size="sm" onClick={onSave} disabled={saving || !canSave}>
        Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onKeepEditing}
        disabled={saving}
      >
        Keep editing
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={onDiscard}
        disabled={saving}
      >
        Cancel &amp; discard
      </Button>
    </div>
  );
}

export function UserActionsPanel({ user }: { user: UserListRow }) {
  const router = useRouter();
  const usersHref = useScopedHref("/settings/users");
  const [isPending, startTransition] = useTransition();
  const [editingEmail, setEditingEmail] = useState(false);
  const [email, setEmail] = useState(user.email);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user.full_name ?? "");
  const [cancelPrompt, setCancelPrompt] = useState<"name" | "email" | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [settingPw, setSettingPw] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const status = inviteStatusOf(user);
  const suspended = user.status !== "active";

  const nameDirty = name.trim() !== (user.full_name ?? "").trim();
  const emailDirty =
    email.trim().toLowerCase() !== user.email.trim().toLowerCase();
  const hasUnsavedChanges =
    (editingName && nameDirty) || (editingEmail && emailDirty);

  // Warn before leaving/reloading the tab while there are unsaved edits.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  function discardName() {
    setName(user.full_name ?? "");
    setEditingName(false);
    setCancelPrompt(null);
  }

  function discardEmail() {
    setEmail(user.email);
    setEditingEmail(false);
    setCancelPrompt(null);
  }

  /** Cancel an edit — asks for confirmation first if there are unsaved changes. */
  function attemptCancel(field: "name" | "email") {
    const dirty = field === "name" ? nameDirty : emailDirty;
    if (!dirty) {
      if (field === "name") discardName();
      else discardEmail();
      return;
    }
    setCancelPrompt(field);
  }

  function saveName() {
    run(async () => {
      const result = await changeUserName(user.id, name);
      if (!result.error) {
        setEditingName(false);
        setCancelPrompt(null);
      }
      return result;
    });
  }

  function saveEmail() {
    run(async () => {
      const result = await changeUserEmail(user.id, email);
      if (!result.error) {
        setEditingEmail(false);
        setCancelPrompt(null);
      }
      return result;
    });
  }

  type ActionResult = {
    error?: string;
    success?: string;
    warning?: string;
    inviteLink?: string;
    credentials?: Credentials;
  };

  function run(action: () => Promise<ActionResult>) {
    setInviteLink(null);
    setCredentials(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.credentials) {
        setCredentials(result.credentials);
        toast.saved(result.success ?? "Password set.");
      } else if (result.inviteLink) {
        setInviteLink(result.inviteLink);
        toast.alert(result.success ?? "Email not sent — copy the link below.");
      } else {
        toast.saved(result.success ?? "Done.");
      }
      router.refresh();
    });
  }

  return (
    <Card className="space-y-5 p-4 sm:p-6">
      {user.is_external ? (
        <>
          <UserAvatarField
            userId={user.id}
            avatarUrl={user.avatar_url}
            fullName={user.full_name}
            email={user.email}
          />
          <div className="border-t border-black/5" />
        </>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <h2 className="font-serif text-xl text-[#3D421F]">Account</h2>

          {/* Full name — editable and synced to Supabase */}
          {editingName ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label
                  htmlFor="display-name"
                  className="w-24 shrink-0 text-xs text-black/50"
                >
                  Full name
                </Label>
                <Input
                  id="display-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={cancelPrompt === "name"}
                  className={`w-64 ${lightInput}`}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || !nameDirty}
                  onClick={saveName}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => attemptCancel("name")}
                >
                  Cancel
                </Button>
              </div>
              {cancelPrompt === "name" ? (
                <ExitConfirmBar
                  saving={isPending}
                  canSave={nameDirty}
                  onSave={saveName}
                  onKeepEditing={() => setCancelPrompt(null)}
                  onDiscard={discardName}
                />
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-black/70">
              <span className="w-24 shrink-0 text-xs text-black/50">
                Full name
              </span>
              <span className="font-medium text-[#3D421F]">
                {user.full_name ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="inline-flex items-center gap-1 text-xs text-[#818a40] hover:underline"
              >
                <Pencil className="h-3 w-3" /> Change
              </button>
            </div>
          )}

          {/* Login email — editable and synced to Supabase */}
          {editingEmail ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label
                  htmlFor="login-email"
                  className="w-24 shrink-0 text-xs text-black/50"
                >
                  Login email
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={cancelPrompt === "email"}
                  className={`w-64 ${lightInput}`}
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || !emailDirty}
                  onClick={saveEmail}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => attemptCancel("email")}
                >
                  Cancel
                </Button>
              </div>
              {cancelPrompt === "email" ? (
                <ExitConfirmBar
                  saving={isPending}
                  canSave={emailDirty}
                  onSave={saveEmail}
                  onKeepEditing={() => setCancelPrompt(null)}
                  onDiscard={discardEmail}
                />
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-black/70">
              <span className="w-24 shrink-0 text-xs text-black/50">
                Login email
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-black/40" />
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => setEditingEmail(true)}
                className="inline-flex items-center gap-1 text-xs text-[#818a40] hover:underline"
              >
                <Pencil className="h-3 w-3" /> Change
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-black/50">
            <span>
              Status:{" "}
              <span className="font-medium text-black/70">
                {status === "accepted"
                  ? "Active"
                  : status === "pending"
                    ? "Pending invitation"
                    : "Disabled"}
              </span>
            </span>
            <span>Invited: {formatDate(user.invited_at)}</span>
            <span>Accepted: {formatDate(user.invite_accepted_at)}</span>
            <span>Last login: {formatDate(user.last_login_at)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-black/5 pt-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => run(() => resendUserInvite(user.id))}
        >
          <Send className="h-4 w-4" />
          {status === "pending" ? "Resend invitation email" : "Send invitation email"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => run(() => resetUserPassword(user.id))}
        >
          <KeyRound className="h-4 w-4" /> Send password reset
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => {
            setSettingPw((v) => !v);
            setPassword("");
          }}
        >
          <KeyRound className="h-4 w-4" /> Set password manually
        </Button>
        <Button
          type="button"
          variant={suspended ? "default" : "ghost"}
          size="sm"
          disabled={isPending}
          onClick={() => run(() => suspendAllAccess(user.id, !suspended))}
        >
          <Ban className="h-4 w-4" />
          {suspended ? "Restore access" : "Suspend all access"}
        </Button>
        {confirmingDelete ? (
          <div className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1">
            <span className="text-xs font-medium text-red-700">
              Delete permanently?
            </span>
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() =>
                run(async () => {
                  const result = await deleteUser(user.id);
                  if (!result.error) router.push(usersHref);
                  return result;
                })
              }
            >
              Yes, delete
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="h-4 w-4" /> Delete user
          </Button>
        )}
      </div>

      {settingPw ? (
        <div className="space-y-2 rounded-lg border border-black/10 bg-black/[0.015] p-3">
          <Label className="text-xs">New access password</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={`w-64 ${lightInput}`}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setPassword(generatePassword())}
            >
              <RefreshCw className="h-4 w-4" /> Generate
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isPending || password.length < 8}
              onClick={() =>
                run(async () => {
                  const result = await setUserPassword(user.id, password);
                  if (!result.error) {
                    setSettingPw(false);
                    setPassword("");
                  }
                  return result;
                })
              }
            >
              Set password
            </Button>
          </div>
          <p className="text-[11px] text-black/40">
            Sets the password directly and confirms the email so the user can sign
            in immediately.
          </p>
        </div>
      ) : null}

      {credentials ? <AccessCredentialsBox credentials={credentials} /> : null}
      {inviteLink ? <InviteLinkBox link={inviteLink} /> : null}
    </Card>
  );
}
