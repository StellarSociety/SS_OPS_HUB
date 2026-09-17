import { WEB_PUSH_PUBLIC_KEY } from "./constants";
import { urlBase64ToUint8Array } from "./application-server-key";
import { browserSupportsWebPush } from "./platform";
import type { PushPlatform } from "./types";

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!browserSupportsWebPush()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function createBrowserPushSubscription(): Promise<PushSubscription> {
  if (!WEB_PUSH_PUBLIC_KEY) {
    throw new Error("Device notifications are not configured.");
  }
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      WEB_PUSH_PUBLIC_KEY,
    ) as BufferSource,
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
