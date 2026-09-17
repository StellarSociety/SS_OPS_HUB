import {
  detectPWADeviceFromWindow,
  type PWADeviceState,
} from "@/lib/pwa/device";
import { readStandaloneFromWindow } from "@/lib/pwa/standalone";
import { WEB_PUSH_PUBLIC_KEY } from "./constants";
import type { PushPlatform } from "./types";

export function pushPlatformFromDevice(device: PWADeviceState): PushPlatform {
  if (device.isIOS) return "ios";
  if (device.isAndroid) return "android";
  return "desktop";
}

export function webPushIsAvailable(input: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIOS: boolean;
  standalone: boolean;
  publicKey: string;
}): boolean {
  if (!input.publicKey.trim()) return false;
  if (
    !input.hasServiceWorker ||
    !input.hasPushManager ||
    !input.hasNotification
  ) {
    return false;
  }
  // iOS 16.4+ only exposes Web Push inside a Home Screen PWA.
  if (input.isIOS && !input.standalone) return false;
  return true;
}

export function browserSupportsWebPush(
  target: Window & { navigator: Navigator } = window,
): boolean {
  return (
    "serviceWorker" in target.navigator &&
    "PushManager" in target &&
    "Notification" in target
  );
}

export function canUseWebPush(
  target: Window & { navigator: Navigator } = window,
): boolean {
  const device = detectPWADeviceFromWindow(target);
  return webPushIsAvailable({
    hasServiceWorker: "serviceWorker" in target.navigator,
    hasPushManager: "PushManager" in target,
    hasNotification: "Notification" in target,
    isIOS: device.isIOS,
    standalone: readStandaloneFromWindow(target),
    publicKey: WEB_PUSH_PUBLIC_KEY,
  });
}

export function iosNeedsHomeScreenInstall(
  target: Window & { navigator: Navigator } = window,
): boolean {
  const device = detectPWADeviceFromWindow(target);
  return device.isIOS && !readStandaloneFromWindow(target);
}
