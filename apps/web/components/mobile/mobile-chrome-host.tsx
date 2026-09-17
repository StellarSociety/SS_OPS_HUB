"use client";

import { createContext, useContext, type ReactNode } from "react";

/** `undefined` = no shell; `null` = shell mounted, host node not ready yet. */
const MobileChromeHostContext = createContext<HTMLElement | null | undefined>(
  undefined,
);

export function MobileChromeHostProvider({
  host,
  children,
}: {
  host: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <MobileChromeHostContext.Provider value={host}>
      {children}
    </MobileChromeHostContext.Provider>
  );
}

export function useMobileChromeHost() {
  return useContext(MobileChromeHostContext);
}
