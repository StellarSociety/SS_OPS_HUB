"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { ChatConversation } from "@/components/connect/chat/chat-conversation";
import { useChatPanes } from "@/components/connect/chat/chat-panes-context";
import { fetchChatPane } from "@/lib/actions/connect-chat";

type PaneData = Extract<Awaited<ReturnType<typeof fetchChatPane>>, { ok: true }>;

/** A chat opened side by side next to the main one. */
export function ChatExtraPane({ conversationId }: { conversationId: string }) {
  const panes = useChatPanes();
  const [data, setData] = useState<PaneData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchChatPane(conversationId).then((result) => {
      if (cancelled) return;
      if (result.ok) setData(result);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (!data) {
    return (
      <div className="relative flex min-w-0 flex-1 items-center justify-center bg-[#F7F8F2] text-sm text-black/50">
        {error ?? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading chat…
          </span>
        )}
        <button
          type="button"
          onClick={() => panes?.closePane(conversationId)}
          className="absolute right-3 top-3 rounded-full p-2 text-black/50 hover:bg-black/5"
          aria-label="Close chat window"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <ChatConversation
      key={conversationId}
      detail={data.detail}
      initialMessages={data.messages}
      initialHasMore={data.hasMore}
      me={data.me}
      venuePeople={data.venuePeople}
    />
  );
}
