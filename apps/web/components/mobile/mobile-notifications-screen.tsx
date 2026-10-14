"use client";

import { useEffect, useState, useTransition, type CSSProperties } from "react";
import { Archive, ArchiveRestore, Bell, Check, CheckCheck, Trash2, X } from "lucide-react";
import Link from "next/link";
import {
  archiveNotificationById,
  archiveNotificationsByIds,
  deleteNotificationById,
  markNotificationAsRead,
  markNotificationsAsRead,
  unarchiveNotificationById,
} from "@/lib/actions/notifications";
import { formatDateOnly } from "@/lib/hr/derived";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { mobileHiringHref } from "@/lib/mobile/app-path";
import {
  mobileConnectConversationHref,
  mobileConnectFeedHref,
} from "@/lib/mobile/app-path";
import {
  hiringNotificationTarget,
  notificationCanonicalHref,
  type HiringNotificationTarget,
} from "@/lib/notifications/href";
import type { NotificationFolder } from "@/lib/notifications/folder";
import type { NotificationRow } from "@/lib/notifications/types";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type MobileNotificationsScreenProps = {
  venue: Venue;
  notifications: NotificationRow[];
  folder?: NotificationFolder;
  onSelectTab?: (tab: MobileTabItem) => void;
  /** Handle hiring taps in place instead of following the link (simulator). */
  onOpenHiring?: (target: HiringNotificationTarget) => void;
};

const COPY: Record<
  NotificationFolder,
  { title: string; subtitle: string; empty: string }
> = {
  inbox: {
    title: "Inbox",
    subtitle: "Active notices for this venue",
    empty: "No active notifications.",
  },
  alerts: {
    title: "Alerts",
    subtitle: "Warnings and critical notices that still need attention",
    empty: "No alerts right now.",
  },
  archive: {
    title: "Archive",
    subtitle: "Dismissed notices. Restore them, or delete for good.",
    empty: "Archive is empty.",
  },
};

const BULK_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] px-3 text-xs font-medium text-[#3D421F] active:bg-black/10 disabled:opacity-50 dark:border-white/12 dark:bg-white/[0.08] dark:text-[CanvasText] dark:active:bg-white/15";

function severityDot(severity: NotificationRow["severity"]) {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-[var(--venue-primary,#818a40)]";
}

export function MobileNotificationsScreen({
  venue,
  notifications: initial,
  folder = "inbox",
  onSelectTab,
  onOpenHiring,
}: MobileNotificationsScreenProps) {
  const [items, setItems] = useState(initial);
  const [pending, startTransition] = useTransition();
  const copy = COPY[folder];
  const unreadIds = items.filter((item) => !item.read_at).map((item) => item.id);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with refreshed server data
    setItems(initial);
  }, [initial]);

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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-4">
        <h1 className="text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
          {copy.title}
        </h1>
        <p className="mt-1 text-center text-sm text-black/50 dark:text-white/50">
          {copy.subtitle}
        </p>
        <hr className="mt-3 border-black/10 dark:border-white/12" />

        {folder !== "archive" && items.length > 0 ? (
          <div className="mt-3 flex items-center justify-end gap-2">
            {unreadIds.length > 0 ? (
              <button
                type="button"
                className={BULK_BUTTON}
                disabled={pending}
                onClick={() => {
                  const ids = unreadIds;
                  const readAt = new Date().toISOString();
                  startTransition(async () => {
                    const result = await markNotificationsAsRead(ids);
                    if ("error" in result) return;
                    setItems((current) =>
                      current.map((item) =>
                        ids.includes(item.id) ? { ...item, read_at: readAt } : item,
                      ),
                    );
                  });
                }}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            ) : null}
            <button
              type="button"
              className={BULK_BUTTON}
              disabled={pending}
              onClick={() => {
                const ids = items.map((item) => item.id);
                startTransition(async () => {
                  const result = await archiveNotificationsByIds(ids);
                  if ("error" in result) return;
                  setItems((current) => current.filter((item) => !ids.includes(item.id)));
                });
              }}
            >
              <Archive className="h-3.5 w-3.5" />
              Archive all
            </button>
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-2 px-6 text-center">
            <Bell className="h-8 w-8 text-[#3D421F]/30 dark:text-white/30" />
            <p className="text-sm text-black/50 dark:text-white/50">
              {copy.empty}
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((n) => {
              const unread = !n.read_at;
              const hiring = hiringNotificationTarget(n);
              const tapHref =
                hiring
                  ? mobileHiringHref(venue.slug, hiring)
                  : n.module_key === "team_connect" && n.entity === "chat_conversation"
                    ? mobileConnectConversationHref(venue.slug, n.entity_id)
                    : n.module_key === "team_connect" && n.entity === "connect_post"
                      ? (() => {
                          const [groupId, postId] = n.entity_id.split(":");
                          return groupId
                            ? mobileConnectFeedHref(venue.slug, groupId, postId)
                            : mobileConnectFeedHref(venue.slug);
                        })()
                  : notificationCanonicalHref(n);
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
                    {tapHref ? (
                      <Link
                        href={tapHref}
                        className="block"
                        onClick={(event) => {
                          if (hiring && onOpenHiring) {
                            event.preventDefault();
                            onOpenHiring(hiring);
                          }
                          if (!unread) return;
                          startTransition(async () => {
                            await markNotificationAsRead(n.id);
                            setItems((current) =>
                              current.map((item) =>
                                item.id === n.id
                                  ? {
                                      ...item,
                                      read_at: new Date().toISOString(),
                                    }
                                  : item,
                              ),
                            );
                          });
                        }}
                      >
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
                      </Link>
                    ) : (
                      <>
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
                      </>
                    )}
                    <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                      {n.due_date
                        ? `Due ${formatDateOnly(n.due_date)}`
                        : formatDateOnly(n.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    {folder === "archive" ? (
                      <>
                        <button
                          type="button"
                          className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-[#3D421F] dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
                          aria-label="Restore notification"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              await unarchiveNotificationById(n.id);
                              setItems((current) =>
                                current.filter((item) => item.id !== n.id),
                              );
                            });
                          }}
                        >
                          <ArchiveRestore className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-black/40 hover:bg-black/5 hover:text-red-600 dark:text-white/40 dark:hover:bg-white/10"
                          aria-label="Delete notification"
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
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
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
                                      ? {
                                          ...item,
                                          read_at: new Date().toISOString(),
                                        }
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
                          aria-label="Archive notification"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              await archiveNotificationById(n.id);
                              setItems((current) =>
                                current.filter((item) => item.id !== n.id),
                              );
                            });
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <MobileTabBar
        app="notifications"
        activeId={folder}
        venueSlug={venue.slug}
        onSelectTab={onSelectTab}
      />
    </div>
  );
}
