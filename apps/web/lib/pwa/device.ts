export type PWADeviceKind = "ios" | "android" | "desktop";

export type PWADeviceState = {
  kind: PWADeviceKind;
  isIOS: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  isIOSSafari: boolean;
  /** iOS Chrome / Firefox / in-app browsers that cannot Add to Home Screen. */
  needsSafari: boolean;
  isChromiumInstallable: boolean;
};

const IOS_TOKEN = /iPad|iPhone|iPod/i;
const ANDROID_TOKEN = /Android/i;
const IOS_IN_APP =
  /FBAN|FBAV|FBIOS|Instagram|Line\/|WhatsApp|Snapchat|Twitter|LinkedInApp|GSA\/|musical_ly|BytedanceWebview|Pinterest/i;
const IOS_ALT_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser|Brave/i;

export function isIOSUserAgent(
  userAgent: string,
  platform?: string,
  maxTouchPoints?: number,
): boolean {
  if (IOS_TOKEN.test(userAgent)) return true;
  // iPadOS 13+ reports as Macintosh.
  if (/Macintosh/i.test(userAgent) && (maxTouchPoints ?? 0) > 1) return true;
  if (platform === "MacIntel" && (maxTouchPoints ?? 0) > 1) return true;
  return false;
}

export function isAndroidUserAgent(userAgent: string): boolean {
  return ANDROID_TOKEN.test(userAgent);
}

export function isIOSSafariUserAgent(userAgent: string): boolean {
  if (!/Safari/i.test(userAgent)) return false;
  if (IOS_ALT_BROWSER.test(userAgent)) return false;
  if (IOS_IN_APP.test(userAgent)) return false;
  return true;
}

export function detectPWADevice(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): PWADeviceState {
  const isIOS = isIOSUserAgent(
    input.userAgent,
    input.platform,
    input.maxTouchPoints,
  );
  const isAndroid = !isIOS && isAndroidUserAgent(input.userAgent);
  const isDesktop = !isIOS && !isAndroid;
  const isIOSSafari = isIOS && isIOSSafariUserAgent(input.userAgent);
  const needsSafari =
    isIOS && (!isIOSSafari || IOS_IN_APP.test(input.userAgent));

  return {
    kind: isIOS ? "ios" : isAndroid ? "android" : "desktop",
    isIOS,
    isAndroid,
    isDesktop,
    isIOSSafari,
    needsSafari,
    isChromiumInstallable: isAndroid,
  };
}

export function detectPWADeviceFromWindow(
  target: Window & { navigator: Navigator } = window,
): PWADeviceState {
  return detectPWADevice({
    userAgent: target.navigator.userAgent,
    platform: target.navigator.platform,
    maxTouchPoints: target.navigator.maxTouchPoints,
  });
}
