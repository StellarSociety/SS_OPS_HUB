"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, BookUser, MessageCirclePlus, Search, Users } from "lucide-react";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { ChatContextMenu, type ChatMenuState } from "@/components/connect/chat/chat-context-menu";
import { ChatModal } from "@/components/connect/chat/chat-modal";
import { GroupChatForm } from "@/components/connect/chat/group-chat-form";
import { ScopedLink } from "@/components/layout/scoped-link";
import {
  useRelativePathname,
  useVenueScope,
} from "@/components/providers/venue-scope-provider";
import { toast } from "@/components/ui/toast";
import { setChatArchived, startDirectChat } from "@/lib/actions/connect-chat";
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

/** Two-pane messenger: conversation list (live) + the open conversation. */
export function ChatShell({
  chats: initialChats,
  meId,
  people,
  canCreateGroups,
  venueName,
  venueBadgeUrl,
  children,
}: {
  chats: ChatSummary[];
  meId: string;
  people: ConnectPerson[];
  canCreateGroups: boolean;
  venueName: string;
  /** Venue favicon / badge shown on the Directory entry. */
  venueBadgeUrl: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = useRelativePathname();
  const { scope, slug } = useVenueScope();
  const segment = pathname.startsWith("/connect/chats/")
    ? (pathname.split("/")[3] ?? null)
    : null;
  const directoryOpen = segment === "directory";
  const activeId = segment && !directoryOpen ? segment : null;
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
    <div className="grid h-[calc(100dvh-7.5rem)] min-h-[520px] w-full overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm md:grid-cols-[320px_minmax(0,1fr)]">
      <aside
        className={cn(
          "flex min-h-0 flex-col border-r border-black/5",
          paneOpen ? "hidden md:flex" : "flex",
        )}
      >
        <div className="space-y-3 border-b border-black/5 p-4">
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-2xl text-[#2B2F16]">Chats</h1>
            <div className="flex gap-1">
              {canCreateGroups ? (
                <button
                  type="button"
                  onClick={() => setDialog("group")}
                  className="rounded-full p-2 text-[#3D421F] hover:bg-black/5"
                  title="New group chat"
                  aria-label="New group chat"
                >
                  <Users className="h-5 w-5" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setDialog("direct")}
                className="rounded-full bg-[var(--venue-primary,#818a40)] p-2 text-white hover:opacity-90"
                title="New message"
                aria-label="New message"
              >
                <MessageCirclePlus className="h-5 w-5" />
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-full bg-[#F0F2E8] px-3 py-2">
            <Search className="h-4 w-4 text-black/40" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/40"
            />
          </label>
          <div className="flex items-center gap-1.5">
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

        <div className={cn("border-b border-black/5 p-2", showArchived && "hidden")}>
          <ScopedLink
            href="/connect/chats/directory"
            className={cn(
              "flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-black/[0.04]",
              directoryOpen && "bg-[#E9ECD9] hover:bg-[#E9ECD9]",
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

        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
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
                <ScopedLink
                  href={`/connect/chats/${c.id}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, conversationId: c.id, archived: c.archived });
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-black/[0.04]",
                    c.id === activeId && "bg-[#E9ECD9] hover:bg-[#E9ECD9]",
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
              </li>
            ))
          )}
        </ul>
      </aside>

      <section className={cn("min-h-0 min-w-0", paneOpen ? "flex flex-col" : "hidden md:flex md:flex-col")}>
        {children}
      </section>

      <ChatContextMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onArchive={(id, archived) => void archive(id, archived)}
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
  );
}

export function ChatAvatar({
  chat,
  size = "md",
}: {
  chat: Pick<ChatSummary, "kind" | "title" | "photoUrl" | "color">;
  size?: "sm" | "md";
}) {
  if (chat.kind === "direct") {
    return <ConnectAvatar name={chat.title} photoUrl={chat.photoUrl} size={size} />;
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
                <ConnectAvatar name={p.name} photoUrl={p.photoUrl} size="sm" />
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
