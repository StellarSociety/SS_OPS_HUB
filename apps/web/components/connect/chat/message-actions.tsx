"use client";

import { Loader2, Pencil, Reply, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { ConnectAvatar } from "@/components/connect/connect-avatar";
import { MessageTicks } from "@/components/connect/chat/message-ticks";
import { fetchMessageReadBy, type MessageReader } from "@/lib/actions/connect-chat";
import type { ReplyPreview } from "@/lib/connect/chat-types";
import { decodeMentions } from "@/lib/connect/mentions";
import type { ConnectPerson } from "@/lib/connect/types";
import { isEdgeSwipeActive } from "@/components/mobile/edge-swipe-back";
import { cn } from "@/lib/utils";

export type MessageMenuAction = "reply" | "edit" | "delete";

export type MessageMenuState = {
  x: number;
  y: number;
  messageId: string;
  actions: MessageMenuAction[];
  /** Own messages: show who has read it (and when) under the actions. */
  readBy?: { sentAt: string };
} | null;

const ACTION_META: Record<MessageMenuAction, { label: string; icon: typeof Reply; danger?: boolean }> = {
  reply: { label: "Reply", icon: Reply },
  edit: { label: "Edit", icon: Pencil },
  delete: { label: "Delete", icon: Trash2, danger: true },
};

/** Right-click (desktop) / long-press (touch) menu for one message. */
export function MessageMenu({
  menu,
  onClose,
  onAction,
  peopleById,
}: {
  menu: MessageMenuState;
  onClose: () => void;
  onAction: (action: MessageMenuAction, messageId: string) => void;
  peopleById: Map<string, ConnectPerson>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      // Scroll / resize targets can be the window or document, not an element.
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("touchstart", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("touchstart", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, onClose]);

  if (!menu || (menu.actions.length === 0 && !menu.readBy) || typeof document === "undefined") {
    return null;
  }

  // Open downwards from the pointer, or upwards in the lower half of the screen
  // (the read-by list makes the height vary, so anchor instead of measuring).
  const width = menu.readBy ? 248 : 176;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8));
  const openUp = menu.y > window.innerHeight / 2;
  const position = openUp
    ? { left, bottom: Math.max(8, window.innerHeight - menu.y) }
    : { left, top: Math.max(8, menu.y) };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-[320] flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-xl"
      style={{ ...position, width }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.actions.map((action, i) => {
        const meta = ACTION_META[action];
        const Icon = meta.icon;
        return (
          <button
            key={action}
            type="button"
            role="menuitem"
            autoFocus={i === 0}
            onClick={() => {
              onAction(action, menu.messageId);
              onClose();
            }}
            className={cn(
              "flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm",
              meta.danger
                ? "text-red-700 hover:bg-red-50"
                : "text-[#2B2F16] hover:bg-[var(--venue-primary,#818a40)] hover:text-white",
            )}
          >
            <Icon className="h-4 w-4" />
            {meta.label}
          </button>
        );
      })}
      {menu.readBy ? (
        <ReadBySection
          key={menu.messageId}
          messageId={menu.messageId}
          sentAt={menu.readBy.sentAt}
          peopleById={peopleById}
          divider={menu.actions.length > 0}
        />
      ) : null}
    </div>,
    document.body,
  );
}

const LONG_PRESS_MS = 450;
const SWIPE_REPLY_PX = 64;
const MOVE_CANCEL_PX = 10;

/**
 * Touch gestures for a message: long-press opens the menu, swiping right
 * replies (when `onSwipeReply` is set). Returns handlers and the live offset
 * to translate the bubble by while swiping.
 */
export function useMessageGestures({
  onLongPress,
  onSwipeReply,
}: {
  onLongPress: (x: number, y: number) => void;
  onSwipeReply?: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  const handlers = {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      // A swipe from the screen edge means "back", not "reply".
      if (!t || e.touches.length > 1 || isEdgeSwipeActive()) return;
      start.current = { x: t.clientX, y: t.clientY, horizontal: null };
      pressed.current = false;
      clearTimer();
      timer.current = setTimeout(() => {
        pressed.current = true;
        navigator.vibrate?.(15);
        onLongPress(t.clientX, t.clientY);
      }, LONG_PRESS_MS);
    },
    onTouchMove: (e: TouchEvent) => {
      const s = start.current;
      const t = e.touches[0];
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX) clearTimer();
      if (s.horizontal === null && (Math.abs(dx) > MOVE_CANCEL_PX || Math.abs(dy) > MOVE_CANCEL_PX)) {
        s.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (onSwipeReply && s.horizontal && dx > 0) setOffset(Math.min(dx, SWIPE_REPLY_PX * 1.4));
    },
    onTouchEnd: () => {
      clearTimer();
      if (onSwipeReply && offset >= SWIPE_REPLY_PX) onSwipeReply();
      setOffset(0);
      start.current = null;
    },
    onTouchCancel: () => {
      clearTimer();
      setOffset(0);
      start.current = null;
    },
  };

  return { handlers, offset, replyReady: offset >= SWIPE_REPLY_PX, longPressed: pressed };
}

function previewText(preview: ReplyPreview): string {
  if (preview.deleted) return "Message deleted";
  return decodeMentions(preview.body).trim() || (preview.hasAttachment ? "📎 Attachment" : "");
}

/** Quoted message shown at the top of a reply bubble. */
export function ReplyQuote({
  preview,
  senderName,
  mine,
  onJump,
}: {
  preview: ReplyPreview | null;
  senderName: string;
  mine: boolean;
  onJump?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJump}
      disabled={!onJump}
      className={cn(
        "mb-1.5 block w-full min-w-0 rounded-lg border-l-[3px] px-2 py-1 text-left text-xs",
        mine
          ? "border-white/70 bg-white/15 text-white/90"
          : "border-[var(--venue-primary,#818a40)] bg-[#F0F2E8] text-black/60",
      )}
    >
      <span className={cn("block font-semibold", mine ? "text-white" : "text-[var(--venue-primary,#818a40)]")}>
        {preview ? senderName : "Reply"}
      </span>
      <span className="line-clamp-2 break-words">
        {preview ? previewText(preview) : "Original message unavailable"}
      </span>
    </button>
  );
}

/** "Replying to …" / "Editing message" strip above the composer. */
export function ComposerBanner({
  mode,
  title,
  preview,
  onCancel,
}: {
  mode: "reply" | "edit";
  title: string;
  preview: ReplyPreview;
  onCancel: () => void;
}) {
  const Icon = mode === "reply" ? Reply : Pencil;
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border-l-[3px] border-[var(--venue-primary,#818a40)] bg-[#F0F2E8] px-3 py-1.5 text-xs">
      <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--venue-primary,#818a40)]" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[#2B2F16]">{title}</span>
        <span className="block truncate text-black/55">{previewText(preview)}</span>
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full p-0.5 text-black/50 hover:bg-black/10"
        aria-label={mode === "reply" ? "Cancel reply" : "Cancel edit"}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(/\//g, "-");
}

const STATUS_LABEL: Record<MessageReader["status"], string> = {
  read: "Read",
  delivered: "Delivered",
  sent: "Not delivered yet",
};

/** Who has read one of the viewer's messages, with times — shown inside the menu. */
function ReadBySection({
  messageId,
  sentAt,
  peopleById,
  divider,
}: {
  messageId: string;
  sentAt: string;
  peopleById: Map<string, ConnectPerson>;
  divider: boolean;
}) {
  const [state, setState] = useState<
    { readers: MessageReader[]; exactTimes: boolean } | { error: string } | null
  >(null);

  useEffect(() => {
    let alive = true;
    void fetchMessageReadBy(messageId).then((result) => {
      if (!alive) return;
      setState(result.ok ? { readers: result.readers, exactTimes: result.exactTimes } : { error: result.error });
    });
    return () => {
      alive = false;
    };
  }, [messageId]);

  const order: Record<MessageReader["status"], number> = { read: 0, delivered: 1, sent: 2 };

  return (
    <div className={cn("min-h-0 px-3 pb-1.5 pt-2", divider && "mt-1 border-t border-black/5")}>
      <p className="text-[11px] text-black/45">Sent {formatWhen(sentAt)}</p>
      {!state ? (
        <p className="flex items-center gap-1.5 py-2 text-xs text-black/45">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking who read it…
        </p>
      ) : "error" in state ? (
        <p className="py-2 text-xs text-red-700">{state.error}</p>
      ) : state.readers.length === 0 ? (
        <p className="py-2 text-xs text-black/50">Nobody else is in this chat.</p>
      ) : (
        <ul className="mt-1 max-h-56 space-y-1.5 overflow-y-auto">
          {[...state.readers]
            .sort((a, b) => order[a.status] - order[b.status])
            .map((r) => {
              const person = peopleById.get(r.userId);
              return (
                <li key={r.userId} className="flex items-center gap-2">
                  <ConnectAvatar name={person?.name ?? "Former user"} photoUrl={person?.photoUrl} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-[#2B2F16]">
                      {person?.name ?? "Former user"}
                    </span>
                    <span className="block text-[11px] text-black/50">
                      {STATUS_LABEL[r.status]}
                      {r.status === "read" && r.readAt ? ` · ${formatWhen(r.readAt)}` : ""}
                    </span>
                  </span>
                  <span className={cn("rounded-full px-1 py-0.5", r.status === "read" ? "bg-[var(--venue-primary,#818a40)]" : "bg-black/35")}>
                    <MessageTicks status={r.status} />
                  </span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}

/**
 * Wraps a message bubble: right-click and long-press open the menu, and
 * swiping right (touch) replies, with a reply icon revealed behind it.
 */
export function GestureBubble({
  onMenu,
  onSwipeReply,
  className,
  children,
}: {
  onMenu: (x: number, y: number) => void;
  onSwipeReply?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const { handlers, offset, replyReady } = useMessageGestures({
    onLongPress: onMenu,
    onSwipeReply,
  });
  return (
    <div
      className={cn("relative select-none [-webkit-touch-callout:none] sm:select-text", className)}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY);
      }}
      {...handlers}
    >
      {offset > 0 ? (
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-1/2 flex h-7 w-7 -translate-x-9 -translate-y-1/2 items-center justify-center rounded-full transition",
            replyReady ? "bg-[var(--venue-primary,#818a40)] text-white" : "bg-black/10 text-black/50",
          )}
          style={{ opacity: Math.min(1, offset / SWIPE_REPLY_PX) }}
        >
          <Reply className="h-4 w-4" />
        </span>
      ) : null}
      <div
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        className={offset ? undefined : "transition-transform"}
      >
        {children}
      </div>
    </div>
  );
}
