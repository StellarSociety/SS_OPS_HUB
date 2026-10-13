"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Whether this person may write in Connecteam here (start chats, send,
 * post, comment, call). The phone sets it from Mobile App Access
 * (Viewer = read only); the web app leaves the default (true).
 */
const ConnectWriteContext = createContext(true);

export function ConnectWriteProvider({
  canWrite,
  children,
}: {
  canWrite: boolean;
  children: ReactNode;
}) {
  return (
    <ConnectWriteContext.Provider value={canWrite}>
      {children}
    </ConnectWriteContext.Provider>
  );
}

export function useConnectCanWrite(): boolean {
  return useContext(ConnectWriteContext);
}

export const CONNECT_READ_ONLY_NOTE =
  "Read only — to send messages, contact your supervisor or Hub admin.";
