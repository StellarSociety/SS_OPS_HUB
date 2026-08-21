import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_ICON_URL,
  DEFAULT_APP_NAME,
  DEFAULT_GROUP_FAVICON_URL,
  DEFAULT_GROUP_LOGO_URL,
  resolveAppIconUrl,
  resolveAppName,
  resolveGroupFaviconUrl,
  resolveGroupLogoUrl,
} from "@/lib/group/branding";

describe("group branding URLs", () => {
  it("falls back to built-in defaults", () => {
    expect(resolveGroupLogoUrl(null)).toBe(DEFAULT_GROUP_LOGO_URL);
    expect(resolveGroupLogoUrl("  ")).toBe(DEFAULT_GROUP_LOGO_URL);
    expect(resolveAppIconUrl(undefined)).toBe(DEFAULT_APP_ICON_URL);
    expect(resolveGroupFaviconUrl(null)).toBe(DEFAULT_GROUP_FAVICON_URL);
    expect(DEFAULT_APP_NAME).toBe("SS Ops HUB");
    expect(resolveAppName(null)).toBe(DEFAULT_APP_NAME);
    expect(resolveAppName("  ")).toBe(DEFAULT_APP_NAME);
  });

  it("uses stored overrides", () => {
    expect(resolveGroupLogoUrl("https://cdn.example/logo.webp")).toBe(
      "https://cdn.example/logo.webp",
    );
    expect(resolveAppIconUrl("https://cdn.example/icon.webp")).toBe(
      "https://cdn.example/icon.webp",
    );
    expect(resolveGroupFaviconUrl("https://cdn.example/favicon.webp")).toBe(
      "https://cdn.example/favicon.webp",
    );
    expect(resolveAppName("SS Ops HUB")).toBe("SS Ops HUB");
    expect(resolveAppName("HUB")).toBe("HUB");
  });
});
