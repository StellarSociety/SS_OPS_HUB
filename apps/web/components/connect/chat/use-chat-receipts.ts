"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchChatReceipts } from "@/lib/actions/connect-chat";
import type { ChatReceipts } from "@/lib/connect/chat-receipts";

const POLL_MS = 10_000;

/**
 * Other members' read / delivery times for one chat, refreshed every 10s
 * while the page is visible (chat_members is not on Realtime). Call
 * `refresh` after sending so a fresh message gets its ticks quickly.
 */
export function useChatReceipts(conversationId: string | null) {
  const [state, setState] = useState<{ id: string | null; receipts: ChatReceipts | null }>({
    id: null,
    receipts: null,
  });

  const refresh = useCallback(() => {
    if (!conversationId) return;
    void fetchChatReceipts(conversationId).then((result) => {
      if (result.ok) setState({ id: conversationId, receipts: result.receipts });
    });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [conversationId, refresh]);

  // Ignore receipts that belong to a previously open chat.
  return { receipts: state.id === conversationId ? state.receipts : null, refresh };
}
