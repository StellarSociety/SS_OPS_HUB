import { describe, expect, it } from "vitest";
import { mobileAppFrameHeight } from "@/lib/mobile/frame-height";

describe("mobile app frame height", () => {
  it("does not shrink to a short visual viewport", () => {
    expect(
      mobileAppFrameHeight({
        innerHeight: 874,
        clientHeight: 874,
        visualViewportHeight: 840,
        visualViewportOffsetTop: 0,
      }),
    ).toBe(874);
  });

  it("grows a standalone PWA to the hardware screen when the viewport is short", () => {
    expect(
      mobileAppFrameHeight({
        innerHeight: 840,
        clientHeight: 840,
        visualViewportHeight: 840,
        screenHeight: 874,
        standalone: true,
      }),
    ).toBe(874);
  });

  it("does not use a wildly larger screen height (desktop / Android DPR traps)", () => {
    expect(
      mobileAppFrameHeight({
        innerHeight: 800,
        clientHeight: 800,
        screenHeight: 2400,
        standalone: true,
      }),
    ).toBe(800);
  });

  it("includes visualViewport.offsetTop so a scrolled visual viewport still fills", () => {
    expect(
      mobileAppFrameHeight({
        innerHeight: 800,
        clientHeight: 800,
        visualViewportHeight: 700,
        visualViewportOffsetTop: 120,
      }),
    ).toBe(820);
  });
});
