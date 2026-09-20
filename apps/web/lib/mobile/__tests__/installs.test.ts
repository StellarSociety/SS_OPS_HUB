import { describe, expect, it } from "vitest";
import { venueSlugFromMobilePathname } from "@/lib/mobile/app-path";
import {
  compareMobileUsersAccessRows,
  isCurrentMobileAppVersion,
  isMobileInstallUuid,
  mergeInstallSignals,
  mobileInstallDeviceSummary,
  mobileInstallPlatformLabel,
  mobileReinstallPushCopy,
  hasMobilePushDevice,
  primaryInstallDevice,
  statusForDevices,
  type MobileInstallDevice,
  type MobileUsersAccessRow,
} from "@/lib/mobile/installs";

function device(
  overrides: Partial<MobileInstallDevice> = {},
): MobileInstallDevice {
  return {
    deviceId: "11111111-1111-4111-8111-111111111111",
    platform: "ios",
    standalone: true,
    installed: true,
    appVersion: "11",
    swCache: "ss-ops-hub-pwa-v11",
    userAgent: null,
    venueId: "venue-1",
    venueName: "Orilla",
    firstSeenAt: "2026-09-20T10:00:00.000Z",
    lastSeenAt: "2026-09-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("venueSlugFromMobilePathname", () => {
  it("reads the venue from staff-app paths", () => {
    expect(venueSlugFromMobilePathname("/m/orilla/welcome")).toBe("orilla");
    expect(venueSlugFromMobilePathname("/m/orilla")).toBe("orilla");
  });

  it("ignores login and the venue picker", () => {
    expect(venueSlugFromMobilePathname("/m/login")).toBeNull();
    expect(venueSlugFromMobilePathname("/m/select-venue")).toBeNull();
    expect(venueSlugFromMobilePathname("/m")).toBeNull();
    expect(venueSlugFromMobilePathname("/mobile/users-access")).toBeNull();
  });
});

describe("mobile install status", () => {
  it("treats no devices as never opened", () => {
    expect(statusForDevices([])).toBe("never_opened");
  });

  it("marks Home Screen opens on the current version", () => {
    expect(statusForDevices([device()], "11")).toBe("installed_current");
  });

  it("marks an older Home Screen version as outdated", () => {
    expect(statusForDevices([device({ appVersion: "8" })], "11")).toBe(
      "installed_outdated",
    );
  });

  it("keeps browser-only pings separate from installs", () => {
    expect(
      statusForDevices([
        device({ standalone: false, installed: false, appVersion: "11" }),
      ]),
    ).toBe("browser_only");
  });

  it("prefers the latest installed device over a later browser ping", () => {
    const primary = primaryInstallDevice([
      device({
        deviceId: "browser",
        installed: false,
        standalone: false,
        lastSeenAt: "2026-09-20T14:00:00.000Z",
        platform: "desktop",
      }),
      device({
        deviceId: "phone",
        installed: true,
        lastSeenAt: "2026-09-20T11:00:00.000Z",
        platform: "ios",
        appVersion: "11",
      }),
    ]);
    expect(primary?.deviceId).toBe("phone");
  });

  it("sorts outdated and never-opened ahead of current installs", () => {
    const rows = [
      { name: "Zed", status: "installed_current" },
      { name: "Ann", status: "never_opened" },
      { name: "Bo", status: "installed_outdated" },
    ] as MobileUsersAccessRow[];
    const sorted = [...rows].sort(compareMobileUsersAccessRows);
    expect(sorted.map((row) => row.name)).toEqual(["Bo", "Ann", "Zed"]);
  });

  it("treats unknown-version Home Screen devices as outdated", () => {
    expect(
      statusForDevices([device({ appVersion: null, installed: true })], "11"),
    ).toBe("installed_outdated");
  });

  it("merges iPhone push with a later desktop browser ping", () => {
    const merged = mergeInstallSignals({
      heartbeats: [
        device({
          deviceId: "desk",
          platform: "desktop",
          installed: false,
          standalone: false,
          lastSeenAt: "2026-09-20T14:00:00.000Z",
        }),
      ],
      pushDevices: [
        {
          platform: "ios",
          lastSeenAt: "2026-09-19T00:00:00.000Z",
          createdAt: "2026-09-18T00:00:00.000Z",
          userAgent: "iPhone",
        },
      ],
      lastMobileOpenAt: "2026-09-18T12:00:00.000Z",
    });
    expect(statusForDevices(merged, "11")).toBe("installed_outdated");
    expect(primaryInstallDevice(merged)?.platform).toBe("ios");
    expect(mobileInstallDeviceSummary(merged)).toBe("iPhone · Desktop");
  });

  it("uses a prior mobile open when there is no heartbeat or push", () => {
    const merged = mergeInstallSignals({
      heartbeats: [],
      pushDevices: [],
      lastMobileOpenAt: "2026-09-08T09:49:45.000Z",
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.platform).toBe("phone");
    expect(statusForDevices(merged, "11")).toBe("installed_outdated");
  });

  it("validates device ids and current version", () => {
    expect(isMobileInstallUuid("11111111-1111-4111-8111-111111111111")).toBe(
      true,
    );
    expect(isMobileInstallUuid("not-a-uuid")).toBe(false);
    expect(isCurrentMobileAppVersion("11", "11")).toBe(true);
    expect(isCurrentMobileAppVersion("8", "11")).toBe(false);
    expect(mobileInstallPlatformLabel("ios")).toBe("iPhone");
  });

  it("builds a short reinstall push and detects phone push devices", () => {
    const copy = mobileReinstallPushCopy("SS Ops HUB");
    expect(copy.title).toBe("Update SS Ops HUB");
    expect(copy.body.toLowerCase()).toContain("delete");
    expect(copy.body.toLowerCase()).toContain("home screen");
    expect(
      hasMobilePushDevice([
        {
          platform: "desktop",
          lastSeenAt: "2026-09-20T00:00:00.000Z",
          createdAt: "2026-09-20T00:00:00.000Z",
          userAgent: null,
        },
      ]),
    ).toBe(false);
    expect(
      hasMobilePushDevice([
        {
          platform: "ios",
          lastSeenAt: "2026-09-20T00:00:00.000Z",
          createdAt: "2026-09-20T00:00:00.000Z",
          userAgent: null,
        },
      ]),
    ).toBe(true);
  });
});
