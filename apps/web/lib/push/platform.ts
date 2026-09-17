import {
  detectPWADeviceFromWindow,
  type PWADeviceState,
} from "@/lib/pwa/device";
import { readStandaloneFromWindow } from "@/lib/pwa/standalone";
import { WEB_PUSH_PUBLIC_KEY } from "./constants";
import type { PushPlatform } from "./types";

export type WebPushBlockReason =
  | null
  | "missing-key"
  | "insecure"
  | "ios-needs-safari"
  | "ios-not-standalone"
  | "no-service-worker"
  | "no-push-api";

export function pushPlatformFromDevice(device: PWADeviceState): PushPlatform {
  if (device.isIOS) return "ios";
  if (device.isAndroid) return "android";
  return "desktop";
}

export function windowHasPushManager(
  target: Window & { navigator: Navigator } = window,
): boolean {
  if ("PushManager" in target) return true;
  return (
    "ServiceWorkerRegistration" in target &&
    "pushManager" in ServiceWorkerRegistration.prototype
  );
}

export function inspectWebPushSupport(input: {
  publicKey: string;
  isSecureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  needsSafari: boolean;
  standalone: boolean;
}): WebPushBlockReason {
  if (!input.publicKey.trim()) return "missing-key";
  if (!input.isSecureContext) return "insecure";
  if (input.isIOS && input.needsSafari && !input.standalone) {
    return "ios-needs-safari";
  }
  if (input.isIOS && !input.standalone) return "ios-not-standalone";
  if (!input.hasServiceWorker) return "no-service-worker";
  if (!input.hasPushManager || !input.hasNotification) return "no-push-api";
  return null;
}

export function webPushIsAvailable(input: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  standalone: boolean;
  publicKey: string;
  isSecureContext?: boolean;
  needsSafari?: boolean;
}): boolean {
  return (
    inspectWebPushSupport({
      ...input,
      isSecureContext: input.isSecureContext ?? true,
      needsSafari: input.needsSafari ?? false,
    }) === null
  );
}

export function browserSupportsWebPush(
  target: Window & { navigator: Navigator } = window,
): boolean {
  return (
    "serviceWorker" in target.navigator &&
    windowHasPushManager(target) &&
    "Notification" in target
  );
}

export function inspectWindowWebPush(
  target: Window & { navigator: Navigator } = window,
  publicKey: string = WEB_PUSH_PUBLIC_KEY,
): WebPushBlockReason {
  const device = detectPWADeviceFromWindow(target);
  return inspectWebPushSupport({
    publicKey,
    isSecureContext: target.isSecureContext,
    hasServiceWorker: "serviceWorker" in target.navigator,
    hasPushManager: windowHasPushManager(target),
    hasNotification: "Notification" in target,
    isIOS: device.isIOS,
    needsSafari: device.needsSafari,
    standalone: readStandaloneFromWindow(target),
  });
}

export function canUseWebPush(
  target: Window & { navigator: Navigator } = window,
  publicKey: string = WEB_PUSH_PUBLIC_KEY,
): boolean {
  return inspectWindowWebPush(target, publicKey) === null;
}

export function iosNeedsHomeScreenInstall(
  target: Window & { navigator: Navigator } = window,
): boolean {
  const device = detectPWADeviceFromWindow(target);
  return device.isIOS && !readStandaloneFromWindow(target);
}
