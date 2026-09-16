"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RefreshSpinner } from "@/components/mobile/refresh-spinner";

const MIN_VISIBLE_MS = 420;

type MobileNavBusyContextValue = {
  busy: boolean;
  beginNav: () => void;
  endNav: () => void;
};

const MobileNavBusyContext = createContext<MobileNavBusyContextValue>({
  busy: false,
  beginNav: () => {},
  endNav: () => {},
});

export function useMobileNavBusy() {
  return useContext(MobileNavBusyContext);
}

export function MobileNavBusyProvider({
  children,
  resetKey,
}: {
  children: ReactNode;
  /** Clears the overlay when the route / preview page actually changes. */
  resetKey: string;
}) {
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef(0);
  const hideTimerRef = useRef<number | null>(null);
  const resetKeyRef = useRef(resetKey);

  const clearTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const beginNav = useCallback(() => {
    clearTimer();
    startedAtRef.current = Date.now();
    setBusy(true);
    hideTimerRef.current = window.setTimeout(() => {
      setBusy(false);
      hideTimerRef.current = null;
    }, 8000);
  }, [clearTimer]);

  const endNav = useCallback(() => {
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAtRef.current));
    clearTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setBusy(false);
      hideTimerRef.current = null;
    }, wait);
  }, [clearTimer]);

  useEffect(() => {
    if (resetKeyRef.current === resetKey) return;
    resetKeyRef.current = resetKey;
    if (busy) endNav();
  }, [busy, endNav, resetKey]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const value = useMemo(
    () => ({ busy, beginNav, endNav }),
    [busy, beginNav, endNav],
  );

  return (
    <MobileNavBusyContext.Provider value={value}>
      {children}
    </MobileNavBusyContext.Provider>
  );
}

export function MobilePageLoadingOverlay() {
  const { busy } = useMobileNavBusy();
  if (!busy) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      className="absolute inset-0 z-[60] flex items-center justify-center bg-[#E9E3D6]/78 backdrop-blur-[2px]"
    >
      <RefreshSpinner spinning size={38} className="text-[#3D421F]" />
    </div>
  );
}
