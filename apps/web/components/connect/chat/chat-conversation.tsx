"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, ChevronDown, ChevronUp, Download, FileText, Info, Megaphone, Paperclip, Plus, Search, SendHorizontal, Trash2, X } from "lucide-react";
import { ChatAvatar } from "@/components/connect/chat/chat-shell";
import { PresenceLabel, usePresence } from "@/components/connect/presence";
import { AttachmentTrigger } from "@/components/connect/chat/chat-attachment";
import { ChatBackdrop } from "@/components/connect/chat/chat-backdrop";
import { MessageTicks } from "@/components/connect/chat/message-ticks";
import {
  ComposerBanner,
  GestureBubble,
  MessageMenu,
  ReplyQuote,
  type MessageMenuAction,
  type MessageMenuState,
} from "@/components/connect/chat/message-actions";
import { useChatReceipts } from "@/components/connect/chat/use-chat-receipts";
import { ChatInfoPanel } from "@/components/connect/chat/chat-info-panel";
import { useChatPanes } from "@/components/connect/chat/chat-panes-context";
import { DropOverlay, useFileDrop } from "@/components/connect/chat/use-file-drop";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { encodeTypedMentions } from "@/components/connect/mention-people";
import { MentionText } from "@/components/connect/mention-text";
import { MentionTextarea } from "@/components/connect/mention-textarea";
import { decodeMentions } from "@/lib/connect/mentions";
import { ScopedLink } from "@/components/layout/scoped-link";
import { toast } from "@/components/ui/toast";
import {
  deleteChatMessage,
  editChatMessage,
  fetchChatMessages,
  markChatRead,
  sendChatMessage,
} from "@/lib/actions/connect-chat";
import { formatFileSize, isImageAttachment } from "@/lib/connect/format";
import {
  CHAT_MAX_MESSAGE_CHARS,
  mapChatMessageRow,
  replyPreviewOf,
  type ChatDetail,
  type ChatMessage,
  type ChatMessageRow,
  type ReplyPreview,
} from "@/lib/connect/chat-types";
import { CONNECT_MAX_FILE_BYTES, type ConnectPerson } from "@/lib/connect/types";
import { receiptStatus, type ChatReceipts } from "@/lib/connect/chat-receipts";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type UiMessage = ChatMessage & { pending?: boolean };

const GROUP_GAP_MS = 5 * 60 * 1000;

function dubaiDayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dayLabel(iso: string): string {
  const key = dubaiDayKey(iso);
  const today = dubaiDayKey(new Date().toISOString());
  const yesterday = dubaiDayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const [y, m, d] = key.split("-");
  return `${d}-${m}-${y!.slice(2)}`;
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function ChatConversation({
  detail,
  initialMessages,
  initialHasMore,
  me,
  venuePeople,
  backHref = "/connect/chats",
  onBack,
  readOnly = false,
}: {
  detail: ChatDetail;
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
  me: ConnectPerson | null;
  venuePeople: ConnectPerson[];
  backHref?: string;
  /** Simulator: back as a callback instead of a link, always shown. */
  onBack?: () => void;
  /** Previewing someone else's chat: no sending, no read marking. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const panes = useChatPanes();
  const meId = me?.userId ?? "";
  const otherStatus = usePresence(detail.kind === "direct" ? detail.otherUserId : null);
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  // Lifted from the composer so a file dropped anywhere on the chat attaches.
  const [file, setFile] = useState<File | null>(null);
  const { dragging, dropProps } = useFileDrop(setFile, detail.canPost && !readOnly);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const peopleById = useMemo(() => {
    const map = new Map<string, ConnectPerson>();
    for (const p of venuePeople) map.set(p.userId, p);
    for (const m of detail.members) map.set(m.userId, m.person);
    return map;
  }, [venuePeople, detail.members]);

  const scheduleRead = useCallback(() => {
    if (readOnly) return;
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      if (document.visibilityState === "visible") void markChatRead(detail.id);
    }, 600);
  }, [detail.id, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    void markChatRead(detail.id);
    const onVisible = () => {
      if (document.visibilityState === "visible") void markChatRead(detail.id);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [detail.id, readOnly]);

  // Real-time: new and updated (deleted) messages in this chat.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${detail.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${detail.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const msg = mapChatMessageRow(payload.new as ChatMessageRow);
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) {
              return prev.map((m) => (m.id === msg.id ? { ...msg, replyTo: m.replyTo } : m));
            }
            let next = prev;
            if (msg.senderId === meId) {
              // Our own message echoed back before the send action returned.
              const pendingIdx = prev.findIndex((m) => m.pending && m.body === msg.body);
              if (pendingIdx !== -1) next = prev.filter((_, i) => i !== pendingIdx);
            }
            return [...next, msg];
          });
          if (payload.eventType === "INSERT") {
            if (msg.kind === "system") router.refresh();
            if (msg.senderId !== meId) scheduleRead();
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [detail.id, meId, router, scheduleRead]);

  // Keep the view pinned to the newest message unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    const oldest = messages.find((m) => !m.pending);
    if (!oldest) return;
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    const result = await fetchChatMessages(detail.id, oldest.createdAt);
    setLoadingOlder(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    stickToBottom.current = false;
    setMessages((prev) => [...result.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
    setHasMore(result.hasMore);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  const { receipts, refresh: refreshReceipts } = useChatReceipts(readOnly ? null : detail.id);

  function onSent(tempId: string, message: ChatMessage | null) {
    if (message) refreshReceipts();
    setMessages((prev) => {
      const withoutTemp = prev.filter((m) => m.id !== tempId);
      if (!message || withoutTemp.some((m) => m.id === message.id)) return withoutTemp;
      return [...withoutTemp, message];
    });
  }

  function addPending(message: UiMessage) {
    stickToBottom.current = true;
    setMessages((prev) => [...prev, message]);
  }

  // ---- Message menu: reply, edit, read by, delete ------------------------
  const [menu, setMenu] = useState<MessageMenuState>(null);
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null);
  const [editing, setEditing] = useState<UiMessage | null>(null);
  const canModerate = detail.myRole === "admin" && detail.kind === "group";

  function actionsFor(m: UiMessage): MessageMenuAction[] {
    if (m.pending || m.kind !== "message" || m.deletedAt) return [];
    const mine = m.senderId === meId;
    const actions: MessageMenuAction[] = [];
    if (!mine && detail.canPost) actions.push("reply");
    if (mine && m.body.trim()) actions.push("edit");
    if (mine || canModerate) actions.push("delete");
    return actions;
  }

  function openMenu(m: UiMessage, x: number, y: number) {
    if (readOnly) return;
    const actions = actionsFor(m);
    const showReadBy = m.senderId === meId && !m.deletedAt && !m.pending && m.kind === "message";
    if (actions.length || showReadBy) {
      setMenu({ x, y, messageId: m.id, actions, readBy: showReadBy ? { sentAt: m.createdAt } : undefined });
    }
  }

  function startReply(m: UiMessage) {
    setEditing(null);
    setReplyTo(replyPreviewOf(m));
  }

  function onMenuAction(action: MessageMenuAction, messageId: string) {
    const m = messages.find((x) => x.id === messageId);
    if (!m) return;
    if (action === "reply") startReply(m);
    if (action === "edit") {
      setReplyTo(null);
      setEditing(m);
    }
    if (action === "delete") {
      if (!window.confirm("Delete this message for everyone?")) return;
      void deleteChatMessage(m.id).then((result) => {
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setMessages((prev) =>
          prev.map((x) =>
            x.id === m.id ? { ...x, body: "", attachment: null, deletedAt: new Date().toISOString() } : x,
          ),
        );
      });
    }
  }

  async function saveEdit(body: string): Promise<boolean> {
    if (!editing) return false;
    const result = await editChatMessage(editing.id, body);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === result.message.id ? { ...result.message, replyTo: m.replyTo } : m)),
    );
    setEditing(null);
    return true;
  }

  const mentionPeople = useMemo(
    () => detail.members.filter((m) => m.userId !== meId).map((m) => m.person),
    [detail.members, meId],
  );

  const senderName = (id: string | null) =>
    id === meId ? "You" : ((id ? peopleById.get(id)?.name : null) ?? "Former user");

  // ---- Search within this chat ------------------------------------------
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [loadingAll, setLoadingAll] = useState(false);
  const needle = searchOpen ? searchQuery.trim().toLowerCase() : "";
  const matchIds = useMemo(() => {
    if (!needle) return [];
    return messages
      .filter(
        (m) =>
          m.kind === "message" &&
          !m.deletedAt &&
          (decodeMentions(m.body).toLowerCase().includes(needle) ||
            (m.attachment?.name.toLowerCase().includes(needle) ?? false)),
      )
      .map((m) => m.id);
  }, [messages, needle]);
  // Newest match first, like WhatsApp; the index counts back from the bottom.
  const currentMatchId = matchIds.length
    ? matchIds[matchIds.length - 1 - (matchIndex % matchIds.length)]
    : null;

  async function openSearch() {
    setSearchOpen(true);
    if (!hasMore) return;
    // Load the full history once so search covers the whole chat.
    setLoadingAll(true);
    let oldest = messages.find((m) => !m.pending)?.createdAt ?? null;
    let more: boolean = hasMore;
    let guard = 0;
    while (more && oldest && guard < 40) {
      guard += 1;
      const result = await fetchChatMessages(detail.id, oldest);
      if (!result.ok) break;
      const page = result.messages;
      setMessages((prev) => [...page.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      more = result.hasMore;
      oldest = page[0]?.createdAt ?? null;
    }
    setHasMore(more);
    setLoadingAll(false);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setMatchIndex(0);
  }

  useEffect(() => {
    if (!currentMatchId) return;
    stickToBottom.current = false;
    document
      .getElementById(`msg-${currentMatchId}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentMatchId]);

  return (
    // @container: the info panel goes full width when the chat itself is narrow
    // (phones, the simulator, split panes), not based on the window size.
    <div className="@container relative flex min-h-0 flex-1" {...dropProps}>
      <DropOverlay show={dragging} />
      <MessageMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onAction={onMenuAction}
        peopleById={peopleById}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-black/5 px-4 py-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-full p-1.5 text-black/55 hover:bg-black/5"
              aria-label="Back to chats"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <ScopedLink
              href={backHref}
              className="rounded-full p-1.5 text-black/55 hover:bg-black/5 md:hidden"
              aria-label="Back to chats"
            >
              <ArrowLeft className="h-5 w-5" />
            </ScopedLink>
          )}
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <ChatAvatar chat={detail} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-[#2B2F16]">
                {detail.title}
              </span>
              <span className="block truncate text-xs text-black/50">
                {detail.kind === "group" ? (
                  `${detail.memberCount} member${detail.memberCount === 1 ? "" : "s"}`
                ) : (
                  <>
                    <PresenceLabel status={otherStatus} />
                    {(() => {
                      const other = detail.members.find((m) => m.userId !== meId)?.person;
                      const role = [
                        other?.positionName ?? detail.contact?.positionName,
                        other?.departmentName ?? detail.contact?.departmentName,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return role ? ` · ${role}` : "";
                    })()}
                  </>
                )}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => (searchOpen ? closeSearch() : void openSearch())}
            className={cn("rounded-full p-2 hover:bg-black/5", searchOpen ? "text-[var(--venue-primary,#818a40)]" : "text-black/50")}
            aria-label="Search in chat"
            aria-pressed={searchOpen}
            title="Search in chat"
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            className={cn("rounded-full p-2 hover:bg-black/5", infoOpen ? "text-[var(--venue-primary,#818a40)]" : "text-black/50")}
            aria-label="Chat info"
            aria-pressed={infoOpen}
          >
            <Info className="h-5 w-5" />
          </button>
          {panes ? (
            <button
              type="button"
              onClick={() => panes.closePane(detail.id)}
              className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-black/75"
              aria-label="Close chat window"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          ) : null}
        </header>

        {searchOpen ? (
          <div className="flex items-center gap-2 border-b border-black/5 bg-white px-3 py-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-[#F0F2E8] px-3 py-1.5">
              <Search className="h-4 w-4 shrink-0 text-black/40" aria-hidden />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setMatchIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                  if (e.key === "Enter" && matchIds.length) {
                    e.preventDefault();
                    setMatchIndex((i) =>
                      e.shiftKey ? (i - 1 + matchIds.length) % matchIds.length : (i + 1) % matchIds.length,
                    );
                  }
                }}
                placeholder="Search in this chat"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/40"
              />
            </label>
            <span className="w-20 shrink-0 text-center text-xs tabular-nums text-black/50">
              {loadingAll
                ? "Loading…"
                : needle
                  ? matchIds.length
                    ? `${(matchIndex % matchIds.length) + 1} of ${matchIds.length}`
                    : "No results"
                  : ""}
            </span>
            <button
              type="button"
              disabled={matchIds.length === 0}
              onClick={() => setMatchIndex((i) => (i + 1) % matchIds.length)}
              className="rounded-full p-1.5 text-black/55 hover:bg-black/5 disabled:opacity-30"
              aria-label="Older match"
              title="Older match (Enter)"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={matchIds.length === 0}
              onClick={() => setMatchIndex((i) => (i - 1 + matchIds.length) % matchIds.length)}
              className="rounded-full p-1.5 text-black/55 hover:bg-black/5 disabled:opacity-30"
              aria-label="Newer match"
              title="Newer match (Shift+Enter)"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closeSearch}
              className="rounded-full p-1.5 text-black/55 hover:bg-black/5"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
        <ChatBackdrop />
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="absolute inset-0 overflow-y-auto px-3 py-4 sm:px-5"
        >
          {hasMore ? (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingOlder}
                className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black/60 shadow-sm hover:bg-black/[0.03] disabled:opacity-60"
              >
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          ) : (
            <ChatIntro detail={detail} />
          )}
          <MessageList
            messages={messages}
            meId={meId}
            isGroup={detail.kind === "group"}
            canModerate={detail.myRole === "admin" && detail.kind === "group"}
            peopleById={peopleById}
            highlight={needle}
            currentMatchId={currentMatchId}
            receipts={receipts}
            onOpenMenu={openMenu}
            onSwipeReply={detail.canPost && !readOnly ? startReply : undefined}
            senderName={senderName}
            onDeleted={(id) =>
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === id ? { ...m, body: "", attachment: null, deletedAt: new Date().toISOString() } : m,
                ),
              )
            }
          />
        </div>
        </div>

        {readOnly ? (
          <p className="border-t border-black/5 bg-amber-50 px-4 py-3 text-center text-xs text-amber-900">
            Preview of {me?.name ?? "this employee"}&apos;s chat — read only.
          </p>
        ) : detail.canPost ? (
          <Composer
            key={editing ? `edit-${editing.id}` : "compose"}
            conversationId={detail.id}
            meId={meId}
            file={file}
            setFile={setFile}
            onPending={addPending}
            onSent={onSent}
            replyTo={replyTo}
            replyTitle={replyTo ? `Replying to ${senderName(replyTo.senderId)}` : ""}
            onCancelReply={() => setReplyTo(null)}
            editing={editing}
            onSaveEdit={saveEdit}
            onCancelEdit={() => setEditing(null)}
            mentionPeople={mentionPeople}
          />
        ) : (
          <p className="flex items-center justify-center gap-2 border-t border-black/5 px-4 py-4 text-sm text-black/55">
            <Megaphone className="h-4 w-4" aria-hidden />
            Only chat admins can send messages here.
          </p>
        )}
      </div>

      {infoOpen ? (
        <ChatInfoPanel
          detail={detail}
          meId={meId}
          venuePeople={venuePeople}
          latestMessageId={messages.findLast((m) => !m.pending)?.id ?? ""}
          onClose={() => setInfoOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ChatIntro({ detail }: { detail: ChatDetail }) {
  return (
    <div className="mb-6 flex flex-col items-center gap-2 pt-4 text-center">
      <ChatAvatar chat={detail} />
      <p className="font-semibold text-[#2B2F16]">{detail.title}</p>
      <p className="max-w-xs text-xs text-black/50">
        {detail.kind === "group"
          ? detail.description || "This is the start of the group chat."
          : "This is the start of your conversation."}
      </p>
    </div>
  );
}

function MessageList({
  messages,
  meId,
  isGroup,
  canModerate,
  peopleById,
  highlight,
  currentMatchId,
  receipts,
  onOpenMenu,
  onSwipeReply,
  senderName,
  onDeleted,
}: {
  receipts: ChatReceipts | null;
  onOpenMenu: (m: UiMessage, x: number, y: number) => void;
  onSwipeReply?: (m: UiMessage) => void;
  senderName: (id: string | null) => string;
  messages: UiMessage[];
  meId: string;
  isGroup: boolean;
  canModerate: boolean;
  peopleById: Map<string, ConnectPerson>;
  /** Lower-cased search text to mark in bubbles. */
  highlight: string;
  currentMatchId: string | null;
  onDeleted: (id: string) => void;
}) {
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-0.5">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || dubaiDayKey(prev.createdAt) !== dubaiDayKey(m.createdAt);
        const separator = newDay ? (
          <div className="my-4 flex justify-center">
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black/50 shadow-sm">
              {dayLabel(m.createdAt)}
            </span>
          </div>
        ) : null;

        if (m.kind === "system") {
          return (
            <Fragment key={m.id}>
              {separator}
              <p className="my-2 text-center text-xs text-black/45">{m.body}</p>
            </Fragment>
          );
        }

        const mine = m.senderId === meId;
        const sameAsPrev =
          !newDay &&
          prev?.kind === "message" &&
          prev.senderId === m.senderId &&
          new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_GAP_MS;
        const sameAsNext =
          next?.kind === "message" &&
          next.senderId === m.senderId &&
          dubaiDayKey(next.createdAt) === dubaiDayKey(m.createdAt) &&
          new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() < GROUP_GAP_MS;
        const sender = m.senderId ? peopleById.get(m.senderId) : null;
        const deleted = Boolean(m.deletedAt);
        const canDelete = !deleted && !m.pending && (mine || canModerate);
        const ticks =
          mine && !deleted && !m.pending ? (
            <MessageTicks status={receiptStatus(m.createdAt, receipts)} />
          ) : null;

        return (
          <Fragment key={m.id}>
            {separator}
            <div
              id={`msg-${m.id}`}
              className={cn("group flex scroll-mt-24 items-end gap-2", mine ? "justify-end" : "justify-start", !sameAsPrev && "mt-2")}
            >
              {!mine && isGroup ? (
                <span className="w-8 shrink-0">
                  {!sameAsNext ? (
                    <ConnectAvatar name={sender?.name ?? "Former user"} photoUrl={sender?.photoUrl} size="xs" className="h-8 w-8" />
                  ) : null}
                </span>
              ) : null}
              {mine && canDelete ? (
                <DeleteButton
                  onConfirm={() =>
                    startTransition(async () => {
                      const result = await deleteChatMessage(m.id);
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      onDeleted(m.id);
                    })
                  }
                />
              ) : null}
              <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
                {!mine && isGroup && !sameAsPrev ? (
                  <span className="mb-0.5 px-3 text-[11px] font-semibold text-black/55">
                    {sender?.name ?? "Former user"}
                  </span>
                ) : null}
                <GestureBubble
                  onMenu={(x, y) => onOpenMenu(m, x, y)}
                  onSwipeReply={
                    !mine && !deleted && !m.pending && onSwipeReply ? () => onSwipeReply(m) : undefined
                  }
                  className="max-w-full"
                >
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-[15px] leading-snug shadow-sm",
                    mine
                      ? "bg-[var(--venue-primary,#818a40)] text-white"
                      : "bg-white text-[#2B2F16]",
                    mine ? (sameAsNext ? "rounded-br-md" : "") : sameAsNext ? "rounded-bl-md" : "",
                    m.pending && "opacity-70",
                    deleted && "bg-transparent italic text-black/45 shadow-none ring-1 ring-black/10",
                    m.id === currentMatchId && "ring-2 ring-amber-400 ring-offset-2 ring-offset-transparent",
                  )}
                  title={timeLabel(m.createdAt)}
                >
                  {deleted ? (
                    "Message deleted"
                  ) : (
                    <>
                      {m.replyToId ? (
                        (() => {
                          const original = messages.find((x) => x.id === m.replyToId);
                          const preview = m.replyTo ?? (original ? replyPreviewOf(original) : null);
                          return (
                            <ReplyQuote
                              preview={preview}
                              senderName={preview ? senderName(preview.senderId) : ""}
                              mine={mine}
                              onJump={
                                original
                                  ? () =>
                                      document
                                        .getElementById(`msg-${original.id}`)
                                        ?.scrollIntoView({ block: "center", behavior: "smooth" })
                                  : undefined
                              }
                            />
                          );
                        })()
                      ) : null}
                      {m.attachment ? <MessageAttachment attachment={m.attachment} mine={mine} /> : null}
                      {m.body ? (
                        <p className="whitespace-pre-wrap break-words">
                          <MentionText
                            text={m.body}
                            onDark={mine}
                            renderText={(run) => <Highlighted text={run} needle={highlight} />}
                          />
                          {m.editedAt ? (
                            <span className={cn("ml-1.5 text-[10px]", mine ? "text-white/70" : "text-black/40")}>
                              edited
                            </span>
                          ) : null}
                          {ticks ? <span className="ml-1.5 inline-flex align-[-2px]">{ticks}</span> : null}
                        </p>
                      ) : ticks ? (
                        <span className="-mb-0.5 mt-0.5 flex justify-end">{ticks}</span>
                      ) : null}
                    </>
                  )}
                </div>
                </GestureBubble>
                {!sameAsNext ? (
                  <span className="mt-0.5 px-1 text-[10px] text-black/40" suppressHydrationWarning>
                    {m.pending ? "Sending…" : timeLabel(m.createdAt)}
                  </span>
                ) : null}
              </div>
              {!mine && canDelete ? (
                <DeleteButton
                  onConfirm={() =>
                    startTransition(async () => {
                      const result = await deleteChatMessage(m.id);
                      if (!result.ok) {
                        toast.error(result.error);
                        return;
                      }
                      onDeleted(m.id);
                    })
                  }
                />
              ) : null}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onMouseLeave={() => setArmed(false)}
      className={cn(
        "mb-5 shrink-0 rounded-full p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100",
        armed ? "bg-red-50 text-red-700" : "text-black/35 hover:bg-black/5",
      )}
      aria-label={armed ? "Click again to delete" : "Delete message"}
      title={armed ? "Click again to delete" : "Delete message"}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function MessageAttachment({
  attachment,
  mine,
}: {
  attachment: NonNullable<ChatMessage["attachment"]>;
  mine: boolean;
}) {
  if (isImageAttachment(attachment.type)) {
    return (
      <AttachmentTrigger file={attachment} className="-mx-1 -mt-0.5 mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.url} alt={attachment.name} className="max-h-72 rounded-xl object-cover" loading="lazy" />
      </AttachmentTrigger>
    );
  }
  return (
    <AttachmentTrigger
      file={attachment}
      className={cn(
        "mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2",
        mine ? "bg-white/15 hover:bg-white/25" : "bg-black/[0.04] hover:bg-black/[0.07]",
      )}
    >
      <FileText className="h-5 w-5 shrink-0" aria-hidden />
      <span className="min-w-0">
        <span className="block max-w-[14rem] truncate text-sm font-medium">{attachment.name}</span>
        <span className={cn("text-[11px]", mine ? "text-white/75" : "text-black/50")}>
          {formatFileSize(attachment.size)}
        </span>
      </span>
      <Download className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
    </AttachmentTrigger>
  );
}

/** Marks every case-insensitive occurrence of `needle` in `text`. */
function Highlighted({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(needle);
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded bg-amber-300/80 px-0.5 text-inherit">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

let tempCounter = 0;

function Composer({
  conversationId,
  meId,
  file,
  setFile,
  onPending,
  onSent,
  replyTo,
  replyTitle,
  onCancelReply,
  editing,
  onSaveEdit,
  onCancelEdit,
  mentionPeople,
}: {
  /** Chat members who can be @mentioned. */
  mentionPeople: ConnectPerson[];
  conversationId: string;
  meId: string;
  file: File | null;
  setFile: (file: File | null) => void;
  onPending: (m: UiMessage) => void;
  onSent: (tempId: string, message: ChatMessage | null) => void;
  replyTo: ReplyPreview | null;
  replyTitle: string;
  onCancelReply: () => void;
  /** When set, the composer edits this message instead of sending a new one. */
  editing: UiMessage | null;
  onSaveEdit: (body: string) => Promise<boolean>;
  onCancelEdit: () => void;
}) {
  // Remounted (keyed) when editing starts, so the text starts as the message.
  const [text, setText] = useState(editing ? decodeMentions(editing.body) : "");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Desktop: ready to type on open. Phone app: don't pop the keyboard up
  // until the user taps the field (or starts a reply).
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    if (replyTo || !el.closest(".mobile-app-canvas")) el.focus();
  }, [conversationId, replyTo]);

  function send() {
    const body = encodeTypedMentions(text.trim(), mentionPeople);
    if (editing) {
      if (!body || saving) return;
      setSaving(true);
      void onSaveEdit(body).then(() => setSaving(false));
      return;
    }
    if (!body && !file) return;
    const tempId = `pending-${++tempCounter}`;
    onPending({
      id: tempId,
      conversationId,
      senderId: meId,
      body,
      kind: "message",
      attachment: file
        ? { url: file.type.startsWith("image/") ? URL.createObjectURL(file) : "#", name: file.name, type: file.type, size: file.size }
        : null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      replyToId: replyTo?.id ?? null,
      replyTo,
      pending: true,
    });
    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("body", body);
    if (file) formData.set("file", file);
    if (replyTo) formData.set("replyToId", replyTo.id);
    setText("");
    setFile(null);
    onCancelReply();
    void sendChatMessage(formData).then((result) => {
      if (!result.ok) {
        toast.error(result.error);
        onSent(tempId, null);
        return;
      }
      onSent(tempId, result.message);
    });
  }

  const hasContent = Boolean(text.trim()) || Boolean(file);

  function pickFile(picked: File | null) {
    if (picked && picked.size > CONNECT_MAX_FILE_BYTES) {
      toast.alert("Files must be 25 MB or smaller.");
      return;
    }
    setFile(picked);
    textRef.current?.focus();
  }

  // iOS-style bar: round buttons and a pill that grows only with its text.
  const roundButton =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#2B2F16] shadow-sm ring-1 ring-black/[0.06] transition active:scale-95 hover:bg-black/[0.03]";

  return (
    <div className="border-t border-black/[0.06] bg-[#F7F7F5]/90 px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl">
      {editing ? (
        <ComposerBanner
          mode="edit"
          title="Editing message"
          preview={replyPreviewOf(editing)}
          onCancel={onCancelEdit}
        />
      ) : replyTo ? (
        <ComposerBanner mode="reply" title={replyTitle} preview={replyTo} onCancel={onCancelReply} />
      ) : null}
      {file && !editing ? <AttachmentChip file={file} onRemove={() => setFile(null)} /> : null}
      <div className="flex items-end gap-1.5">
        {!editing ? (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className={roundButton}
            aria-label="Attach a photo or file"
            title="Attach a photo or file"
          >
            <Plus className="h-5 w-5" strokeWidth={2} />
          </button>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            e.target.value = "";
            pickFile(picked);
          }}
        />
        {/* On phones this opens the camera straight away; on computers, a file picker. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            e.target.value = "";
            pickFile(picked);
          }}
        />
        <div className="flex min-h-9 min-w-0 flex-1 items-center rounded-[20px] bg-white px-3.5 ring-1 ring-black/[0.08] focus-within:ring-[var(--venue-primary,#818a40)]/40">
          <MentionTextarea
            ref={textRef}
            value={text}
            onValueChange={setText}
            people={mentionPeople}
            wrapperClassName="w-full"
            onKeyDown={(e) => {
              // Desktop: Enter sends (Shift+Enter = new line). Phones: Return is
              // a new line, like WhatsApp — send with the button.
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                !isPhoneComposer(e.currentTarget)
              ) {
                e.preventDefault();
                send();
              }
              if (e.key === "Escape") {
                if (editing) onCancelEdit();
                else if (replyTo) onCancelReply();
              }
            }}
            enterKeyHint="enter"
            rows={1}
            maxLength={CHAT_MAX_MESSAGE_CHARS}
            placeholder={editing ? "Edit message" : "Message"}
            className="block max-h-32 resize-none bg-transparent py-[7px] text-[16px] leading-[22px] text-[#2B2F16] outline-none placeholder:text-black/35 [field-sizing:content]"
          />
        </div>
        {hasContent || editing ? (
          <button
            type="button"
            onClick={send}
            disabled={!hasContent}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white shadow-sm transition active:scale-95 disabled:opacity-40"
            aria-label={editing ? "Save" : "Send"}
          >
            {editing ? <Check className="h-5 w-5" strokeWidth={2.5} /> : <SendHorizontal className="h-[18px] w-[18px]" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            className={roundButton}
            aria-label="Take a photo"
            title="Take a photo"
          >
            <Camera className="h-5 w-5" strokeWidth={1.9} />
          </button>
        )}
      </div>
    </div>
  );
}

/** The file waiting to be sent: a thumbnail for photos, otherwise its name. */
function AttachmentChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  const url = useMemo(() => (isImage ? URL.createObjectURL(file) : null), [file, isImage]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return (
    <div className="mb-1.5 flex items-center gap-2.5 rounded-2xl bg-white px-2 py-1.5 text-sm shadow-sm ring-1 ring-black/[0.06]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- local preview
        <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F0F2E8]">
          <Paperclip className="h-4 w-4 text-black/50" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[#2B2F16]">{file.name}</span>
        <span className="text-xs text-black/45">{formatFileSize(file.size)}</span>
      </span>
      <button type="button" onClick={onRemove} className="rounded-full p-1 hover:bg-black/10" aria-label="Remove attachment">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** The phone app (or simulator) and touch devices: Return inserts a new line. */
function isPhoneComposer(el: HTMLElement): boolean {
  if (el.closest(".mobile-app-canvas")) return true;
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
