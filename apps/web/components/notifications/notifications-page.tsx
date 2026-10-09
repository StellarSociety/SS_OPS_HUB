"use client";

import { useState, useTransition } from "react";
import {
  Archive,
  ArchiveRestore,
  Bell,
  Check,
  CheckCheck,
  ClipboardCheck,
  Inbox,
  Layers,
  MessagesSquare,
  Search,
  Trash2,
  UserSearch,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { toast } from "@/components/ui/toast";
import {
  archiveNotificationById,
  deleteNotificationById,
  markNotificationAsRead,
  unarchiveNotificationById,
} from "@/lib/actions/notifications";
import { formatDateOnly } from "@/lib/hr/derived";
import {
  NOTIFICATION_CATEGORY_LABELS,
  notificationCategory,
  type NotificationCategory,
} from "@/lib/notifications/category";
import { isArchivedNotification } from "@/lib/notifications/folder";
import { notificationCanonicalHref } from "@/lib/notifications/href";
import type { NotificationRow } from "@/lib/notifications/types";
import { pillSubNavLinkClass, pillSubNavShellClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

export type NotificationsTab = "all" | NotificationCategory | "archive";

const TABS: { value: NotificationsTab; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "All", icon: Inbox },
  { value: "people", label: "People", icon: Users },
  { value: "approvals", label: "Approvals", icon: ClipboardCheck },
  { value: "candidates", label: "Candidates", icon: UserSearch },
  { value: "social", label: "Feed & Chats", icon: MessagesSquare },
  { value: "others", label: "Others", icon: Layers },
  { value: "archive", label: "Archive", icon: Archive },
];

const CATEGORY_BADGE: Record<NotificationCategory, string> = {
  people: "border-sky-200/80 bg-sky-50 text-sky-900",
  approvals: "border-amber-200/80 bg-amber-50 text-amber-900",
  candidates: "border-violet-200/80 bg-violet-50 text-violet-900",
  social: "border-emerald-200/80 bg-emerald-50 text-emerald-900",
  others: "border-black/10 bg-black/[0.03] text-black/60",
};

function severityDot(severity: NotificationRow["severity"]) {
  if (severity === "critical") return "bg-red-500";
  if (severity === "warning") return "bg-amber-500";
  return "bg-[#818a40]";
}

function inTab(n: NotificationRow, tab: NotificationsTab): boolean {
  const archived = isArchivedNotification(n);
  if (tab === "archive") return archived;
  if (archived) return false;
  return tab === "all" || notificationCategory(n) === tab;
}

function newestFirst(
  a: NotificationRow,
  b: NotificationRow,
  tab: NotificationsTab,
) {
  if (tab === "archive") {
    return (b.archived_at ?? "").localeCompare(a.archived_at ?? "");
  }
  return b.created_at.localeCompare(a.created_at);
}

export function NotificationsPage({
  initialNotifications,
  initialTab,
}: {
  initialNotifications: NotificationRow[];
  initialTab: NotificationsTab;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [tab, setTab] = useState<NotificationsTab>(initialTab);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toDelete, setToDelete] = useState<NotificationRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  function selectTab(next: NotificationsTab) {
    setTab(next);
    // Keep the tab in the URL so refresh and shared links land on it.
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  function patch(ids: string[], change: Partial<NotificationRow>) {
    const idSet = new Set(ids);
    setNotifications((prev) =>
      prev.map((n) => (idSet.has(n.id) ? { ...n, ...change } : n)),
    );
  }

  const q = search.trim().toLowerCase();
  const visible = notifications
    .filter((n) => inTab(n, tab))
    .filter((n) => !unreadOnly || tab === "archive" || !n.read_at)
    .filter(
      (n) =>
        !q ||
        n.title.toLowerCase().includes(q) ||
        (n.body ?? "").toLowerCase().includes(q),
    )
    .sort((a, b) => newestFirst(a, b, tab));

  const unreadVisible = visible.filter((n) => !n.read_at);

  function markRead(ids: string[]) {
    if (ids.length === 0) return;
    startTransition(async () => {
      await Promise.all(ids.map((id) => markNotificationAsRead(id)));
      patch(ids, { read_at: new Date().toISOString() });
    });
  }

  function archive(ids: string[]) {
    if (ids.length === 0) return;
    startTransition(async () => {
      await Promise.all(ids.map((id) => archiveNotificationById(id)));
      patch(ids, { archived_at: new Date().toISOString() });
      toast.saved(
        ids.length === 1
          ? "Moved to Archive."
          : `${ids.length} notifications moved to Archive.`,
      );
    });
  }

  function restore(id: string) {
    startTransition(async () => {
      await unarchiveNotificationById(id);
      patch([id], { archived_at: null });
      toast.saved("Restored.");
    });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const result = await deleteNotificationById(toDelete.id);
    setDeleting(false);
    if ("error" in result && result.error) {
      toast.error(result.error);
      return;
    }
    setNotifications((prev) => prev.filter((n) => n.id !== toDelete.id));
    setToDelete(null);
    toast.saved("Notification deleted.");
  }

  return (
    <div className="space-y-4">
      <nav
        aria-label="Notification categories"
        className={pillSubNavShellClass}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.value;
          const inThisTab = notifications.filter((n) => inTab(n, t.value));
          const count =
            t.value === "archive"
              ? inThisTab.length
              : inThisTab.filter((n) => !n.read_at).length;
          return (
            <button
              key={t.value}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => selectTab(t.value)}
              className={pillSubNavLinkClass(active)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span>{t.label}</span>
              {count > 0 ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] tabular-nums tracking-normal",
                    t.value === "archive"
                      ? "bg-black/5 text-black/50"
                      : "bg-[#E11D48] text-white",
                  )}
                  title={t.value === "archive" ? "Archived" : "Unread"}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications…"
            className="h-9 w-full rounded-md border border-black/10 bg-white pl-9 pr-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
          />
        </div>
        {tab !== "archive" ? (
          <>
            <label className="inline-flex items-center gap-2 text-sm text-black/60">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              Unread only
            </label>
            <button
              type="button"
              disabled={pending || unreadVisible.length === 0}
              onClick={() => markRead(unreadVisible.map((n) => n.id))}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-[#3D421F] transition hover:bg-black/5 disabled:opacity-40"
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
            <button
              type="button"
              disabled={pending || visible.length === 0}
              onClick={() => archive(visible.map((n) => n.id))}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-[#3D421F] transition hover:bg-black/5 disabled:opacity-40"
            >
              <Archive className="h-4 w-4" /> Archive all
            </button>
          </>
        ) : (
          <p className="text-xs text-black/45">
            Archived notifications can be restored or deleted permanently.
          </p>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center text-sm text-black/50">
            <Bell className="h-6 w-6 text-black/25" aria-hidden />
            {q || unreadOnly
              ? "No notifications match your filters."
              : tab === "archive"
                ? "Nothing archived."
                : "You're all caught up."}
          </div>
        ) : (
          <ul>
            {visible.map((n) => {
              const href = notificationCanonicalHref(n);
              const isUnread = !n.read_at && tab !== "archive";
              const category = notificationCategory(n);
              const body = (
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={cn(
                        "text-sm text-[#3D421F]",
                        isUnread && "font-semibold",
                      )}
                    >
                      {n.title}
                    </p>
                    {tab === "all" || tab === "archive" ? (
                      <span
                        className={cn(
                          "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          CATEGORY_BADGE[category],
                        )}
                      >
                        {NOTIFICATION_CATEGORY_LABELS[category]}
                      </span>
                    ) : null}
                  </div>
                  {n.body ? (
                    <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-black/55">
                      {n.body}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-black/40">
                    {formatDateOnly(n.created_at)}
                    {n.due_date ? ` · Due ${formatDateOnly(n.due_date)}` : ""}
                    {tab === "archive" && n.archived_at
                      ? ` · Archived ${formatDateOnly(n.archived_at)}`
                      : ""}
                  </p>
                </div>
              );

              return (
                <li
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 border-b border-black/5 px-4 py-3 last:border-0",
                    isUnread && "bg-[#F0F3DD]/40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      severityDot(n.severity),
                      !isUnread && "opacity-40",
                    )}
                    aria-hidden
                  />
                  {href ? (
                    <Link
                      href={href}
                      className="min-w-0 flex-1 rounded hover:opacity-80"
                      onClick={() => {
                        if (isUnread) markRead([n.id]);
                      }}
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                  <div className="flex shrink-0 items-center gap-0.5">
                    {tab === "archive" ? (
                      <>
                        <button
                          type="button"
                          title="Restore"
                          aria-label="Restore notification"
                          disabled={pending}
                          onClick={() => restore(n.id)}
                          className="rounded p-1.5 text-black/40 hover:bg-black/5 hover:text-[#3D421F]"
                        >
                          <ArchiveRestore className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete permanently"
                          aria-label="Delete notification permanently"
                          disabled={pending}
                          onClick={() => setToDelete(n)}
                          className="rounded p-1.5 text-black/40 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        {isUnread ? (
                          <button
                            type="button"
                            title="Mark as read"
                            aria-label="Mark as read"
                            disabled={pending}
                            onClick={() => markRead([n.id])}
                            className="rounded p-1.5 text-black/40 hover:bg-black/5 hover:text-[#3D421F]"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          title="Archive"
                          aria-label="Archive notification"
                          disabled={pending}
                          onClick={() => archive([n.id])}
                          className="rounded p-1.5 text-black/40 hover:bg-black/5 hover:text-[#3D421F]"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDeleteDialog
        open={toDelete != null}
        title="Delete this notification?"
        description="It is removed permanently and cannot be restored."
        subject={
          toDelete ? <p className="font-medium">{toDelete.title}</p> : null
        }
        confirmLabel="Delete"
        pending={deleting}
        onClose={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
