"use client";

import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  OctagonAlert,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteAllNotificationsForVenue,
  deleteNotificationById,
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/actions/notifications";
import { formatDateOnly } from "@/lib/hr/derived";
import type { NotificationRow } from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NotificationCenterProps = {
  venueId: string;
  isGlobalVenue: boolean;
  initialNotifications: NotificationRow[];
  initialUnreadCount: number;
};

const POLL_MS = 15_000;
const ALERT_SEVERITIES = new Set(["warning", "critical"]);

function severityDot(severity: NotificationRow["severity"]) {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-[#818a40]";
}

function notificationHref(n: NotificationRow): string | null {
  if (n.module_key === "sentiment" && n.entity === "sentiment_review") {
    return `/sentiment/justify/${n.entity_id}`;
  }
  if (n.module_key === "hr" && n.entity === "staff") {
    return `/hr/${n.entity_id}`;
  }
  if (n.module_key === "hr" && n.entity === "schedule_week") {
    return `/hr/schedules`;
  }
  if (n.module_key === "hr" && n.entity === "payroll_run") {
    return `/hr/payroll/${n.entity_id}`;
  }
  return null;
}

function isAlert(n: NotificationRow) {
  return ALERT_SEVERITIES.has(n.severity);
}

function sortAlerts(a: NotificationRow, b: NotificationRow) {
  if (a.severity !== b.severity) {
    return a.severity === "critical" ? -1 : 1;
  }
  if (a.due_date && b.due_date) {
    return a.due_date.localeCompare(b.due_date);
  }
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return b.created_at.localeCompare(a.created_at);
}

function matchesVenue(
  n: Pick<NotificationRow, "venue_id">,
  venueId: string,
  isGlobalVenue: boolean,
) {
  if (isGlobalVenue) return true;
  return n.venue_id === venueId;
}

function unreadCountFrom(list: NotificationRow[]) {
  return list.filter((n) => !n.read_at).length;
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
  const [alertOpen, setAlertOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string>>(
    new Set(initialNotifications.map((n) => n.id)),
  );
  /** Session-snoozed alert ids — popup stays closed until a new alert arrives. */
  const snoozedIdsRef = useRef<Set<string>>(new Set());

  const unreadAlerts = useMemo(
    () =>
      notifications
        .filter((n) => !n.read_at && isAlert(n))
        .slice()
        .sort(sortAlerts),
    [notifications],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setNotifications(initialNotifications);
    setUnreadCount(initialUnreadCount);
    knownIdsRef.current = new Set(initialNotifications.map((n) => n.id));
  }, [initialNotifications, initialUnreadCount]);

  useEffect(() => {
    if (unreadAlerts.length === 0) {
      setAlertOpen(false);
      return;
    }
    const hasUnsnoozed = unreadAlerts.some(
      (n) => !snoozedIdsRef.current.has(n.id),
    );
    if (hasUnsnoozed) setAlertOpen(true);
  }, [unreadAlerts]);

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

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const supabase = createClient();

    async function refreshFromServer(opts?: { forceAlert?: boolean }) {
      // Avoid stacking polls when middleware/auth is slow (otherwise the
      // browser aborts with an uncaught TypeError: Failed to fetch).
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await fetchNotifications({ venueId, isGlobalVenue });
        if (cancelled) return;

        const next = result.notifications;
        const newAlertIds: string[] = [];
        for (const n of next) {
          if (
            !n.read_at &&
            isAlert(n) &&
            matchesVenue(n, venueId, isGlobalVenue) &&
            !knownIdsRef.current.has(n.id)
          ) {
            newAlertIds.push(n.id);
          }
        }

        knownIdsRef.current = new Set(next.map((n) => n.id));
        setNotifications(next);
        setUnreadCount(result.unreadCount);

        if (newAlertIds.length > 0) {
          for (const id of newAlertIds) snoozedIdsRef.current.delete(id);
          setAlertOpen(true);
        } else if (opts?.forceAlert) {
          const alerts = next.filter(
            (n) =>
              !n.read_at &&
              isAlert(n) &&
              !snoozedIdsRef.current.has(n.id),
          );
          if (alerts.length > 0) setAlertOpen(true);
        }
      } catch {
        // Network / aborted server-action — keep last known notifications.
      } finally {
        inFlight = false;
      }
    }

    function applyRealtimeRow(
      eventType: "INSERT" | "UPDATE" | "DELETE",
      row: NotificationRow | null,
      oldRow: { id?: string } | null,
    ) {
      if (eventType === "DELETE") {
        const id = oldRow?.id;
        if (!id) return;
        knownIdsRef.current.delete(id);
        setNotifications((prev) => {
          const next = prev.filter((n) => n.id !== id);
          setUnreadCount(unreadCountFrom(next));
          return next;
        });
        return;
      }

      if (!row || !matchesVenue(row, venueId, isGlobalVenue)) return;

      const isNew = !knownIdsRef.current.has(row.id);
      knownIdsRef.current.add(row.id);

      setNotifications((prev) => {
        const idx = prev.findIndex((n) => n.id === row.id);
        const next =
          idx === -1
            ? [row, ...prev].slice(0, 40)
            : prev.map((n, i) => (i === idx ? row : n));
        setUnreadCount(unreadCountFrom(next));
        return next;
      });

      if (!row.read_at && isAlert(row) && (isNew || eventType === "INSERT")) {
        snoozedIdsRef.current.delete(row.id);
        setAlertOpen(true);
      }
    }

    const channel = supabase
      .channel(`notifications:${venueId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          if (cancelled) return;
          applyRealtimeRow(
            payload.eventType as "INSERT" | "UPDATE" | "DELETE",
            (payload.new as NotificationRow | null) ?? null,
            (payload.old as { id?: string } | null) ?? null,
          );
        },
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      void refreshFromServer();
    }, POLL_MS);

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void refreshFromServer({ forceAlert: true });
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [venueId, isGlobalVenue]);

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationAsRead(id);
      setNotifications((prev) => {
        const next = prev.map((n) =>
          n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
        );
        setUnreadCount(unreadCountFrom(next));
        return next;
      });
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
      setAlertOpen(false);
    });
  }

  function handleAcknowledgeAlerts() {
    const ids = unreadAlerts.map((n) => n.id);
    if (ids.length === 0) {
      setAlertOpen(false);
      return;
    }
    startTransition(async () => {
      await Promise.all(ids.map((id) => markNotificationAsRead(id)));
      const now = new Date().toISOString();
      setNotifications((prev) => {
        const idSet = new Set(ids);
        const next = prev.map((n) =>
          idSet.has(n.id) ? { ...n, read_at: now } : n,
        );
        setUnreadCount(unreadCountFrom(next));
        return next;
      });
      setAlertOpen(false);
    });
  }

  function handleDelete(id: string) {
    const removed = notifications.find((n) => n.id === id);
    startTransition(async () => {
      await deleteNotificationById(id);
      knownIdsRef.current.delete(id);
      setNotifications((prev) => {
        const next = prev.filter((n) => n.id !== id);
        if (removed && !removed.read_at) {
          setUnreadCount(unreadCountFrom(next));
        }
        return next;
      });
    });
  }

  function handleClearAll() {
    startTransition(async () => {
      await deleteAllNotificationsForVenue({ venueId, isGlobalVenue });
      knownIdsRef.current = new Set();
      setNotifications([]);
      setUnreadCount(0);
      setAlertOpen(false);
    });
  }

  const criticalCount = unreadAlerts.filter(
    (n) => n.severity === "critical",
  ).length;

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
          <div className="flex items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
            <p className="font-serif text-base text-[#3D421F]">Notifications</p>
            {notifications.length > 0 ? (
              <div className="flex shrink-0 items-center gap-0.5">
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-xs text-black/60"
                  disabled={pending}
                  onClick={handleClearAll}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear all
                </Button>
              </div>
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
                        <p
                          className={cn(
                            "mt-0.5 text-xs text-black/55",
                            n.type.startsWith("schedule_approval_")
                              ? "whitespace-pre-line line-clamp-8"
                              : "line-clamp-2",
                          )}
                        >
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-black/40">
                        {n.due_date
                          ? `Due ${formatDateOnly(n.due_date)}`
                          : formatDateOnly(n.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      {isUnread ? (
                        <button
                          type="button"
                          className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-[#3D421F]"
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
                      <button
                        type="button"
                        className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-red-600"
                        aria-label="Dismiss notification"
                        disabled={pending}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDelete(n.id);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
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

      {mounted && alertOpen && unreadAlerts.length > 0
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="alert-popup-title"
              aria-describedby="alert-popup-desc"
            >
              <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl shadow-black/20">
                <div
                  className={cn(
                    "flex items-start gap-3 border-b px-5 py-4",
                    criticalCount > 0
                      ? "border-red-100 bg-red-50"
                      : "border-amber-100 bg-amber-50",
                  )}
                >
                  {criticalCount > 0 ? (
                    <OctagonAlert
                      className="mt-0.5 h-6 w-6 shrink-0 text-red-600"
                      aria-hidden
                    />
                  ) : (
                    <AlertTriangle
                      className="mt-0.5 h-6 w-6 shrink-0 text-amber-600"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      id="alert-popup-title"
                      className="font-serif text-xl text-[#3D421F]"
                    >
                      {criticalCount > 0
                        ? "Critical alerts need attention"
                        : "Alerts need attention"}
                    </p>
                    <p
                      id="alert-popup-desc"
                      className="mt-1 text-sm text-black/60"
                    >
                      {unreadAlerts.length === 1
                        ? "1 unread alert — acknowledge so it isn’t missed."
                        : `${unreadAlerts.length} unread alerts — acknowledge so they aren’t missed.`}
                    </p>
                  </div>
                </div>

                <ul className="max-h-[min(50vh,22rem)] overflow-y-auto">
                  {unreadAlerts.map((n) => {
                    const href = notificationHref(n);
                    const row = (
                      <div className="flex gap-3 px-5 py-3.5">
                        <span
                          className={cn(
                            "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                            severityDot(n.severity),
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#3D421F]">
                            {n.title}
                          </p>
                          {n.body ? (
                            <p className="mt-0.5 text-xs leading-relaxed text-black/55">
                              {n.body}
                            </p>
                          ) : null}
                          <p className="mt-1.5 text-[11px] uppercase tracking-wide text-black/40">
                            {n.severity}
                            {n.due_date
                              ? ` · Due ${formatDateOnly(n.due_date)}`
                              : ""}
                          </p>
                        </div>
                      </div>
                    );

                    return (
                      <li
                        key={n.id}
                        className="border-b border-black/5 last:border-0"
                      >
                        {href ? (
                          <Link
                            href={href}
                            className="block hover:bg-black/[0.02]"
                            onClick={() => {
                              handleMarkRead(n.id);
                              setOpen(false);
                            }}
                          >
                            {row}
                          </Link>
                        ) : (
                          row
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/5 bg-[#F0F3DD]/40 px-5 py-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-black/60"
                    disabled={pending}
                    onClick={() => {
                      for (const n of unreadAlerts) {
                        snoozedIdsRef.current.add(n.id);
                      }
                      setAlertOpen(false);
                      setOpen(true);
                    }}
                  >
                    Review in inbox
                  </Button>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={handleAcknowledgeAlerts}
                  >
                    Acknowledge
                    {unreadAlerts.length > 1
                      ? ` all (${unreadAlerts.length})`
                      : ""}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
