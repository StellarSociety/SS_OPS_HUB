"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Bell, X } from "lucide-react";
import {
  fallbackDevice,
  usePWAInstall,
} from "@/components/pwa/pwa-install-provider";
import {
  getPushSubscriptionStatus,
  getWebPushClientConfig,
  removePushSubscription,
  savePushSubscription,
  sendTestDeviceNotification,
} from "@/lib/actions/push-subscription";
import { PWA_INSTALL_PATH } from "@/lib/pwa/constants";
import {
  PUSH_BANNER_DISMISS_KEY,
  PUSH_BANNER_DISMISS_MS,
} from "@/lib/push/constants";
import { WEB_PUSH_PUBLIC_KEY } from "@/lib/push/constants";
import {
  inspectWindowWebPush,
  iosNeedsHomeScreenInstall,
  pushPlatformFromDevice,
  type WebPushBlockReason,
} from "@/lib/push/platform";
import {
  createBrowserPushSubscription,
  ensurePushServiceWorker,
  getExistingPushSubscription,
  serializePushSubscription,
} from "@/lib/push/subscribe";
import { cn } from "@/lib/utils";

const DISMISS_EVENT = "ss-ops-push-banner-dismiss";

function bannerIsDismissed(): boolean {
  try {
    const raw = localStorage.getItem(PUSH_BANNER_DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at < PUSH_BANNER_DISMISS_MS;
  } catch {
    return false;
  }
}

function subscribeBannerDismiss(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(DISMISS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(DISMISS_EVENT, onStoreChange);
  };
}

function dismissBanner() {
  try {
    localStorage.setItem(PUSH_BANNER_DISMISS_KEY, String(Date.now()));
  } catch {
    // Ignore quota / private-mode failures.
  }
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

function currentPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function settingsCopy(reason: WebPushBlockReason): string | null {
  switch (reason) {
    case "missing-key":
      return "Lock-screen alerts are not configured on the server yet. Ask an admin to set the web push keys and redeploy.";
    case "insecure":
      return "This page is not on a secure connection. Open the installed app from https://opshub.stellarsocietygroup.com — HTTP network addresses cannot receive alerts.";
    case "ios-needs-safari":
      return "On iPhone, open SS Ops Hub in Safari, add it to your Home Screen, then enable alerts from the installed app.";
    case "ios-not-standalone":
      return "On iPhone and iPad, add SS Ops Hub to your Home Screen first, then open the installed app and enable notifications here.";
    case "no-service-worker":
    case "no-push-api":
      return "This phone cannot receive lock-screen alerts. iPhone needs iOS 16.4 or later, and the Hub must be opened from the Home Screen icon — not from a Safari tab.";
    default:
      return null;
  }
}

export function useDeviceNotifications(options?: { loadCount?: boolean }) {
  const loadCount = options?.loadCount ?? false;
  const { standalone, device } = usePWAInstall();
  const resolved = fallbackDevice(device);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [publicKey, setPublicKey] = useState(WEB_PUSH_PUBLIC_KEY);
  const [configReady, setConfigReady] = useState(Boolean(WEB_PUSH_PUBLIC_KEY));

  const blockReason =
    hydrated && configReady ? inspectWindowWebPush(window, publicKey) : null;
  const supported = hydrated && configReady && blockReason === null;
  const needsInstall =
    hydrated &&
    (blockReason === "ios-not-standalone" ||
      blockReason === "ios-needs-safari" ||
      iosNeedsHomeScreenInstall());
  const platform = pushPlatformFromDevice(resolved);

  const refresh = useCallback(async () => {
    setPermission(currentPermission());
    try {
      const existing = await getExistingPushSubscription();
      setSubscribed(Boolean(existing) && Notification.permission === "granted");
    } catch {
      setSubscribed(false);
    }
    if (!loadCount) return;
    try {
      const status = await getPushSubscriptionStatus();
      setDeviceCount(status.deviceCount);
    } catch {
      setDeviceCount(0);
    }
  }, [loadCount]);

  useEffect(() => {
    let cancelled = false;
    setHydrated(true);
    setPermission(currentPermission());
    void getWebPushClientConfig()
      .then((config) => {
        if (cancelled) return;
        const next = config.publicKey.trim();
        if (next) setPublicKey(next);
      })
      .catch(() => {
        /* keep the build-time key */
      })
      .finally(() => {
        if (!cancelled) setConfigReady(true);
      });
    void ensurePushServiceWorker().catch(() => {
      /* registration is retried on Enable */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void refresh();
  }, [hydrated, refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setMessage(
          result === "denied"
            ? "Notifications are blocked. Enable them in this device’s settings."
            : "Permission was not granted.",
        );
        return { ok: false as const };
      }
      const subscription = await createBrowserPushSubscription(publicKey);
      const saved = await savePushSubscription(
        serializePushSubscription(subscription, platform),
      );
      if (saved.error) {
        setMessage(saved.error);
        return { ok: false as const };
      }
      setSubscribed(true);
      dismissBanner();
      await refresh();
      return { ok: true as const };
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not enable notifications.",
      );
      return { ok: false as const };
    } finally {
      setBusy(false);
    }
  }, [platform, publicKey, refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const existing = await getExistingPushSubscription();
      if (existing) {
        const endpoint = existing.endpoint;
        await existing.unsubscribe();
        await removePushSubscription(endpoint);
      }
      setSubscribed(false);
      await refresh();
      return { ok: true as const };
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not disable notifications.",
      );
      return { ok: false as const };
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const sendTest = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendTestDeviceNotification();
      if ("error" in result && result.error) {
        setMessage(result.error);
        return { ok: false as const };
      }
      setMessage("Test notification sent. Check the lock screen.");
      return { ok: true as const };
    } finally {
      setBusy(false);
    }
  }, []);

  const syncIfGranted = useCallback(async () => {
    if (!supported) return;
    if (currentPermission() !== "granted") return;
    try {
      const subscription = await createBrowserPushSubscription(publicKey);
      await savePushSubscription(
        serializePushSubscription(subscription, platform),
      );
      setSubscribed(true);
    } catch {
      // Browser may already have a subscription we cannot refresh.
    }
  }, [platform, publicKey, supported]);

  return {
    hydrated,
    configReady,
    supported,
    needsInstall,
    blockReason,
    standalone,
    permission,
    subscribed,
    deviceCount,
    busy,
    message,
    enable,
    disable,
    sendTest,
    syncIfGranted,
    refresh,
  };
}

function shouldHidePushChrome(pathname: string): boolean {
  if (pathname === PWA_INSTALL_PATH || pathname.startsWith(`${PWA_INSTALL_PATH}/`)) {
    return true;
  }
  if (pathname.includes("/login") || pathname.includes("/select-venue")) {
    return true;
  }
  return false;
}

/** Silent resubscribe + enable banner for installed PWAs. */
export function DeviceNotificationsManager() {
  const pathname = usePathname();
  const push = useDeviceNotifications();
  const dismissed = useSyncExternalStore(
    subscribeBannerDismiss,
    bannerIsDismissed,
    () => true,
  );

  useEffect(() => {
    if (shouldHidePushChrome(pathname)) return;
    void push.syncIfGranted();
  }, [pathname, push.syncIfGranted]);

  const showBanner = useMemo(() => {
    if (!push.hydrated || !push.standalone) return false;
    if (!push.supported) return false;
    if (push.permission !== "default") return false;
    if (dismissed) return false;
    if (shouldHidePushChrome(pathname)) return false;
    return true;
  }, [
    dismissed,
    pathname,
    push.hydrated,
    push.permission,
    push.standalone,
    push.supported,
  ]);

  if (!showBanner) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#3D421F] px-3 py-2.5 text-white shadow-lg shadow-black/20">
        <Bell className="size-4 shrink-0 text-white/80" aria-hidden />
        <p className="min-w-0 flex-1 text-sm leading-5">
          Enable lock-screen alerts for this device
        </p>
        <button
          type="button"
          disabled={push.busy}
          onClick={() => void push.enable()}
          className="shrink-0 rounded-full bg-[#818a40] px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          Allow
        </button>
        <button
          type="button"
          onClick={dismissBanner}
          className="shrink-0 rounded-full p-1 text-white/70 hover:text-white"
          aria-label="Dismiss notification prompt"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function DeviceNotificationEnableRow() {
  const push = useDeviceNotifications();
  if (!push.hydrated || !push.supported || push.needsInstall) return null;
  if (push.permission === "denied" || push.subscribed) return null;

  return (
    <div className="flex items-center justify-between gap-2 border-t border-black/5 px-4 py-2.5">
      <p className="text-xs text-black/55">Get lock-screen alerts on this device</p>
      <button
        type="button"
        disabled={push.busy}
        onClick={() => void push.enable()}
        className="shrink-0 rounded-full bg-[var(--venue-primary,#818a40)] px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
      >
        Enable
      </button>
    </div>
  );
}

export function DeviceNotificationSettingsCard({
  className,
}: {
  className?: string;
}) {
  const push = useDeviceNotifications({ loadCount: true });
  const cardRef = useRef<HTMLElement>(null);
  const [insidePreview, setInsidePreview] = useState(false);

  useEffect(() => {
    void push.syncIfGranted();
  }, [push.syncIfGranted]);

  useEffect(() => {
    setInsidePreview(Boolean(cardRef.current?.closest(".device-preview-screen")));
  }, [push.hydrated]);

  const blockedCopy = settingsCopy(push.hydrated ? push.blockReason : null);
  let body: string;
  if (!push.hydrated || !push.configReady) {
    body = "Checking this device…";
  } else if (insidePreview) {
    body =
      "This Mac preview cannot turn on alerts for your phone. Open the installed SS Ops Hub app on the phone (Home Screen icon), then tap Enable there.";
  } else if (blockedCopy) {
    body = blockedCopy;
  } else if (push.permission === "denied") {
    body =
      "Notifications are blocked for this app. Turn them on in the device settings, then return here.";
  } else if (push.subscribed) {
    body =
      push.deviceCount > 1
        ? `This device is on. ${push.deviceCount} devices will get lock-screen alerts when the Hub is closed.`
        : "This device will receive lock-screen alerts when the Hub is closed.";
  } else {
    body =
      "Allow notifications to get alerts on this phone even when you are not in the app.";
  }

  const showEnable =
    push.supported &&
    !insidePreview &&
    push.permission !== "denied" &&
    !push.subscribed;

  return (
    <section
      ref={cardRef}
      className={cn(
        "rounded-xl border border-black/10 bg-black/[0.03] p-4 dark:border-white/12 dark:bg-white/[0.08]",
        className,
      )}
    >
      <h2 className="font-serif text-lg text-[#3D421F] dark:text-[CanvasText]">
        Device notifications
      </h2>
      <p className="mt-1 text-sm leading-5 text-black/60 dark:text-white/60">
        {body}
      </p>
      {push.message ? (
        <p className="mt-2 text-sm text-[#3D421F] dark:text-[CanvasText]">
          {push.message}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {showEnable ? (
          <button
            type="button"
            disabled={push.busy}
            onClick={() => void push.enable()}
            className="rounded-full bg-[var(--venue-primary,#818a40)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Enable on this device
          </button>
        ) : null}
        {push.subscribed && !insidePreview ? (
          <>
            <button
              type="button"
              disabled={push.busy}
              onClick={() => void push.sendTest()}
              className="rounded-full bg-[var(--venue-primary,#818a40)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Send test
            </button>
            <button
              type="button"
              disabled={push.busy}
              onClick={() => void push.disable()}
              className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium text-[#3D421F] dark:border-white/20 dark:text-[CanvasText] disabled:opacity-60"
            >
              Turn off
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
