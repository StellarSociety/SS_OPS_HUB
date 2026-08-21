"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { PWA_SW_PATH } from "@/lib/pwa/constants";
import {
  detectPWADeviceFromWindow,
  type PWADeviceState,
} from "@/lib/pwa/device";
import { useStandaloneMode } from "@/lib/pwa/use-standalone-mode";

export type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

export type PromptOutcome = "accepted" | "dismissed" | "unavailable";

type PWAInstallContextValue = {
  standalone: boolean;
  installed: boolean;
  canPrompt: boolean;
  dismissedThisSession: boolean;
  device: PWADeviceState | null;
  promptInstall: () => Promise<PromptOutcome>;
};

const PWAInstallContext = createContext<PWAInstallContextValue | null>(null);

const EMPTY_DEVICE: PWADeviceState = {
  kind: "desktop",
  isIOS: false,
  isAndroid: false,
  isDesktop: true,
  isIOSSafari: false,
  needsSafari: false,
  isChromiumInstallable: false,
};

let cachedDevice: PWADeviceState | null = null;

function subscribeDevice(): () => void {
  return () => {};
}

function getDeviceSnapshot(): PWADeviceState {
  cachedDevice ??= detectPWADeviceFromWindow();
  return cachedDevice;
}

function getServerDevice(): null {
  return null;
}

async function registerServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register(PWA_SW_PATH, {
      scope: "/",
      updateViaCache: "none",
    });
  } catch (error) {
    console.warn("[pwa] service worker registration failed:", error);
  }
}

async function relatedAppsInstalled(): Promise<boolean> {
  const getInstalled = (
    navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform: string }>>;
    }
  ).getInstalledRelatedApps;
  if (typeof getInstalled !== "function") return false;
  try {
    const apps = await getInstalled.call(navigator);
    return apps.length > 0;
  } catch {
    return false;
  }
}

export function PWAInstallProvider({ children }: { children: ReactNode }) {
  const standalone = useStandaloneMode();
  const device = useSyncExternalStore(
    subscribeDevice,
    getDeviceSnapshot,
    getServerDevice,
  );
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installedEvent, setInstalledEvent] = useState(false);
  const [relatedInstalled, setRelatedInstalled] = useState(false);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

  useEffect(() => {
    void registerServiceWorker();
    void relatedAppsInstalled().then(setRelatedInstalled);
  }, []);

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setInstalledEvent(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<PromptOutcome> => {
    if (!deferredPrompt) return "unavailable";
    const promptEvent = deferredPrompt;
    setDeferredPrompt(null);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setInstalledEvent(true);
        return "accepted";
      }
      setDismissedThisSession(true);
      return "dismissed";
    } catch {
      setDismissedThisSession(true);
      return "unavailable";
    }
  }, [deferredPrompt]);

  const value = useMemo<PWAInstallContextValue>(
    () => ({
      standalone,
      installed: standalone || installedEvent || relatedInstalled,
      canPrompt: Boolean(deferredPrompt) && !dismissedThisSession,
      dismissedThisSession,
      device,
      promptInstall,
    }),
    [
      standalone,
      installedEvent,
      relatedInstalled,
      deferredPrompt,
      dismissedThisSession,
      device,
      promptInstall,
    ],
  );

  return (
    <PWAInstallContext.Provider value={value}>
      {children}
    </PWAInstallContext.Provider>
  );
}

export function usePWAInstall(): PWAInstallContextValue {
  const value = useContext(PWAInstallContext);
  if (!value) {
    throw new Error("usePWAInstall must be used within PWAInstallProvider");
  }
  return value;
}

export function useOptionalPWAInstall(): PWAInstallContextValue | null {
  return useContext(PWAInstallContext);
}

export function fallbackDevice(
  device: PWADeviceState | null,
): PWADeviceState {
  return device ?? EMPTY_DEVICE;
}
