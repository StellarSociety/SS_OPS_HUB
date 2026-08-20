"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  FilePlus2,
  FilePenLine,
  FileX2,
  Loader2,
  LogIn,
  LogOut,
  Monitor,
  MousePointerClick,
  SquareArrowOutUpRight,
  Wifi,
  X,
} from "lucide-react";
import {
  getUserActivity,
  getUserOnlineSessions,
  type ActivityItem,
  type ActivityKind,
  type OnlineSessionItem,
} from "@/lib/actions/user-activity";
import {
  segmentedSubNavLinkClass,
  segmentedSubNavShellClass,
} from "@/lib/sub-nav-ui";

type UserActivityDialogProps = {
  userId: string;
  userName: string;
  onClose: () => void;
};

type ActivityTab = "activity" | "online";

const TABS: { id: ActivityTab; label: string }[] = [
  { id: "activity", label: "Activity" },
  { id: "online", label: "Online Activity" },
];

const KIND_META: Record<
  ActivityKind,
  { Icon: typeof Clock; className: string }
> = {
  login: { Icon: LogIn, className: "bg-emerald-100 text-emerald-700" },
  logout: { Icon: LogOut, className: "bg-black/5 text-black/45" },
  module_access: {
    Icon: SquareArrowOutUpRight,
    className: "bg-[var(--venue-primary)]/15 text-[#818a40]",
  },
  page_view: {
    Icon: MousePointerClick,
    className: "bg-[var(--venue-primary)]/10 text-[#818a40]",
  },
  form_create: { Icon: FilePlus2, className: "bg-sky-100 text-sky-700" },
  form_update: { Icon: FilePenLine, className: "bg-amber-100 text-amber-700" },
  form_delete: { Icon: FileX2, className: "bg-rose-100 text-rose-700" },
  other: { Icon: Clock, className: "bg-black/5 text-black/45" },
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    timeStyle: "short",
  });
}

function sameCalendarDay(a: string, b: string): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

function formatUsageRange(from: string, until: string, isActive: boolean): string {
  const start = formatTime(from);
  if (isActive) return `${start} – now`;
  if (sameCalendarDay(from, until)) return `${start} – ${formatTime(until)}`;
  return `${formatWhen(from)} – ${formatWhen(until)}`;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return "< 1 min";
  const totalMin = Math.round(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes} min`;
}

function sessionEndLabel(session: OnlineSessionItem): string {
  if (session.is_active) return "Active now";
  if (session.end_reason === "logout") return "Signed out";
  if (session.end_reason === "replaced") return "New sign-in";
  return "Went idle";
}

/** Group items by calendar day for a scannable timeline. */
function dayLabel(value: string): string {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function UserActivityDialog({
  userId,
  userName,
  onClose,
}: UserActivityDialogProps) {
  const [tab, setTab] = useState<ActivityTab>("activity");
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [sessions, setSessions] = useState<OnlineSessionItem[] | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [loadingOnline, setLoadingOnline] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoadingActivity(true);
    getUserActivity(userId)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setLoadingActivity(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    let active = true;
    setLoadingOnline(true);
    getUserOnlineSessions(userId)
      .then((data) => {
        if (active) setSessions(data);
      })
      .catch(() => {
        if (active) setSessions([]);
      })
      .finally(() => {
        if (active) setLoadingOnline(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const loading = tab === "activity" ? loadingActivity : loadingOnline;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Activity for ${userName}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-black/10 bg-[#faf9f6] shadow-xl">
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Clock className="h-5 w-5 text-[#818a40]" />
            <div>
              <h2 className="font-serif text-lg leading-tight text-[#3D421F]">
                Activity history
              </h2>
              <p className="text-xs text-black/50">{userName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-black/50 transition-colors hover:bg-black/5 hover:text-[#3D421F]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-black/10 px-5 py-3">
          <nav
            aria-label="Activity sections"
            className={segmentedSubNavShellClass}
            role="tablist"
          >
            {TABS.map(({ id, label }) => {
              const selected = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(id)}
                  className={segmentedSubNavLinkClass(selected)}
                >
                  <span className="min-w-0 truncate">{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-black/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tab === "online" ? "Loading online activity…" : "Loading activity…"}
            </div>
          ) : tab === "online" ? (
            !sessions || sessions.length === 0 ? (
              <p className="py-12 text-center text-sm text-black/50">
                No sign-ins recorded yet. Each login and how long they stayed
                active will appear here.
              </p>
            ) : (
              <OnlineTimeline sessions={sessions} />
            )
          ) : !items || items.length === 0 ? (
            <p className="py-12 text-center text-sm text-black/50">
              No activity recorded yet. Sign-ins, app visits and form entries
              will appear here.
            </p>
          ) : (
            <ActivityTimeline items={items} />
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  const groups: { day: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const day = dayLabel(item.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.day}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/40">
            {group.day}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const meta = KIND_META[item.kind] ?? KIND_META.other;
              const Icon = meta.Icon;
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-black/[0.03]"
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.className}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[#3D421F]">
                      {item.label}
                      {item.detail ? (
                        <span className="text-black/45"> · {item.detail}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-black/40">
                    {formatWhen(item.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function OnlineTimeline({ sessions }: { sessions: OnlineSessionItem[] }) {
  const groups: { day: string; sessions: OnlineSessionItem[] }[] = [];
  for (const session of sessions) {
    const day = dayLabel(session.started_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.sessions.push(session);
    else groups.push({ day, sessions: [session] });
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.day}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-black/40">
            {group.day}
          </p>
          <ul className="space-y-1">
            {group.sessions.map((session) => {
              const fromLogin = session.started_by === "login";
              const Icon = fromLogin ? LogIn : Wifi;
              return (
                <li
                  key={session.id}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-black/[0.03]"
                >
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      session.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : fromLogin
                          ? "bg-[var(--venue-primary)]/15 text-[#818a40]"
                          : "bg-black/5 text-black/45"
                    }`}
                  >
                    {session.is_active ? (
                      <Monitor className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-[#3D421F]">
                      {fromLogin ? "Signed in" : "Came back online"}
                    </span>
                    <span className="mt-0.5 block text-sm text-[#3D421F]">
                      Using the app{" "}
                      <span className="text-black/55">
                        {formatUsageRange(
                          session.used_from,
                          session.used_until,
                          session.is_active,
                        )}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-black/40">
                      Active for {formatDuration(session.duration_ms)}
                      {session.is_active ? (
                        <>
                          {" · "}
                          <span className="font-medium text-emerald-700">
                            {sessionEndLabel(session)}
                          </span>
                        </>
                      ) : (
                        <span className="text-black/30">
                          {" "}
                          · {sessionEndLabel(session)}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-black/40">
                    {formatWhen(session.used_from)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
