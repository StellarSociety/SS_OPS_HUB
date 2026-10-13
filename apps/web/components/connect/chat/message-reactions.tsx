"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { fetchChatReactions, setChatReaction } from "@/lib/actions/connect-chat-reactions";
import {
  buildReactionMap,
  CHAT_REACTIONS,
  isChatReactionKey,
  reactionEmoji,
  summarizeReactions,
  type ChatReactionKey,
  type ChatReactionMap,
  type ChatReactionRow,
} from "@/lib/connect/chat-reactions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type ChatReactions = {
  byMessage: ChatReactionMap;
  /** Picks `key`, or clears it when it's already the viewer's reaction. */
  toggle: (messageId: string, key: ChatReactionKey) => void;
  mine: (messageId: string) => ChatReactionKey | null;
};

function withReaction(
  map: ChatReactionMap,
  messageId: string,
  userId: string,
  key: ChatReactionKey | null,
): ChatReactionMap {
  const next = new Map(map);
  const users = new Map(next.get(messageId) ?? []);
  if (key) users.set(userId, key);
  else users.delete(userId);
  if (users.size) next.set(messageId, users);
  else next.delete(messageId);
  return next;
}

/** Reactions for one open chat, live via realtime. */
export function useChatReactions(conversationId: string | null, meId: string): ChatReactions {
  const [byMessage, setByMessage] = useState<ChatReactionMap>(new Map());
  const latest = useRef(byMessage);
  useEffect(() => {
    latest.current = byMessage;
  }, [byMessage]);

  useEffect(() => {
    if (!conversationId) return;
    let alive = true;
    void fetchChatReactions(conversationId).then((result) => {
      if (alive && result.ok) setByMessage(buildReactionMap(result.rows));
    });
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-reactions:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<ChatReactionRow>;
            if (old.message_id && old.user_id) {
              setByMessage((map) => withReaction(map, old.message_id!, old.user_id!, null));
            }
            return;
          }
          const row = payload.new as ChatReactionRow;
          if (!isChatReactionKey(row.reaction)) return;
          setByMessage((map) => withReaction(map, row.message_id, row.user_id, row.reaction as ChatReactionKey));
        },
      )
      .subscribe();
    return () => {
      alive = false;
      setByMessage(new Map());
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const mine = useCallback(
    (messageId: string) => byMessage.get(messageId)?.get(meId) ?? null,
    [byMessage, meId],
  );

  const toggle = useCallback(
    (messageId: string, key: ChatReactionKey) => {
      if (!meId) return;
      const previous = latest.current.get(messageId)?.get(meId) ?? null;
      const next = previous === key ? null : key;
      setByMessage((map) => withReaction(map, messageId, meId, next));
      void setChatReaction(messageId, next).then((result) => {
        if (result.ok) return;
        setByMessage((map) => withReaction(map, messageId, meId, previous));
        toast.error(result.error);
      });
    },
    [meId],
  );

  return { byMessage, toggle, mine };
}

/**
 * The emoji bar that appears above a received message on hover. Put it inside
 * an element with `group/msg relative`; it sits flush on top so the pointer
 * can travel from the bubble to the bar without the bar disappearing.
 */
export function ReactionPicker({
  current,
  onPick,
  align = "left",
}: {
  current: ChatReactionKey | null;
  onPick: (key: ChatReactionKey) => void;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-full z-20 pb-1 opacity-0 transition-opacity duration-150",
        "group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 group-focus-within/msg:pointer-events-auto group-focus-within/msg:opacity-100",
        // Touch screens use the long-press menu instead.
        "[@media(hover:none)]:hidden",
        align === "left" ? "left-0" : "right-0",
      )}
    >
      <div role="toolbar" aria-label="React" className="flex items-center gap-0.5 rounded-full border border-black/5 bg-white px-1.5 py-1 shadow-lg">
        {CHAT_REACTIONS.map((r) => (
          <button
            key={r.key}
            type="button"
            title={r.label}
            aria-label={r.label}
            aria-pressed={current === r.key}
            onClick={() => onPick(r.key)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-[17px] leading-none transition hover:scale-125 hover:bg-black/5",
              current === r.key && "bg-[var(--venue-secondary,#F0F3DD)]",
            )}
          >
            {r.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Emoji counts under a message; tap one to add or remove your own. */
export function ReactionChips({
  users,
  meId,
  nameOf,
  onToggle,
  align = "left",
}: {
  users: Map<string, ChatReactionKey> | undefined;
  meId: string;
  nameOf: (userId: string) => string;
  onToggle: (key: ChatReactionKey) => void;
  align?: "left" | "right";
}) {
  const summary = summarizeReactions(users);
  if (summary.length === 0) return null;
  return (
    <div className={cn("-mt-1.5 flex flex-wrap gap-1 px-1", align === "right" && "justify-end")}>
      {summary.map(({ key, count, userIds }) => {
        const mineToo = userIds.includes(meId);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            title={userIds.map((id) => (id === meId ? "You" : nameOf(id))).join(", ")}
            className={cn(
              "relative z-10 inline-flex h-6 items-center gap-1 rounded-full border bg-white px-1.5 text-xs shadow-sm transition hover:scale-105",
              mineToo
                ? "border-[var(--venue-primary,#818a40)]/50 bg-[var(--venue-secondary,#F0F3DD)]"
                : "border-black/10",
            )}
          >
            <span className="text-[13px] leading-none">{reactionEmoji(key)}</span>
            {count > 1 ? <span className="tabular-nums text-black/60">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** A row of reactions for the long-press / right-click message menu. */
export function MenuReactionRow({
  current,
  onPick,
}: {
  current: ChatReactionKey | null;
  onPick: (key: ChatReactionKey) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-black/5 px-2 pb-1.5 pt-1">
      {CHAT_REACTIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          aria-label={r.label}
          onClick={() => onPick(r.key)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition active:scale-125",
            current === r.key && "bg-[var(--venue-secondary,#F0F3DD)]",
          )}
        >
          {r.emoji}
        </button>
      ))}
    </div>
  );
}
