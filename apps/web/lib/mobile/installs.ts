import { PWA_APP_VERSION } from "@/lib/pwa/constants";

export type MobileInstallPlatform = "ios" | "android" | "desktop" | "phone";

export type ReportedInstallPlatform = "ios" | "android" | "desktop";

export type MobileInstallStatus =
  | "never_opened"
  | "browser_only"
  | "installed_current"
  | "installed_outdated";

export type MobileInstallDevice = {
  deviceId: string;
  platform: MobileInstallPlatform;
  standalone: boolean;
  installed: boolean;
  appVersion: string | null;
  swCache: string | null;
  userAgent: string | null;
  venueId: string | null;
  venueName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type MobileUsersAccessRow = {
  userId: string;
  name: string;
  email: string;
  empNo: string | null;
  staffId: string | null;
  photoUrl: string | null;
  accountStatus: "active" | "disabled";
  invitePending: boolean;
  status: MobileInstallStatus;
  appVersion: string | null;
  platform: MobileInstallPlatform | null;
  lastSeenAt: string | null;
  deviceCount: number;
  devices: MobileInstallDevice[];
  canPush: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMobileInstallUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function isMobileInstallPlatform(
  value: string,
): value is ReportedInstallPlatform {
  return value === "ios" || value === "android" || value === "desktop";
}

export function mobileInstallPlatformLabel(
  platform: MobileInstallPlatform | null,
): string {
  if (platform === "ios") return "iPhone";
  if (platform === "android") return "Android";
  if (platform === "desktop") return "Desktop";
  if (platform === "phone") return "Phone";
  return "—";
}

export function mobileInstallStatusLabel(status: MobileInstallStatus): string {
  switch (status) {
    case "installed_current":
      return "Installed";
    case "installed_outdated":
      return "Outdated";
    case "browser_only":
      return "Browser only";
    case "never_opened":
      return "Not opened";
  }
}

export function isCurrentMobileAppVersion(
  version: string | null | undefined,
  currentVersion: string = PWA_APP_VERSION,
): boolean {
  return Boolean(version) && version === currentVersion;
}

export function statusForDevices(
  devices: MobileInstallDevice[],
  currentVersion: string = PWA_APP_VERSION,
): MobileInstallStatus {
  if (devices.length === 0) return "never_opened";
  const installed = devices.filter((d) => d.installed);
  if (installed.length > 0) {
    const current = installed.some((d) =>
      isCurrentMobileAppVersion(d.appVersion, currentVersion),
    );
    return current ? "installed_current" : "installed_outdated";
  }
  return "browser_only";
}

/** Prefer the latest Home Screen install; otherwise the most recently seen device. */
export function primaryInstallDevice(
  devices: MobileInstallDevice[],
): MobileInstallDevice | null {
  if (devices.length === 0) return null;
  const sorted = [...devices].sort(
    (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
  );
  return sorted.find((d) => d.installed) ?? sorted[0] ?? null;
}

export function mobileInstallDeviceSummary(
  devices: MobileInstallDevice[],
): string {
  const labels: string[] = [];
  const seen = new Set<string>();
  const ordered = [...devices].sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
  });
  for (const device of ordered) {
    const label = mobileInstallPlatformLabel(device.platform);
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels.join(" · ");
}

export type PushInstallSignal = {
  platform: ReportedInstallPlatform;
  lastSeenAt: string;
  createdAt: string;
  userAgent: string | null;
};

/**
 * Combine live heartbeats with older proof of install: iOS/Android push
 * subscriptions, then a prior `/m/` venue open if nothing else exists.
 */
export function mergeInstallSignals(input: {
  heartbeats: MobileInstallDevice[];
  pushDevices: PushInstallSignal[];
  lastMobileOpenAt: string | null;
}): MobileInstallDevice[] {
  const devices = [...input.heartbeats];

  const latestPush = new Map<"ios" | "android", PushInstallSignal>();
  for (const push of input.pushDevices) {
    if (push.platform !== "ios" && push.platform !== "android") continue;
    const prev = latestPush.get(push.platform);
    if (!prev || Date.parse(push.lastSeenAt) > Date.parse(prev.lastSeenAt)) {
      latestPush.set(push.platform, push);
    }
  }

  for (const [platform, push] of latestPush) {
    if (devices.some((d) => d.installed && d.platform === platform)) continue;
    devices.push({
      deviceId: `push:${platform}`,
      platform,
      standalone: true,
      installed: true,
      appVersion: null,
      swCache: null,
      userAgent: push.userAgent,
      venueId: null,
      venueName: null,
      firstSeenAt: push.createdAt,
      lastSeenAt: push.lastSeenAt,
    });
  }

  if (devices.length === 0 && input.lastMobileOpenAt) {
    devices.push({
      deviceId: "mobile-open",
      platform: "phone",
      standalone: true,
      installed: true,
      appVersion: null,
      swCache: null,
      userAgent: null,
      venueId: null,
      venueName: null,
      firstSeenAt: input.lastMobileOpenAt,
      lastSeenAt: input.lastMobileOpenAt,
    });
  }

  return devices;
}

export function compareMobileUsersAccessRows(
  a: MobileUsersAccessRow,
  b: MobileUsersAccessRow,
): number {
  const rank: Record<MobileInstallStatus, number> = {
    installed_outdated: 0,
    never_opened: 1,
    browser_only: 2,
    installed_current: 3,
  };
  if (rank[a.status] !== rank[b.status]) {
    return rank[a.status] - rank[b.status];
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function hasMobilePushDevice(pushDevices: PushInstallSignal[]): boolean {
  return pushDevices.some(
    (device) => device.platform === "ios" || device.platform === "android",
  );
}

export function mobileReinstallPushCopy(appName: string): {
  title: string;
  body: string;
  inboxBody: string;
} {
  const name = appName.trim() || "SS Ops HUB";
  return {
    title: `Update ${name}`,
    body: "Delete the Home Screen icon, then tap this alert and Add to Home Screen again.",
    inboxBody: `Your ${name} app is out of date. Touch and hold the Home Screen icon and delete it. Then tap this notice, open the install page, and Add to Home Screen again.`,
  };
}
