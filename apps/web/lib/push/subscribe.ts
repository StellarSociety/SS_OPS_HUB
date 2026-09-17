import { PWA_SW_PATH } from "@/lib/pwa/constants";
import { WEB_PUSH_PUBLIC_KEY } from "./constants";
import { urlBase64ToUint8Array } from "./application-server-key";
import { browserSupportsWebPush } from "./platform";
import type { PushPlatform } from "./types";

export async function ensurePushServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This device cannot receive lock-screen alerts.");
  }
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register(PWA_SW_PATH, {
    scope: "/",
    updateViaCache: "none",
  });
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!browserSupportsWebPush()) return null;
  const registration = await ensurePushServiceWorker();
  await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function createBrowserPushSubscription(
  publicKey: string = WEB_PUSH_PUBLIC_KEY,
): Promise<PushSubscription> {
  const key = publicKey.trim();
  if (!key) {
    throw new Error("Device notifications are not configured.");
  }
  const registration = await ensurePushServiceWorker();
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  });
}

export function serializePushSubscription(
  subscription: PushSubscription,
  platform: PushPlatform,
) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("Could not create a push subscription.");
  }
  return {
    endpoint: json.endpoint,
    p256dh,
    auth,
    userAgent: navigator.userAgent,
    platform,
  };
}
