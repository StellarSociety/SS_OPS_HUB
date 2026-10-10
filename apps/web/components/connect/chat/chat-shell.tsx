"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  BookUser,
  MessageCircle,
  MessageCirclePlus,
  Newspaper,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { GroupBadge } from "@/components/connect/group-icon";
import {
  PresenceAvatar,
  PresenceProvider,
  PresenceRing,
  usePresence,
} from "@/components/connect/presence";
import type { PresenceStatus } from "@/lib/connect/presence";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { ChatContextMenu, type ChatMenuState } from "@/components/connect/chat/chat-context-menu";
import { SwipeRow } from "@/components/connect/chat/swipe-row";
import { ChatExtraPane } from "@/components/connect/chat/chat-extra-pane";
import { ChatModal } from "@/components/connect/chat/chat-modal";
import { ChatPanesContext } from "@/components/connect/chat/chat-panes-context";
import { GroupChatForm } from "@/components/connect/chat/group-chat-form";
import { ScopedLink } from "@/components/layout/scoped-link";
import {
  useRelativePathname,
  useVenueScope,
} from "@/components/providers/venue-scope-provider";
import { toast } from "@/components/ui/toast";
import { markChatUnread, setChatArchived, startDirectChat } from "@/lib/actions/connect-chat";
import { formatPostTime } from "@/lib/connect/format";
import {
  chatPreviewText,
  type ChatMessageRow,
  type ChatSummary,
} from "@/lib/connect/chat-types";
import type { ConnectPerson } from "@/lib/connect/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toScopedHref } from "@/lib/venue/scope-routing";

const MAX_EXTRA_PANES = 2;
/** Connecteam renders slightly smaller than the rest of the Hub. */
const UI_SCALE = 0.9;

/** Two-pane messenger: conversation list (live) + the open conversation. */
export function ChatShell({
  chats: initialChats,
  meId,
  people,
  canCreateGroups,
  venueName,
  venueBadgeUrl,
  feedGroups,
  canManageGroups,
  presence,
  children,
}: {
  chats: ChatSummary[];
  meId: string;
  people: ConnectPerson[];
  canCreateGroups: boolean;
  venueName: string;
  /** Venue favicon / badge shown on the Directory entry. */
  venueBadgeUrl: string | null;
  /** Feed groups shown in the list like contacts. */
  feedGroups: { id: string; name: string; icon: string; color: string; memberCount: number }[];
  canManageGroups: boolean;
  presence: Record<string, PresenceStatus>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = useRelativePathname();
  const { scope, slug } = useVenueScope();
  const segment = pathname.startsWith("/connect/chats/")
    ? (pathname.split("/")[3] ?? null)
    : null;
  const directoryOpen = segment === "directory";
  const feedOpen = segment === "feed";
  const feedGroupId = feedOpen ? (pathname.split("/")[4] ?? null) : null;
  const activeId = segment && !directoryOpen && !feedOpen ? segment : null;
  /** Liquid-glass list only in the Feed view (over the shared feed backdrop). */
  const glass = feedOpen;
  const ui = glass
    ? {
        divider: "border-white/60",
        field: "bg-white/55 ring-1 ring-white/70",
        hover: "hover:bg-white/45",
        selected: "bg-white/75 shadow-sm ring-1 ring-white/80 hover:bg-white/75",
      }
    : {
        divider: "border-black/5",
        field: "bg-[#F0F2E8]",
        hover: "hover:bg-black/[0.04]",
        selected: "bg-[#E9ECD9] hover:bg-[#E9ECD9]",
      };
  // On phones the list and the open pane (a chat or the Directory) swap places.
  const paneOpen = Boolean(segment);

  const [chats, setChats] = useState(initialChats);
  const [synced, setSynced] = useState(initialChats);
  if (synced !== initialChats) {
    setSynced(initialChats);
    setChats(initialChats);
  }

  // Latest values for the realtime callback (subscribed once).
  const activeIdRef = useRef(activeId);
  const knownIdsRef = useRef(new Set(initialChats.map((c) => c.id)));
  useEffect(() => {
    activeIdRef.current = activeId;
    knownIdsRef.current = new Set(chats.map((c) => c.id));
  }, [activeId, chats]);

  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "direct" | "group">("all");
  const [dialog, setDialog] = useState<"direct" | "group" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<ChatMenuState>(null);

  // Extra chat windows opened side by side (right-click → Open side by side).
  // The shell lives in the Chats layout, so these stay open while you switch chats.
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const shownExtras = useMemo(
    () =>
      activeId
        ? extraIds.filter((id) => id !== activeId && chats.some((c) => c.id === id))
        : [],
    [activeId, extraIds, chats],
  );

  function openSide(conversationId: string) {
    if (!activeId) {
      router.push(toScopedHref(`/connect/chats/${conversationId}`, scope, slug));
      return;
    }
    if (conversationId === activeId) return;
    setExtraIds((prev) =>
      prev.includes(conversationId)
        ? prev
        : [...prev, conversationId].slice(-MAX_EXTRA_PANES),
    );
  }

  const panes = useMemo(
    () => ({
      closePane: (conversationId: string) => {
        if (conversationId !== activeId) {
          setExtraIds((prev) => prev.filter((id) => id !== conversationId));
          return;
        }
        // Closing the main chat promotes the next window, or returns to the list.
        const next = shownExtras[0];
        setExtraIds((prev) => prev.filter((id) => id !== next));
        router.push(toScopedHref(next ? `/connect/chats/${next}` : "/connect/chats", scope, slug));
      },
    }),
    [activeId, shownExtras, router, scope, slug],
  );

  async function archive(conversationId: string, archived: boolean) {
    setChats((prev) => prev.map((c) => (c.id === conversationId ? { ...c, archived } : c)));
    const result = await setChatArchived(conversationId, archived);
    if (!result.ok) {
      setChats((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, archived: !archived } : c)),
      );
      toast.error(result.error);
      return;
    }
    toast.saved(archived ? "Chat archived." : "Chat moved back to your chats.");
  }

  async function markUnread(conversationId: string) {
    const result = await markChatUnread(conversationId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setChats((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: Math.max(1, c.unreadCount) } : c)),
    );
    // Leave the chat so opening it doesn't mark it read straight away.
    if (conversationId === activeId) router.push(toScopedHref("/connect/chats", scope, slug));
  }
  const [pending, startTransition] = useTransition();

  // Live list: bump the conversation, update its preview and unread count.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("chat-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          if (!knownIdsRef.current.has(row.conversation_id)) {
            // A chat we don't have yet (someone just messaged or added us).
            router.refresh();
            return;
          }
          setChats((prev) => {
            const idx = prev.findIndex((c) => c.id === row.conversation_id);
            if (idx === -1) return prev;
            const current = prev[idx]!;
            const sender = people.find((p) => p.userId === row.sender_id);
            const updated: ChatSummary = {
              ...current,
              lastMessage: {
                body: row.body,
                kind: row.kind,
                senderId: row.sender_id,
                senderName: sender?.name ?? null,
                hasAttachment: Boolean(row.attachment_url),
                deleted: false,
                createdAt: row.created_at,
              },
              activityAt: row.created_at,
              archived: false,
              unreadCount:
                row.kind === "message" &&
                row.sender_id !== meId &&
                row.conversation_id !== activeIdRef.current
                  ? current.unreadCount + 1
                  : current.unreadCount,
            };
            return [updated, ...prev.filter((_, i) => i !== idx)];
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [meId, people, router]);

  // Opening a chat clears its unread badge in the list.
  const [clearedFor, setClearedFor] = useState<string | null>(null);
  if (activeId && clearedFor !== activeId) {
    setClearedFor(activeId);
    setChats((prev) => prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c)));
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats
      .filter((c) => c.archived === showArchived)
      .filter((c) => kindFilter === "all" || c.kind === kindFilter)
      .filter((c) => !q || c.title.toLowerCase().includes(q));
  }, [chats, query, kindFilter, showArchived]);
  const archivedCount = chats.filter((c) => c.archived).length;
  const totalUnreadChats = chats.filter((c) => c.unreadCount > 0 && !c.archived).length;
  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? feedGroups.filter((g) => g.name.toLowerCase().includes(q)) : feedGroups;
  }, [feedGroups, query]);

  const unreadByKind = useMemo(() => {
    const totals = { all: 0, direct: 0, group: 0 };
    for (const c of chats) {
      if (c.unreadCount === 0 || c.archived !== showArchived) continue;
      totals.all += 1;
      totals[c.kind] += 1;
    }
    return totals;
  }, [chats, showArchived]);

  function openDirect(userId: string) {
    startTransition(async () => {
      const result = await startDirectChat(userId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDialog(null);
      router.push(toScopedHref(`/connect/chats/${result.id}`, scope, slug));
      router.refresh();
    });
  }

  return (
    <PresenceProvider initial={presence}>
    <div
      className={cn(
        "grid h-full min-h-[520px] w-full overflow-hidden rounded-2xl border border-black/5 shadow-sm md:grid-cols-[20rem_1fr]",
        // Feed view: one continuous colour backdrop under the glass list and the posts.
        feedOpen ? "feed-backdrop" : "bg-white",
      )}
      // Everything in Connecteam renders ~10% smaller (percentage sizes still fill the page).
      style={{ zoom: UI_SCALE }}
    >
      <aside
        className={cn(
          "flex min-h-0 flex-col",
          glass ? "liquid-glass" : "border-r border-black/5",
          paneOpen ? "hidden md:flex" : "flex",
        )}
      >
        <div
          className={cn(
            "border-b px-4",
            ui.divider,
            // Feed view: same frosted bar as the feed header beside it.
            feedOpen
              ? "flex h-16 shrink-0 flex-col justify-center bg-[#fbfaf6]"
              : "space-y-3 py-4",
          )}
        >
          {/* Search, with the new-chat buttons beside it (chats view only). */}
          <div className="flex items-center gap-1.5">
            <label className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2", ui.field)}>
              <Search className="h-4 w-4 text-black/40" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={feedOpen ? "Search feeds" : "Search chats and feeds"}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/40"
              />
            </label>
            {!feedOpen && canCreateGroups ? (
              <button
                type="button"
                onClick={() => setDialog("group")}
                className="shrink-0 rounded-full p-2 text-[#3D421F] hover:bg-black/5"
                title="New group chat"
                aria-label="New group chat"
              >
                <Users className="h-5 w-5" />
              </button>
            ) : null}
            {!feedOpen ? (
              <button
                type="button"
                onClick={() => setDialog("direct")}
                className="shrink-0 rounded-full bg-[var(--venue-primary,#818a40)] p-2 text-white hover:opacity-90"
                title="New message"
                aria-label="New message"
              >
                <MessageCirclePlus className="h-5 w-5" />
              </button>
            ) : null}
          </div>
          <div className={cn("flex items-center gap-1.5", feedOpen && "hidden")}>
          <div className="grid flex-1 grid-cols-3 gap-1 rounded-full bg-[#F0F2E8] p-1" role="tablist" aria-label="Filter chats">
            {(
              [
                ["all", "All"],
                ["direct", "Direct"],
                ["group", "Groups"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={kindFilter === key}
                onClick={() => setKindFilter(key)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-medium",
                  kindFilter === key
                    ? "bg-white text-[#2B2F16] shadow-sm"
                    : "text-black/55 hover:text-black/75",
                )}
              >
                {label}
                {unreadByKind[key] > 0 ? (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E5484D] px-1 text-[10px] font-semibold text-white">
                    {unreadByKind[key]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-pressed={showArchived}
            title={showArchived ? "Back to chats" : "Archived chats"}
            aria-label={showArchived ? "Back to chats" : `Archived chats (${archivedCount})`}
            className={cn(
              "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
              showArchived
                ? "bg-[var(--venue-primary,#818a40)] text-white"
                : "bg-[#F0F2E8] text-black/55 hover:text-[#2B2F16]",
            )}
          >
            <Archive className="h-4 w-4" />
            {!showArchived && archivedCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/55 px-1 text-[10px] font-semibold text-white">
                {archivedCount}
              </span>
            ) : null}
          </button>
          </div>
        </div>

        {showArchived ? (
          <div className="flex items-center gap-2 border-b border-black/5 bg-[#F7F8F2] px-4 py-2 text-xs text-black/55">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className="inline-flex items-center gap-1 font-medium text-[#2B2F16] hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Chats
            </button>
            <span>· Archived chats return when a new message arrives.</span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("border-b p-2", ui.divider, showArchived && "hidden")}>
          <ScopedLink
            href="/connect/chats/feed"
            className={cn(
              "flex items-center gap-3 rounded-xl px-2.5 py-2.5",
              ui.hover,
              // Hidden while the all-groups feed is open; shown from a group feed to get back.
              feedOpen && !feedGroupId && "hidden",
            )}
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white ring-2 ring-white">
              <Newspaper className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-[#2B2F16]">
                {venueName} Feed
              </span>
              <span className="block truncate text-[13px] text-black/55">
                Posts from all your groups
              </span>
            </span>
          </ScopedLink>
          {feedOpen ? (
            <ScopedLink
              href="/connect/chats"
              className="flex items-center gap-3 rounded-xl bg-white/85 px-2.5 py-2.5 shadow-sm ring-1 ring-black/5 hover:bg-white"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white ring-2 ring-white">
                <MessageCircle className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-[#2B2F16]">Chats</span>
                <span className="block truncate text-[13px] text-black/55">
                  {totalUnreadChats > 0
                    ? `${totalUnreadChats} unread conversation${totalUnreadChats === 1 ? "" : "s"}`
                    : "Your conversations"}
                </span>
              </span>
              {totalUnreadChats > 0 ? (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#E5484D] px-1.5 text-[11px] font-semibold text-white">
                  {totalUnreadChats}
                </span>
              ) : null}
            </ScopedLink>
          ) : null}
          <ScopedLink
            href="/connect/chats/directory"
            className={cn(
              cn("flex items-center gap-3 rounded-xl px-2.5 py-2.5", ui.hover),
              feedOpen && "hidden",
              directoryOpen && ui.selected,
            )}
          >
            {venueBadgeUrl ? (
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-white shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- venue favicon */}
                <img src={venueBadgeUrl} alt="" className="h-8 w-8 object-contain" />
              </span>
            ) : (
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white ring-2 ring-white">
                <BookUser className="h-5 w-5" aria-hidden />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-[#2B2F16]">
                {venueName} Directory
              </span>
              <span className="block truncate text-[13px] text-black/55">
                {people.length - 1 > 0
                  ? `${people.length - 1} people you can message`
                  : "Everyone on the team"}
              </span>
            </span>
          </ScopedLink>
        </div>

        {/* Feed groups appear under Feed only while a feed is open (or when searching). */}
        {!showArchived && (feedOpen || query.trim()) && visibleGroups.length > 0 ? (
          <div className={cn("border-b p-2", ui.divider)}>
            <p className="flex items-center justify-between px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-black/45">
              Feeds
              {canManageGroups ? (
                <ScopedLink
                  href="/connect/settings"
                  className="rounded-full p-1 text-black/40 hover:bg-black/5 hover:text-black/70"
                  title="Manage groups"
                  aria-label="Manage groups"
                >
                  <Settings className="h-3.5 w-3.5" />
                </ScopedLink>
              ) : null}
            </p>
            {visibleGroups.map((g) => (
              <ScopedLink
                key={g.id}
                href={`/connect/chats/feed/${g.id}`}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-2.5 py-2",
                  ui.hover,
                  feedGroupId === g.id && ui.selected,
                )}
              >
                <GroupBadge
                  icon={g.icon}
                  color={g.color}
                  className="h-11 w-11 rounded-full ring-2 ring-white"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-[#2B2F16]">
                    {g.name}
                  </span>
                  <span className="block truncate text-[13px] text-black/55">
                    {g.memberCount} member{g.memberCount === 1 ? "" : "s"}
                  </span>
                </span>
              </ScopedLink>
            ))}
          </div>
        ) : null}

        <ul className={cn("p-2", feedOpen && "hidden")}>
          {filtered.length === 0 ? (
            <li className="px-3 py-10 text-center text-sm text-black/50">
              {chats.length === 0 ? (
                <>
                  No chats yet.
                  <button
                    type="button"
                    onClick={() => setDialog("direct")}
                    className="mt-2 block w-full font-semibold text-[var(--venue-primary,#818a40)] hover:underline"
                  >
                    Start a conversation
                  </button>
                </>
              ) : showArchived ? (
                "No archived chats."
              ) : query.trim() ? (
                "No chats match your search."
              ) : kindFilter === "group" ? (
                "No group chats yet."
              ) : (
                "No direct messages yet."
              )}
            </li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <SwipeRow
                  archived={c.archived}
                  onMarkUnread={c.lastMessage ? () => void markUnread(c.id) : undefined}
                  onArchive={() => void archive(c.id, !c.archived)}
                  className="rounded-xl bg-white"
                >
                <ScopedLink
                  href={`/connect/chats/${c.id}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, conversationId: c.id, archived: c.archived });
                  }}
                  className={cn(
                    cn("flex items-center gap-3 rounded-xl px-2.5 py-2.5", ui.hover),
                    c.id === activeId && ui.selected,
                  )}
                >
                  <ChatAvatar chat={c} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-[15px] text-[#2B2F16]",
                          c.unreadCount > 0 ? "font-semibold" : "font-medium",
                        )}
                      >
                        {c.title}
                      </span>
                      <time
                        className={cn(
                          "shrink-0 text-[11px]",
                          c.unreadCount > 0 ? "font-semibold text-[#E5484D]" : "text-black/45",
                        )}
                        suppressHydrationWarning
                      >
                        {formatPostTime(c.activityAt)}
                      </time>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-[13px]",
                          c.unreadCount > 0 ? "font-medium text-[#2B2F16]" : "text-black/55",
                        )}
                      >
                        {chatPreviewText(c, meId)}
                      </span>
                      {c.unreadCount > 0 ? (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#E5484D] px-1.5 text-[11px] font-semibold text-white">
                          {c.unreadCount > 99 ? "99+" : c.unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </ScopedLink>
                </SwipeRow>
              </li>
            ))
          )}
        </ul>
        </div>
      </aside>

      <ChatPanesContext.Provider value={activeId ? panes : null}>
        <section
          className={cn(
            "min-h-0 min-w-0 overflow-x-auto",
            !feedOpen && "bg-white",
            paneOpen ? "flex" : "hidden md:flex",
          )}
        >
          <div className={cn("flex min-h-0 flex-1 flex-col", shownExtras.length > 0 && "min-w-[320px]")}>
            {children}
          </div>
          {shownExtras.map((id) => (
            <div
              key={id}
              className="hidden min-h-0 min-w-[320px] flex-1 flex-col border-l border-black/10 md:flex"
            >
              <ChatExtraPane conversationId={id} />
            </div>
          ))}
        </section>
      </ChatPanesContext.Provider>

      <ChatContextMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onArchive={(id, archived) => void archive(id, archived)}
        onOpenSide={openSide}
        onMarkUnread={(id) => void markUnread(id)}
      />

      {dialog === "direct" ? (
        <PeoplePicker
          people={people.filter((p) => p.userId !== meId)}
          pending={pending}
          onPick={openDirect}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "group" ? (
        <ChatModal title="New group chat" onClose={() => setDialog(null)}>
          <GroupChatForm
            people={people.filter((p) => p.userId !== meId)}
            onDone={(id) => {
              setDialog(null);
              router.push(toScopedHref(`/connect/chats/${id}`, scope, slug));
              router.refresh();
            }}
          />
        </ChatModal>
      ) : null}
    </div>
    </PresenceProvider>
  );
}

export function ChatAvatar({
  chat,
  size = "md",
}: {
  chat: Pick<ChatSummary, "kind" | "title" | "photoUrl" | "color"> & {
    otherUserId?: string | null;
  };
  size?: "sm" | "md";
}) {
  const status = usePresence(chat.kind === "direct" ? chat.otherUserId : null);
  if (chat.kind === "direct") {
    return (
      <PresenceRing status={status}>
        <ConnectAvatar
          name={chat.title}
          photoUrl={chat.photoUrl}
          size={size}
          className={status !== "offline" ? "ring-0" : undefined}
        />
      </PresenceRing>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white",
        size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm",
      )}
      style={{ backgroundColor: chat.color }}
      aria-hidden
    >
      <Users className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}

function PeoplePicker({
  people,
  pending,
  onPick,
  onClose,
}: {
  people: ConnectPerson[];
  pending: boolean;
  onPick: (userId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? people.filter((p) =>
        [p.name, p.positionName, p.departmentName]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
    : people;

  return (
    <ChatModal title="New message" onClose={onClose}>
      <label className="mb-3 flex items-center gap-2 rounded-full bg-[#F0F2E8] px-3 py-2">
        <Search className="h-4 w-4 text-black/40" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/40"
        />
      </label>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-black/50">Nobody found.</p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {shown.map((p) => (
            <li key={p.userId}>
              <button
                type="button"
                disabled={pending}
                onClick={() => onPick(p.userId)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-black/[0.04] disabled:opacity-60"
              >
                <PresenceAvatar userId={p.userId} name={p.name} photoUrl={p.photoUrl} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[#2B2F16]">{p.name}</span>
                  <span className="block truncate text-xs text-black/50">
                    {[p.positionName, p.departmentName].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ChatModal>
  );
}
