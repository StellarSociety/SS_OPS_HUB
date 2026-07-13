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
  MousePointerClick,
  SquareArrowOutUpRight,
  X,
} from "lucide-react";
import {
  getUserActivity,
  type ActivityItem,
  type ActivityKind,
} from "@/lib/actions/user-activity";

type UserActivityDialogProps = {
  userId: string;
  userName: string;
  onClose: () => void;
};

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
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getUserActivity(userId)
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

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

        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-black/50">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading activity…
            </div>
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
