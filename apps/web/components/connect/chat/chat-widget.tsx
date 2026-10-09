"use client";

import {
  Archive,
  ArrowLeft,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Paperclip,
  Plus,
  Search,
  Send,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChatContextMenu, type ChatMenuState } from "@/components/connect/chat/chat-context-menu";
import { DropOverlay, useFileDrop } from "@/components/connect/chat/use-file-drop";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { toast } from "@/components/ui/toast";
import { ScopedLink } from "@/components/layout/scoped-link";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import {
  fetchChatMessages,
  markChatRead,
  sendChatMessage,
  setChatArchived,
  startDirectChat,
} from "@/lib/actions/connect-chat";
import { getChatWidgetData, type ChatWidgetData } from "@/lib/actions/connect-chat-widget";
import { formatFileSize, formatPostTime } from "@/lib/connect/format";
import { CONNECT_MAX_FILE_BYTES } from "@/lib/connect/types";
import {
  CHAT_MAX_MESSAGE_CHARS,
  chatPreviewText,
  mapChatMessageRow,
  type ChatMessage,
  type ChatMessageRow,
  type ChatSummary,
} from "@/lib/connect/chat-types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MUTE_KEY = "ssops.chat.muted";

// ---------------------------------------------------------------------------
// New-message sound: a short two-note chime made with Web Audio, so there is
// no file to load. Browsers only allow audio after the user has interacted
// with the page, so the context is created on the first click or key press.
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;

function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function playChime() {
  const ctx = audioCtx;
  if (!ctx || ctx.state !== "running") return;
  const start = ctx.currentTime;
  [880, 1318.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = start + i * 0.12;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  });
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMuted(value: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // storage unavailable
  }
}

function Badge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E5484D] px-1.5 text-[11px] font-semibold leading-none text-white ring-2 ring-white",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function RailAvatar({ chat, size = 44 }: { chat: Pick<ChatSummary, "kind" | "title" | "photoUrl" | "color">; size?: number }) {
  if (chat.kind === "group") {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full text-white ring-2 ring-white"
        style={{ backgroundColor: chat.color, width: size, height: size }}
        aria-hidden
      >
        <Users className="h-5 w-5" />
      </span>
    );
  }
  return (
    <ConnectAvatar
      name={chat.title}
      photoUrl={chat.photoUrl}
      size="md"
      className={size === 44 ? undefined : "h-9 w-9 text-xs"}
    />
  );
}

/**
 * Floating chat available on every page: a launcher in the bottom-right
 * corner with the unread count, opening a compact messenger.
 */
export function ChatWidget() {
  const pathname = useRelativePathname();
  const onChatsPage = pathname === "/connect/chats" || pathname.startsWith("/connect/chats/");
  const chatsPageConversation = pathname.startsWith("/connect/chats/")
    ? (pathname.split("/")[3] ?? null)
    : null;

  const [data, setData] = useState<ChatWidgetData | null>(null);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<ChatMenuState>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { dragging, dropProps } = useFileDrop(setFile, Boolean(activeId) && !composing);
  // Renders nothing until data loads client-side, so reading storage here is hydration-safe.
  const [muted, setMuted] = useState(() => typeof window !== "undefined" && readMuted());

  // Latest values for the realtime callback, which subscribes once.
  const live = useRef({ open, activeId, muted, meId: "", chatsPageConversation, known: new Set<string>() });
  useEffect(() => {
    live.current = {
      open,
      activeId,
      muted,
      meId: data?.meId ?? "",
      chatsPageConversation,
      known: new Set((data?.chats ?? []).map((c) => c.id)),
    };
  }, [open, activeId, muted, data, chatsPageConversation]);

  const load = useCallback(
    () =>
      getChatWidgetData().then((result) => {
        if (result.ok) setData(result.data);
      }),
    [],
  );

  useEffect(() => {
    void load();
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [load]);

  // Counts change while reading on the Chats page; refresh when leaving it.
  const wasOnChats = useRef(onChatsPage);
  useEffect(() => {
    if (wasOnChats.current && !onChatsPage) void load();
    wasOnChats.current = onChatsPage;
  }, [onChatsPage, load]);

  // Live updates for every chat the viewer is in.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("chat-widget")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          const state = live.current;
          if (!state.meId) return;
          const fromOther = row.kind === "message" && row.sender_id !== state.meId;
          const visible = document.visibilityState === "visible";
          const readingHere =
            visible &&
            ((state.open && state.activeId === row.conversation_id) ||
              state.chatsPageConversation === row.conversation_id);

          if (fromOther && !readingHere && !state.muted) playChime();

          if (state.open && state.activeId === row.conversation_id) {
            setMessages((prev) =>
              prev.some((m) => m.id === row.id) ? prev : [...prev, mapChatMessageRow(row)],
            );
            if (fromOther && visible) void markChatRead(row.conversation_id);
          }

          if (!state.known.has(row.conversation_id)) {
            void load();
            return;
          }
          setData((prev) => {
            if (!prev) return prev;
            const idx = prev.chats.findIndex((c) => c.id === row.conversation_id);
            if (idx === -1) return prev;
            const current = prev.chats[idx]!;
            const sender = prev.people.find((p) => p.userId === row.sender_id);
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
              unreadCount: fromOther && !readingHere ? current.unreadCount + 1 : current.unreadCount,
            };
            return { ...prev, chats: [updated, ...prev.chats.filter((_, i) => i !== idx)] };
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  // Escape closes the popup.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openChat = useCallback(async (conversationId: string) => {
    setActiveId(conversationId);
    setComposing(false);
    setFile(null);
    setMessages([]);
    setError(null);
    setLoadingMessages(true);
    const result = await fetchChatMessages(conversationId, "");
    setLoadingMessages(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessages(result.messages);
    void markChatRead(conversationId);
    setData((prev) =>
      prev
        ? {
            ...prev,
            chats: prev.chats.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
          }
        : prev,
    );
  }, []);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      void load();
      // Jump straight to the chat with unread messages, or the latest one.
      const current = data?.chats.filter((c) => !c.archived) ?? [];
      const target =
        activeId ?? current.find((c) => c.unreadCount > 0)?.id ?? current[0]?.id ?? null;
      if (target) void openChat(target);
      else setComposing(true);
    }
  }

  async function messagePerson(userId: string) {
    setStartingId(userId);
    const result = await startDirectChat(userId);
    setStartingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPickerQuery("");
    await load();
    await openChat(result.id);
  }

  function startNewChat() {
    setComposing(true);
    setActiveId(null);
    setPickerQuery("");
    setError(null);
    setShowArchived(false);
  }

  async function archive(conversationId: string, archived: boolean) {
    setData((prev) =>
      prev
        ? { ...prev, chats: prev.chats.map((c) => (c.id === conversationId ? { ...c, archived } : c)) }
        : prev,
    );
    const result = await setChatArchived(conversationId, archived);
    if (!result.ok) {
      toast.error(result.error);
      void load();
      return;
    }
    toast.saved(archived ? "Chat archived." : "Chat moved back to your chats.");
  }

  async function send() {
    const body = draft.trim();
    if ((!body && !file) || !activeId || sending) return;
    setSending(true);
    setError(null);
    const form = new FormData();
    form.set("conversationId", activeId);
    form.set("body", body);
    if (file) form.set("file", file);
    const result = await sendChatMessage(form);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft("");
    setFile(null);
    setMessages((prev) =>
      prev.some((m) => m.id === result.message.id) ? prev : [...prev, result.message],
    );
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  const listEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, activeId]);

  const totalUnread = useMemo(
    () => (data?.chats ?? []).reduce((sum, c) => sum + c.unreadCount, 0),
    [data],
  );
  const railChats = (data?.chats ?? []).filter((c) => c.archived === showArchived);
  const archivedCount = (data?.chats ?? []).filter((c) => c.archived).length;
  const pq = pickerQuery.trim().toLowerCase();
  const pickerPeople = (data?.people ?? []).filter(
    (p) =>
      !pq ||
      [p.name, p.positionName, p.departmentName]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(pq)),
  );
  const active = data?.chats.find((c) => c.id === activeId) ?? null;
  const nameOf = (userId: string | null) =>
    data?.people.find((p) => p.userId === userId)?.name ?? null;

  if (!data) return null;

  return (
    <>
      {open ? (
        <div
          role="dialog"
          aria-label="Chats"
          className="fixed inset-x-2 bottom-20 z-[150] flex h-[min(580px,calc(100dvh-7rem))] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[min(560px,calc(100vw-2.5rem))]"
        >
          <nav
            aria-label="Conversations"
            className="flex w-[68px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-black/5 bg-[#F7F8F2] py-3"
          >
            <button
              type="button"
              onClick={startNewChat}
              title="New chat"
              aria-label="New chat"
              className={cn(
                "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white shadow-sm transition hover:opacity-90",
                composing && "ring-2 ring-[var(--venue-primary,#818a40)] ring-offset-2 ring-offset-[#F7F8F2]",
              )}
            >
              <Plus className="h-5 w-5" />
            </button>
            <span className="my-0.5 h-px w-8 bg-black/10" aria-hidden />
            {showArchived ? (
              <span className="text-[9px] font-semibold uppercase tracking-wide text-black/45">
                Archived
              </span>
            ) : null}
            {railChats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                onClick={() => void openChat(chat.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, conversationId: chat.id, archived: chat.archived });
                }}
                title={`${chat.title}${chat.lastMessage ? ` — ${chatPreviewText(chat, data.meId)}` : ""}`}
                aria-label={`${chat.title}${chat.unreadCount ? `, ${chat.unreadCount} unread` : ""}`}
                className={cn(
                  "relative shrink-0 rounded-full p-0.5 transition",
                  chat.id === activeId
                    ? "ring-2 ring-[var(--venue-primary,#818a40)]"
                    : "opacity-90 hover:opacity-100",
                )}
              >
                <RailAvatar chat={chat} />
                <Badge count={chat.unreadCount} className="absolute -right-1 -top-1" />
              </button>
            ))}
            {railChats.length === 0 ? (
              <span className="px-1 text-center text-[10px] leading-tight text-black/40">
                {showArchived ? "None" : "No chats"}
              </span>
            ) : null}
            {archivedCount > 0 || showArchived ? (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                title={showArchived ? "Back to chats" : `Archived chats (${archivedCount})`}
                aria-label={showArchived ? "Back to chats" : `Archived chats (${archivedCount})`}
                aria-pressed={showArchived}
                className={cn(
                  "relative mt-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
                  showArchived
                    ? "bg-[var(--venue-primary,#818a40)] text-white"
                    : "text-black/45 hover:bg-black/5 hover:text-[#2B2F16]",
                )}
              >
                {showArchived ? <ArrowLeft className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {!showArchived ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/55 px-1 text-[10px] font-semibold text-white">
                    {archivedCount}
                  </span>
                ) : null}
              </button>
            ) : null}
          </nav>

          <section className="relative flex min-w-0 flex-1 flex-col" {...dropProps}>
            <DropOverlay show={dragging} />
            <header className="flex items-center gap-3 border-b border-black/5 px-4 py-2.5">
              {composing ? (
                <p className="flex-1 font-serif text-lg text-[#2B2F16]">New chat</p>
              ) : active ? (
                <>
                  <RailAvatar chat={active} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#2B2F16]">{active.title}</p>
                    <p className="truncate text-xs text-black/45">
                      {active.kind === "group" ? `${active.memberCount} members` : "Direct message"}
                    </p>
                  </div>
                </>
              ) : (
                <p className="flex-1 font-serif text-lg text-[#2B2F16]">Chats</p>
              )}
              <button
                type="button"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  writeMuted(next);
                  if (!next) {
                    unlockAudio();
                    playChime();
                  }
                }}
                title={muted ? "Turn message sound on" : "Mute message sound"}
                aria-label={muted ? "Turn message sound on" : "Mute message sound"}
                className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-[#2B2F16]"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <ScopedLink
                href={activeId && !composing ? `/connect/chats/${activeId}` : "/connect/chats"}
                onClick={() => setOpen(false)}
                title="Open in Chats"
                aria-label="Open in Chats"
                className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-[#2B2F16]"
              >
                <ExternalLink className="h-4 w-4" />
              </ScopedLink>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chats"
                className="rounded-full p-2 text-black/50 hover:bg-black/5 hover:text-[#2B2F16]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {composing ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-black/5 p-3">
                  <label className="flex items-center gap-2 rounded-full bg-[#F0F2E8] px-3 py-2">
                    <span className="text-xs font-semibold text-black/50">To:</span>
                    <Search className="h-4 w-4 text-black/40" aria-hidden />
                    <input
                      autoFocus
                      value={pickerQuery}
                      onChange={(e) => setPickerQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && pickerPeople[0]) {
                          e.preventDefault();
                          void messagePerson(pickerPeople[0].userId);
                        }
                      }}
                      placeholder="Search a name or position"
                      role="combobox"
                      aria-expanded
                      aria-controls="chat-widget-people"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-black/40"
                    />
                  </label>
                  {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
                </div>
                <ul id="chat-widget-people" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
                  {pickerPeople.length === 0 ? (
                    <li className="py-8 text-center text-sm text-black/45">Nobody found.</li>
                  ) : (
                    pickerPeople.map((p) => (
                      <li key={p.userId} role="option" aria-selected={false}>
                        <button
                          type="button"
                          onClick={() => void messagePerson(p.userId)}
                          disabled={startingId !== null}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-black/[0.04] disabled:opacity-60"
                        >
                          <ConnectAvatar name={p.name} photoUrl={p.photoUrl} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-[#2B2F16]">{p.name}</span>
                            <span className="block truncate text-xs text-black/50">
                              {[p.positionName, p.departmentName].filter(Boolean).join(" · ") || "—"}
                            </span>
                          </span>
                          {startingId === p.userId ? (
                            <Loader2 className="h-4 w-4 animate-spin text-black/40" />
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7F8F2] px-4 py-3">
                  {!active ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-black/50">
                      <MessagesSquare className="h-8 w-8 text-[var(--venue-primary,#818a40)]" />
                      Pick a chat on the left, or start a new one with +.
                    </div>
                  ) : loadingMessages ? (
                    <p className="flex items-center justify-center gap-2 py-10 text-sm text-black/45">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading messages…
                    </p>
                  ) : messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-black/45">No messages yet. Say hello 👋</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {messages.map((m, i) => {
                        if (m.kind === "system") {
                          return (
                            <li key={m.id} className="py-1 text-center text-[11px] text-black/45">
                              {m.body}
                            </li>
                          );
                        }
                        const mine = m.senderId === data.meId;
                        const prev = messages[i - 1];
                        const showName =
                          active.kind === "group" && !mine && prev?.senderId !== m.senderId;
                        return (
                          <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                            <div className="max-w-[80%]">
                              {showName ? (
                                <p className="mb-0.5 px-1 text-[11px] font-medium text-black/50">
                                  {nameOf(m.senderId) ?? "Someone"}
                                </p>
                              ) : null}
                              <div
                                className={cn(
                                  "whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                                  mine
                                    ? "rounded-br-md bg-[var(--venue-primary,#818a40)] text-white"
                                    : "rounded-bl-md bg-white text-[#2B2F16] shadow-sm",
                                )}
                              >
                                {m.deletedAt ? (
                                  <span className="italic opacity-70">Message deleted</span>
                                ) : (
                                  <>
                                    {m.attachment ? (
                                      m.attachment.type.startsWith("image/") ? (
                                        <a href={m.attachment.url} target="_blank" rel="noreferrer">
                                          {/* eslint-disable-next-line @next/next/no-img-element -- chat attachment */}
                                          <img
                                            src={m.attachment.url}
                                            alt={m.attachment.name}
                                            className="mb-1 max-h-48 rounded-lg object-cover"
                                          />
                                        </a>
                                      ) : (
                                        <a
                                          href={m.attachment.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="mb-1 flex items-center gap-1.5 underline"
                                        >
                                          <FileText className="h-4 w-4 shrink-0" />
                                          <span className="truncate">{m.attachment.name}</span>
                                        </a>
                                      )
                                    ) : null}
                                    {m.body}
                                  </>
                                )}
                              </div>
                              <p
                                className={cn("mt-0.5 px-1 text-[10px] text-black/40", mine && "text-right")}
                                suppressHydrationWarning
                              >
                                {formatPostTime(m.createdAt)}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div ref={listEndRef} />
                </div>

                {active ? (
                  <footer className="border-t border-black/5 bg-white p-3">
                    {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
                    {file ? (
                      <div className="mb-2 flex items-center gap-2 rounded-xl bg-[#F0F2E8] px-3 py-1.5 text-xs">
                        <Paperclip className="h-3.5 w-3.5 text-black/50" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[#2B2F16]">{file.name}</span>
                        <span className="text-black/45">{formatFileSize(file.size)}</span>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          className="rounded-full p-0.5 hover:bg-black/10"
                          aria-label="Remove attachment"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                    <div className="flex items-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-full text-black/50 hover:bg-black/5"
                        aria-label="Attach a photo or file"
                        title="Attach (or drop a file here)"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <input
                        ref={fileInput}
                        type="file"
                        hidden
                        onChange={(e) => {
                          const picked = e.target.files?.[0] ?? null;
                          e.target.value = "";
                          if (picked && picked.size > CONNECT_MAX_FILE_BYTES) {
                            toast.alert("Files must be 25 MB or smaller.");
                            return;
                          }
                          setFile(picked);
                        }}
                      />
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onComposerKey}
                        rows={1}
                        maxLength={CHAT_MAX_MESSAGE_CHARS}
                        placeholder={`Message ${active.title}`}
                        className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl bg-[#F0F2E8] px-3.5 py-2.5 text-sm text-[#2B2F16] outline-none placeholder:text-black/40 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/25"
                        style={{ height: `${Math.min(128, 40 + Math.max(0, draft.split("\n").length - 1) * 20)}px` }}
                      />
                      <button
                        type="button"
                        onClick={() => void send()}
                        disabled={(!draft.trim() && !file) || sending}
                        aria-label="Send message"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90 disabled:opacity-40"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                  </footer>
                ) : null}
              </>
            )}
          </section>
        </div>
      ) : null}

      <ChatContextMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onArchive={(id, archived) => void archive(id, archived)}
      />

      {!onChatsPage || open ? (
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          aria-label={totalUnread > 0 ? `Chats, ${totalUnread} unread` : "Chats"}
          title="Chats"
          className="fixed bottom-5 right-5 z-[150] inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--venue-primary,#818a40)] text-white shadow-lg transition hover:scale-105 hover:shadow-xl"
        >
          {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          {!open ? <Badge count={totalUnread} className="absolute -right-0.5 -top-0.5" /> : null}
        </button>
      ) : null}
    </>
  );
}
