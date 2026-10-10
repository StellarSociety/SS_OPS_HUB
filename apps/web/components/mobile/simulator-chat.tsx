"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ChatConversation } from "@/components/connect/chat/chat-conversation";
import { loadPreviewChat } from "@/lib/actions/mobile-preview-connect";

type Loaded = Awaited<ReturnType<typeof loadPreviewChat>>;

/**
 * A conversation inside the device simulator, as the previewed user. Your own
 * chats work fully; another employee's are read-only.
 */
export function SimulatorChat({
  venueId,
  staffId,
  conversationId,
  onBack,
}: {
  venueId: string;
  /** Previewed employee, or null for yourself. */
  staffId: string | null;
  conversationId: string;
  onBack: () => void;
}) {
  const [state, setState] = useState<{ key: string; result: Loaded } | null>(null);
  const key = `${staffId ?? "me"}:${conversationId}`;

  useEffect(() => {
    let alive = true;
    void loadPreviewChat({ venueId, staffId, conversationId }).then((result) => {
      if (alive) setState({ key, result });
    });
    return () => {
      alive = false;
    };
  }, [venueId, staffId, conversationId, key]);

  const result = state?.key === key ? state.result : null;

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-black/45">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Opening chat…
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white px-8 text-center text-sm text-black/55">
        {result.error}
        <button type="button" onClick={onBack} className="font-semibold text-[var(--venue-primary,#818a40)]">
          Back to chats
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-app-canvas flex h-full min-h-0 flex-col bg-white">
      <ChatConversation
        key={result.detail.id}
        detail={result.detail}
        initialMessages={result.messages}
        initialHasMore={result.hasMore}
        me={result.me}
        venuePeople={result.venuePeople}
        onBack={onBack}
        readOnly={result.impersonating}
      />
    </div>
  );
}
