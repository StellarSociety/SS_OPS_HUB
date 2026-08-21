import type { PWADeviceState } from "@/lib/pwa/device";

export const INSTALL_PREVIEW_KINDS = [
  "ios",
  "ios-chrome",
  "android",
  "desktop",
  "installed",
] as const;

export type InstallPreviewKind = (typeof INSTALL_PREVIEW_KINDS)[number];

const IOS_SAFARI_DEVICE: PWADeviceState = {
  kind: "ios",
  isIOS: true,
  isAndroid: false,
  isDesktop: false,
  isIOSSafari: true,
  needsSafari: false,
  isChromiumInstallable: false,
};

const IOS_CHROME_DEVICE: PWADeviceState = {
  kind: "ios",
  isIOS: true,
  isAndroid: false,
  isDesktop: false,
  isIOSSafari: false,
  needsSafari: true,
  isChromiumInstallable: false,
};

const ANDROID_DEVICE: PWADeviceState = {
  kind: "android",
  isIOS: false,
  isAndroid: true,
  isDesktop: false,
  isIOSSafari: false,
  needsSafari: false,
  isChromiumInstallable: true,
};

const DESKTOP_DEVICE: PWADeviceState = {
  kind: "desktop",
  isIOS: false,
  isAndroid: false,
  isDesktop: true,
  isIOSSafari: false,
  needsSafari: false,
  isChromiumInstallable: false,
};

export function parseInstallPreview(
  value: string | string[] | undefined,
): InstallPreviewKind | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return (INSTALL_PREVIEW_KINDS as readonly string[]).includes(raw)
    ? (raw as InstallPreviewKind)
    : null;
}

export function deviceForInstallPreview(
  preview: InstallPreviewKind,
): PWADeviceState {
  switch (preview) {
    case "ios":
    case "installed":
      return IOS_SAFARI_DEVICE;
    case "ios-chrome":
      return IOS_CHROME_DEVICE;
    case "android":
      return ANDROID_DEVICE;
    case "desktop":
      return DESKTOP_DEVICE;
  }
}
