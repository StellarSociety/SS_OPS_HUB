import { describe, expect, it } from "vitest";
import {
  captureElementViewOffset,
  scrollDeltaToRestoreOffset,
} from "@/lib/directory/hierarchy-view-anchor";

const viewport = { left: 0, top: 0, width: 400, height: 800 };

describe("hierarchy view anchor", () => {
  it("captures the offset of a card from the viewport center", () => {
    expect(
      captureElementViewOffset(viewport, {
        left: 150,
        top: 360,
        width: 100,
        height: 80,
      }),
    ).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it("does not move scroll when the card stayed put", () => {
    const card = { left: 120, top: 200, width: 80, height: 80 };
    const offset = captureElementViewOffset(viewport, card);
    expect(scrollDeltaToRestoreOffset(viewport, card, offset)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it("scrolls by the amount the card drifted after expand/collapse", () => {
    const before = { left: 120, top: 200, width: 80, height: 80 };
    const offset = captureElementViewOffset(viewport, before);
    const after = { left: 180, top: 140, width: 80, height: 80 };
    expect(scrollDeltaToRestoreOffset(viewport, after, offset)).toEqual({
      dx: 60,
      dy: -60,
    });
  });

  it("converts a scaled canvas delta into layout scroll pixels", () => {
    const before = { left: 0, top: 0, width: 122, height: 122 };
    const viewportBox = { left: 0, top: 0, width: 400, height: 800 };
    const offset = captureElementViewOffset(viewportBox, before);
    const after = { left: 12.2, top: 0, width: 122, height: 122 };
    const screen = scrollDeltaToRestoreOffset(viewportBox, after, offset);
    expect(screen.dx).toBeCloseTo(12.2);
    expect(screen.dx / 1.22).toBeCloseTo(10);
  });
});
