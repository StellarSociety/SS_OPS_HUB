import { describe, expect, it } from "vitest";
import { pwaAppVersionLabel, pwaPreviousAppReleases } from "@/lib/pwa/constants";
import { detectPWADevice, isIOSSafariUserAgent } from "@/lib/pwa/device";
import {
  deviceForInstallPreview,
  parseInstallPreview,
  parseInstallReinstall,
} from "@/lib/pwa/install-preview";
import {
  manifestPathForSurface,
  pwaInstallSurfaceFromUserAgent,
} from "@/lib/pwa/install-surface";
import { isStandaloneDisplayMode } from "@/lib/pwa/standalone";
import { defaultPwaOpenPath, safePwaReturnPath } from "@/lib/pwa/return-path";
import { buildPwaWebManifest } from "@/lib/pwa/web-manifest";

describe("PWA device detection", () => {
  it("detects iPhone Safari", () => {
    const device = detectPWADevice({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    });
    expect(device.kind).toBe("ios");
    expect(device.isIOSSafari).toBe(true);
    expect(device.needsSafari).toBe(false);
  });

  it("recommends Safari for iOS Chrome and WhatsApp", () => {
    const chrome = detectPWADevice({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1",
    });
    expect(chrome.needsSafari).toBe(true);
    expect(
      isIOSSafariUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.0.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);

    const whatsapp = detectPWADevice({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.0.0",
    });
    expect(whatsapp.isIOS).toBe(true);
    expect(whatsapp.needsSafari).toBe(true);
  });

  it("detects Android and desktop", () => {
    const android = detectPWADevice({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
    });
    expect(android.kind).toBe("android");
    expect(android.isChromiumInstallable).toBe(true);

    const desktop = detectPWADevice({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      maxTouchPoints: 0,
    });
    expect(desktop.kind).toBe("desktop");
  });

  it("treats iPadOS as iOS via touch Mac", () => {
    const device = detectPWADevice({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });
    expect(device.isIOS).toBe(true);
  });
});

describe("standalone detection", () => {
  it("uses display-mode and iOS navigator.standalone", () => {
    expect(
      isStandaloneDisplayMode(
        (query) => ({ matches: query.includes("standalone") }),
        { standalone: false },
      ),
    ).toBe(true);
    expect(
      isStandaloneDisplayMode(
        () => ({ matches: false }),
        { standalone: true },
      ),
    ).toBe(true);
    expect(
      isStandaloneDisplayMode(
        () => ({ matches: false }),
        { standalone: false },
      ),
    ).toBe(false);
  });
});

describe("PWA return path", () => {
  it("allows internal mobile paths only", () => {
    expect(safePwaReturnPath("/m/orilla")).toBe("/m/orilla");
    expect(safePwaReturnPath("/m/orilla/login")).toBe("/m/orilla/login");
    expect(safePwaReturnPath("/m/orilla/welcome")).toBe("/m/orilla/welcome");
    expect(safePwaReturnPath("/dashboard")).toBeNull();
    expect(safePwaReturnPath("https://evil.example/m")).toBeNull();
    expect(safePwaReturnPath("//evil.example")).toBeNull();
    expect(safePwaReturnPath("/install")).toBeNull();
  });

  it("rejects path traversal that would leave /m", () => {
    expect(safePwaReturnPath("/m/../login")).toBeNull();
    expect(safePwaReturnPath("/m/orilla/../../login")).toBeNull();
  });

  it("falls back to /m", () => {
    expect(defaultPwaOpenPath(null)).toBe("/m");
    expect(defaultPwaOpenPath("/m/orilla")).toBe("/m/orilla");
  });
});

describe("PWA install surface", () => {
  it("installs the staff app on phones and the hub on desks", () => {
    expect(
      pwaInstallSurfaceFromUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("mobile");
    expect(
      pwaInstallSurfaceFromUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe("mobile");
    expect(
      pwaInstallSurfaceFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      ),
    ).toBe("desktop");
    expect(
      pwaInstallSurfaceFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ),
    ).toBe("desktop");
    expect(
      pwaInstallSurfaceFromUserAgent(
        "Mozilla/5.0 (Linux; Android 14; SM-X810) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ),
    ).toBe("desktop");
    expect(manifestPathForSurface("desktop")).toBe(
      "/manifest-desktop.webmanifest",
    );
    expect(manifestPathForSurface("mobile")).toBe("/manifest.webmanifest");
  });

  it("points start_url at /m/ for phones and / for desks", () => {
    expect(buildPwaWebManifest("mobile", "SS Ops HUB").start_url).toBe("/m/");
    expect(buildPwaWebManifest("mobile", "SS Ops HUB").scope).toBe("/m/");
    expect(buildPwaWebManifest("desktop", "SS Ops HUB").start_url).toBe("/");
    expect(buildPwaWebManifest("desktop", "SS Ops HUB").scope).toBe("/");
    expect(buildPwaWebManifest("desktop", "SS Ops HUB").orientation).toBeUndefined();
  });
});

describe("mobile app version label", () => {
  it("prefixes V without doubling it", () => {
    expect(pwaAppVersionLabel("11")).toBe("V11");
    expect(pwaAppVersionLabel("V11")).toBe("V11");
    expect(pwaAppVersionLabel("v8")).toBe("V8");
  });

  it("lists older releases after the current build", () => {
    const previous = pwaPreviousAppReleases();
    expect(previous.map((release) => release.version)).toEqual([
      "10",
      "9",
      "8",
      "7",
      "6",
      "5",
    ]);
    expect(previous.every((release) => release.releasedAt && release.notes)).toBe(
      true,
    );
  });
});

describe("install preview override", () => {
  it("parses known preview kinds", () => {
    expect(parseInstallPreview("ios")).toBe("ios");
    expect(parseInstallPreview("ios-chrome")).toBe("ios-chrome");
    expect(parseInstallPreview("reinstall")).toBe("reinstall");
    expect(parseInstallPreview("unknown")).toBeNull();
    expect(parseInstallPreview(undefined)).toBeNull();
  });

  it("treats reinstall=1 as the delete-and-install-again flow", () => {
    expect(parseInstallReinstall("1")).toBe(true);
    expect(parseInstallReinstall("true")).toBe(true);
    expect(parseInstallReinstall("yes")).toBe(true);
    expect(parseInstallReinstall("0")).toBe(false);
    expect(parseInstallReinstall(undefined)).toBe(false);
  });

  it("maps iPhone Safari preview to Add to Home Screen steps", () => {
    const device = deviceForInstallPreview("ios");
    expect(device.isIOS).toBe(true);
    expect(device.isIOSSafari).toBe(true);
    expect(device.needsSafari).toBe(false);
  });
});
