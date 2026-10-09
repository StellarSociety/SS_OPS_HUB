"use client";

import { createContext, useContext } from "react";

/** Lets each open chat window close itself inside the Chats page. */
export const ChatPanesContext = createContext<{ closePane: (conversationId: string) => void } | null>(
  null,
);

export function useChatPanes() {
  return useContext(ChatPanesContext);
}
