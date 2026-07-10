"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/actions/notifications";
import { formatDateOnly } from "@/lib/hr/derived";
import type { NotificationRow } from "@/lib/notifications/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NotificationCenterProps = {
  venueId: string;
  isGlobalVenue: boolean;
  initialNotifications: NotificationRow[];
  initialUnreadCount: number;
};

function severityDot(severity: NotificationRow["severity"]) {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-[#808A3E]";
}

function notificationHref(n: NotificationRow): string | null {
  if (n.module_key === "hr" && n.entity === "staff") {
    return `/hr/${n.entity_id}`;
  }
  return null;
}

export function NotificationCenter({
  venueId,
  isGlobalVenue,
  initialNotifications,
  initialUnreadCount,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] =
    useState<NotificationRow[]>(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotifications(initialNotifications);
    setUnreadCount(initialUnreadCount);
  }, [initialNotifications, initialUnreadCount]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onPointerDown);
      return () => document.removeEventListener("mousedown", onPointerDown);
    }
  }, [open]);

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationAsRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsAsRead({ venueId, isGlobalVenue });
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (n.read_at ? n : { ...n, read_at: now })),
      );
      setUnreadCount(0);
    });
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-[#3D421F] hover:bg-black/5"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,24rem)] overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <p className="font-serif text-base text-[#3D421F]">Notifications</p>
            {unreadCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs text-black/60"
                disabled={pending}
                onClick={handleMarkAllRead}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </Button>
            ) : null}
          </div>

          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-black/50">
                No notifications for this venue.
              </li>
            ) : (
              notifications.map((n) => {
                const href = notificationHref(n);
                const isUnread = !n.read_at;
                const content = (
                  <>
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        severityDot(n.severity),
                        !isUnread && "opacity-40",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm text-[#3D421F]",
                          isUnread && "font-medium",
                        )}
                      >
                        {n.title}
                      </p>
                      {n.body ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-black/55">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-black/40">
                        {n.due_date
                          ? `Due ${formatDateOnly(n.due_date)}`
                          : formatDateOnly(n.created_at)}
                      </p>
                    </div>
                    {isUnread ? (
                      <button
                        type="button"
                        className="shrink-0 rounded p-1 text-black/40 hover:bg-black/5 hover:text-[#3D421F]"
                        aria-label="Mark as read"
                        disabled={pending}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleMarkRead(n.id);
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : null}
                  </>
                );

                return (
                  <li
                    key={n.id}
                    className={cn(
                      "border-b border-black/5 last:border-0",
                      isUnread && "bg-[#F0F3DD]/40",
                    )}
                  >
                    {href ? (
                      <Link
                        href={href}
                        className="flex gap-3 px-4 py-3 hover:bg-black/[0.02]"
                        onClick={() => setOpen(false)}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="flex gap-3 px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
