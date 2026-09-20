import { describe, expect, it } from "vitest";
import { notificationCanonicalHref, notificationClickPath } from "@/lib/notifications/href";
import { urlBase64ToUint8Array } from "@/lib/push/application-server-key";
import { inspectWebPushSupport, webPushIsAvailable } from "@/lib/push/platform";
import { resolveWebPushPublicKey } from "@/lib/push/resolve-public-key";

describe("web push availability", () => {
  it("requires iOS to be installed on the Home Screen", () => {
    const base = {
      hasServiceWorker: true,
      hasPushManager: true,
      hasNotification: true,
      publicKey: "test-key",
    };
    expect(
      webPushIsAvailable({ ...base, isIOS: true, standalone: false }),
    ).toBe(false);
    expect(
      webPushIsAvailable({ ...base, isIOS: true, standalone: true }),
    ).toBe(true);
    expect(
      webPushIsAvailable({ ...base, isIOS: false, standalone: false }),
    ).toBe(true);
  });

  it("prefers the runtime server key over an empty inlined NEXT_PUBLIC key", () => {
    expect(
      resolveWebPushPublicKey({
        WEB_PUSH_PUBLIC_KEY: " runtime-key ",
        NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: "",
      }),
    ).toBe("runtime-key");
    expect(
      resolveWebPushPublicKey({
        NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY: " build-key ",
      }),
    ).toBe("build-key");
    expect(resolveWebPushPublicKey({})).toBe("");
  });

  it("is off without a VAPID public key or PushManager", () => {
    expect(
      webPushIsAvailable({
        hasServiceWorker: true,
        hasPushManager: true,
        hasNotification: true,
        isIOS: false,
        standalone: true,
        publicKey: "",
      }),
    ).toBe(false);
    expect(
      webPushIsAvailable({
        hasServiceWorker: true,
        hasPushManager: false,
        hasNotification: true,
        isIOS: false,
        standalone: true,
        publicKey: "test-key",
      }),
    ).toBe(false);
  });

  it("explains missing keys instead of blaming the browser", () => {
    expect(
      inspectWebPushSupport({
        publicKey: "",
        isSecureContext: true,
        hasServiceWorker: true,
        hasPushManager: true,
        hasNotification: true,
        isIOS: true,
        needsSafari: false,
        standalone: true,
      }),
    ).toBe("missing-key");
    expect(
      inspectWebPushSupport({
        publicKey: "test-key",
        isSecureContext: true,
        hasServiceWorker: true,
        hasPushManager: false,
        hasNotification: false,
        isIOS: true,
        needsSafari: false,
        standalone: false,
      }),
    ).toBe("ios-not-standalone");
    expect(
      inspectWebPushSupport({
        publicKey: "test-key",
        isSecureContext: false,
        hasServiceWorker: false,
        hasPushManager: false,
        hasNotification: false,
        isIOS: false,
        needsSafari: false,
        standalone: true,
      }),
    ).toBe("insecure");
  });
});

describe("notification click paths", () => {
  it("keeps phone taps inside the /m PWA scope", () => {
    expect(
      notificationClickPath({
        module_key: "hr",
        entity: "staff",
        entity_id: "abc",
        venueSlug: "orilla",
        isGlobalVenue: false,
        platform: "ios",
      }),
    ).toBe("/m/orilla/notifications");
    expect(
      notificationClickPath({
        module_key: "hr",
        entity: "payroll_run",
        entity_id: "run-1",
        venueSlug: "orilla",
        isGlobalVenue: false,
        platform: "android",
      }),
    ).toBe("/m/orilla/notifications");
  });

  it("opens the hub path on desktop", () => {
    expect(notificationCanonicalHref({
      module_key: "hr",
      entity: "payroll_run",
      entity_id: "run-1",
    })).toBe("/hr/payroll/run-1");
    expect(
      notificationClickPath({
        module_key: "hr",
        entity: "payroll_run",
        entity_id: "run-1",
        venueSlug: "orilla",
        isGlobalVenue: false,
        platform: "desktop",
      }),
    ).toBe("/venue/orilla/hr/payroll/run-1");
    expect(
      notificationCanonicalHref({
        module_key: "hr",
        entity: "hiring_form",
        entity_id: "form-1",
      }),
    ).toBe("/hr/hiring/replies/form-1");
    expect(
      notificationClickPath({
        module_key: "hr",
        entity: "hiring_form",
        entity_id: "form-1",
        venueSlug: "orilla",
        isGlobalVenue: false,
        platform: "desktop",
      }),
    ).toBe("/venue/orilla/hr/hiring/replies/form-1");
    expect(
      notificationCanonicalHref({
        module_key: "mobile_app",
        entity: "mobile_app",
        entity_id: "venue-1",
      }),
    ).toBe("/install?reinstall=1");
    expect(
      notificationClickPath({
        module_key: "mobile_app",
        entity: "mobile_app",
        entity_id: "venue-1",
        venueSlug: "orilla",
        isGlobalVenue: false,
        platform: "ios",
      }),
    ).toBe("/install?reinstall=1");
  });
});

describe("VAPID application server key", () => {
  it("decodes url-safe base64 without throwing", () => {
    const bytes = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });
});
