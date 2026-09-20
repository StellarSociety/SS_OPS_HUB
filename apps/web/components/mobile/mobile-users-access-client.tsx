"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Activity, Bell, ChevronDown, Loader2, Search, Smartphone } from "lucide-react";
import { StaffDirectoryLink } from "@/components/hr/staff-directory-link";
import { StaffPhotoThumbnail } from "@/components/hr/staff-photo-thumbnail";
import { UserActivityDialog } from "@/components/settings/user-activity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { sendMobileAppReinstallPush } from "@/lib/actions/mobile-installs";
import {
  isCurrentMobileAppVersion,
  mobileInstallDeviceSummary,
  mobileInstallStatusLabel,
  type MobileInstallStatus,
  type MobileUsersAccessRow,
} from "@/lib/mobile/installs";
import {
  PWA_APP_RELEASED_AT,
  PWA_APP_RELEASE_NOTES,
  PWA_APP_VERSION,
  pwaAppVersionLabel,
  pwaPreviousAppReleases,
} from "@/lib/pwa/constants";
import { cn } from "@/lib/utils";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const STATUS_FILTERS: { value: "all" | MobileInstallStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "installed_current", label: "Installed" },
  { value: "installed_outdated", label: "Outdated" },
  { value: "browser_only", label: "Browser only" },
  { value: "never_opened", label: "Not opened" },
];

function statusClass(status: MobileInstallStatus): string {
  switch (status) {
    case "installed_current":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "installed_outdated":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "browser_only":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "never_opened":
      return "border-black/10 bg-black/5 text-black/60";
  }
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-4 py-3 text-center">
      <p className="text-2xl font-semibold tabular-nums text-[#3D421F]">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-black/50">{label}</p>
    </div>
  );
}

export function MobileUsersAccessClient({
  records,
}: {
  records: MobileUsersAccessRow[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | MobileInstallStatus>("all");
  const [confirm, setConfirm] = useState<{
    userIds?: string[];
    names: string[];
    pushNames: string[];
    inboxOnlyNames: string[];
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activityUser, setActivityUser] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const previousReleases = useMemo(() => pwaPreviousAppReleases(), []);

  const stats = useMemo(() => {
    return {
      total: records.length,
      installed: records.filter(
        (row) =>
          row.status === "installed_current" ||
          row.status === "installed_outdated",
      ).length,
      outdated: records.filter((row) => row.status === "installed_outdated")
        .length,
      neverOpened: records.filter((row) => row.status === "never_opened")
        .length,
    };
  }, [records]);

  const outdatedTargets = useMemo(
    () =>
      records.filter(
        (row) =>
          row.status === "installed_outdated" &&
          row.accountStatus !== "disabled",
      ),
    [records],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!needle) return true;
      const hay = [row.name, row.email, row.empNo ?? "", row.appVersion ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [query, records, status]);

  function openBulkConfirm() {
    setConfirm({
      names: outdatedTargets.map((row) => row.name),
      pushNames: outdatedTargets
        .filter((row) => row.canPush)
        .map((row) => row.name),
      inboxOnlyNames: outdatedTargets
        .filter((row) => !row.canPush)
        .map((row) => row.name),
    });
  }

  function openRowConfirm(row: MobileUsersAccessRow) {
    setConfirm({
      userIds: [row.userId],
      names: [row.name],
      pushNames: row.canPush ? [row.name] : [],
      inboxOnlyNames: row.canPush ? [] : [row.name],
    });
  }

  function sendConfirmed() {
    if (!confirm || pending) return;
    const userIds = confirm.userIds;
    startTransition(async () => {
      const result = await sendMobileAppReinstallPush(
        userIds ? { userIds } : undefined,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.pushedNames.length > 0 && result.inboxOnlyNames.length > 0) {
        toast.saved(
          `Phone alert: ${result.pushedNames.join(", ")}. Notification center: ${result.inboxOnlyNames.join(", ")}.`,
        );
      } else if (result.inboxOnlyNames.length > 0) {
        toast.saved(
          `Sent to their notification center: ${result.inboxOnlyNames.join(", ")}.`,
        );
      } else {
        const who =
          result.sentNames.length === 1
            ? result.sentNames[0]
            : `${result.sentNames.length} people`;
        toast.saved(`Sent update instructions to ${who}.`);
      }
      setConfirm(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="w-full space-y-3">
        <div className="rounded-xl border border-black/10 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--venue-secondary,#F0F3DD)] text-[#3D421F]">
              <Smartphone className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-semibold tabular-nums leading-none text-[#3D421F]">
                {pwaAppVersionLabel(PWA_APP_VERSION)}
              </p>
              <p className="mt-1 text-xs text-black/50">Current mobile app</p>
            </div>
          </div>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm leading-relaxed text-[#3D421F]">
              {PWA_APP_RELEASE_NOTES}
            </span>
            <span className="text-xs text-black/50">
              Released {formatWhen(PWA_APP_RELEASED_AT)}
            </span>
          </p>
        </div>
        {previousReleases.length > 0 ? (
          <div className="rounded-xl border border-black/10 bg-white">
            <button
              type="button"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((open) => !open)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
            >
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-[#3D421F]">
                  Previous versions
                </span>
                <span className="text-xs text-black/50">
                  {previousReleases
                    .map((release) => pwaAppVersionLabel(release.version))
                    .join(" · ")}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-black/35 transition-transform",
                  historyOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {historyOpen ? (
              <ul className="space-y-3 border-t border-black/10 px-4 py-3">
                {previousReleases.map((release) => (
                  <li key={release.version}>
                    <p className="text-sm font-semibold tabular-nums text-[#3D421F]">
                      {pwaAppVersionLabel(release.version)}
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-black/65">
                      {release.notes}
                    </p>
                    <p className="mt-1 text-xs text-black/45">
                      Released {formatWhen(release.releasedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="text-sm text-black/60">
        People with Mobile App access at this venue. Phones that have not
        opened the current build report as outdated (version unknown).
      </p>

      <div className="flex flex-nowrap items-stretch gap-3">
        <Stat label="With access" value={stats.total} />
        <Stat label="Installed" value={stats.installed} />
        <Stat label="Outdated" value={stats.outdated} />
        <Stat label="Not opened" value={stats.neverOpened} />
        <Button
          type="button"
          className="h-auto shrink-0 self-stretch px-4"
          disabled={outdatedTargets.length === 0}
          title={
            outdatedTargets.length === 0
              ? "No outdated phones to notify."
              : "Send reinstall instructions by phone alert and notification center"
          }
          onClick={openBulkConfirm}
        >
          <Bell className="h-4 w-4" />
          Send update instructions
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/35" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, emp no, version…"
            className="h-10 pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as "all" | MobileInstallStatus)
          }
          className="h-10 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 bg-white/60 px-4 py-10 text-center text-sm text-black/50">
          {records.length === 0
            ? "No one has Mobile App access at this venue yet."
            : "No users match this search."}
        </p>
      ) : (
        <div className="overflow-auto rounded-xl border border-black/10 bg-white">
          <table className="w-max min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)] text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">User</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Version</th>
                <th className="px-3 py-2.5 font-medium">Device</th>
                <th className="px-3 py-2.5 font-medium">Last opened</th>
                <th className="px-3 py-2.5 font-medium">Update</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.userId}
                  className="border-b border-black/5 last:border-0"
                >
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <StaffPhotoThumbnail
                        photoUrl={row.photoUrl}
                        fullName={row.name}
                        empNo={row.empNo}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-[#3D421F]">{row.name}</p>
                        <p className="text-xs text-black/45">
                          {row.staffId && row.empNo ? (
                            <StaffDirectoryLink
                              staffId={row.staffId}
                              empNo={row.empNo}
                            />
                          ) : (
                            row.empNo || row.email
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        statusClass(row.status),
                      )}
                    >
                      {mobileInstallStatusLabel(row.status)}
                    </span>
                    {row.accountStatus === "disabled" ? (
                      <span className="ml-1.5 text-[11px] text-black/40">
                        Disabled
                      </span>
                    ) : row.invitePending ? (
                      <span className="ml-1.5 text-[11px] text-black/40">
                        Invite pending
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-black/70">
                    {row.appVersion ? (
                      <span className="font-mono text-xs">
                        {pwaAppVersionLabel(row.appVersion)}
                        {isCurrentMobileAppVersion(row.appVersion)
                          ? ""
                          : " · old"}
                      </span>
                    ) : row.status === "never_opened" ? (
                      "—"
                    ) : (
                      <span className="text-xs text-black/50">Unknown</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-black/70">
                    {mobileInstallDeviceSummary(row.devices) || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-black/60">
                    <div className="flex items-center gap-2">
                      <span>{formatWhen(row.lastSeenAt)}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setActivityUser({
                            userId: row.userId,
                            name: row.name,
                          })
                        }
                        aria-label={`View activity history for ${row.name}`}
                        title="Activity history"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition-colors hover:border-[var(--venue-primary)]/40 hover:bg-[var(--venue-secondary)]/40"
                      >
                        <Activity className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={row.accountStatus === "disabled" || pending}
                      title={
                        row.accountStatus === "disabled"
                          ? "This account is disabled"
                          : row.canPush
                            ? "Send a phone alert and a notice in Notifications"
                            : "Send a notice to their notification center"
                      }
                      onClick={() => openRowConfirm(row)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/10 bg-white px-2.5 text-xs font-medium text-[#3D421F] transition-colors hover:border-[var(--venue-primary)]/40 hover:bg-[var(--venue-secondary)]/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Bell className="h-3.5 w-3.5" />
                      Send
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activityUser ? (
        <UserActivityDialog
          userId={activityUser.userId}
          userName={activityUser.name}
          initialTab="online"
          onClose={() => setActivityUser(null)}
        />
      ) : null}

      {confirm ? (
        <ReinstallPushDialog
          names={confirm.names}
          pushNames={confirm.pushNames}
          inboxOnlyNames={confirm.inboxOnlyNames}
          busy={pending}
          onCancel={() => {
            if (!pending) setConfirm(null);
          }}
          onConfirm={sendConfirmed}
        />
      ) : null}
    </div>
  );
}

function ReinstallPushDialog({
  names,
  pushNames,
  inboxOnlyNames,
  busy,
  onCancel,
  onConfirm,
}: {
  names: string[];
  pushNames: string[];
  inboxOnlyNames: string[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reinstall-push-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-xl">
        <h2
          id="reinstall-push-title"
          className="font-serif text-xl text-[#3D421F]"
        >
          Send update instructions
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-black/65">
          Asks them to delete the Home Screen icon, then Add to Home Screen
          again from the install page. Everyone gets a notice in Notifications.
          People with device notifications on also get a phone alert.
        </p>
        {names.length > 0 ? (
          <p className="mt-3 text-sm text-[#3D421F]">
            Will notify:{" "}
            <span className="font-medium">{names.join(", ")}</span>
          </p>
        ) : null}
        {pushNames.length > 0 ? (
          <p className="mt-2 text-sm text-black/60">
            Phone alert:{" "}
            <span className="font-medium text-[#3D421F]">
              {pushNames.join(", ")}
            </span>
          </p>
        ) : null}
        {inboxOnlyNames.length > 0 ? (
          <p className="mt-2 text-sm text-black/60">
            Notification center only:{" "}
            <span className="font-medium text-[#3D421F]">
              {inboxOnlyNames.join(", ")}
            </span>
            . They have not enabled device notifications.
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-[#3D421F]"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || names.length === 0}
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Send notification
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
