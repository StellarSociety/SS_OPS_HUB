"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { Bell, Check, X } from "lucide-react";
import {
  deleteNotificationById,
  markNotificationAsRead,
} from "@/lib/actions/notifications";
import { formatDateOnly } from "@/lib/hr/derived";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import type { NotificationRow } from "@/lib/notifications/types";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type MobileNotificationsScreenProps = {
  venue: Venue;
  notifications: NotificationRow[];
  onSelectTab?: (tab: MobileTabItem) => void;
};

function severityDot(severity: NotificationRow["severity"]) {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-[var(--venue-primary,#818a40)]";
}

export function MobileNotificationsScreen({
  venue,
  notifications: initial,
  onSelectTab,
}: MobileNotificationsScreenProps) {
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-14">
        <h1 className="text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
          Notifications
        </h1>
        <p className="mt-1 text-center text-[13px] text-black/50 dark:text-white/50">
          User central notifications
        </p>
        <hr className="mt-3 border-black/10 dark:border-white/12" />

        {items.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-2 px-6 text-center">
            <Bell className="h-8 w-8 text-[#3D421F]/30 dark:text-white/30" />
            <p className="text-sm text-black/50 dark:text-white/50">
              No notifications for this venue.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((n) => {
              const unread = !n.read_at;
              return (
                <li
                  key={n.id}
                  className="flex gap-2 rounded-xl border border-black/10 bg-black/[0.03] p-3 dark:border-white/12 dark:bg-white/[0.08]"
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      severityDot(n.severity),
                      !unread && "opacity-40",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm text-[#3D421F] dark:text-[CanvasText]",
                        unread && "font-medium",
                      )}
                    >
                      {n.title}
                    </p>
                    {n.body ? (
                      <p className="mt-0.5 line-clamp-3 text-xs text-black/55 dark:text-white/55">
                        {n.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-black/40 dark:text-white/40">
                      {n.due_date
                        ? `Due ${formatDateOnly(n.due_date)}`
                        : formatDateOnly(n.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    {unread ? (
                      <button
                        type="button"
                        className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-[#3D421F] dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
                        aria-label="Mark as read"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            await markNotificationAsRead(n.id);
                            setItems((current) =>
                              current.map((item) =>
                                item.id === n.id
                                  ? { ...item, read_at: new Date().toISOString() }
                                  : item,
                              ),
                            );
                          });
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-red-600 dark:text-white/40 dark:hover:bg-white/10"
                      aria-label="Dismiss notification"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          await deleteNotificationById(n.id);
                          setItems((current) =>
                            current.filter((item) => item.id !== n.id),
                          );
                        });
                      }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <MobileTabBar
        app="notifications"
        activeId="inbox"
        venueSlug={venue.slug}
        onSelectTab={onSelectTab}
      />
    </div>
  );
}
