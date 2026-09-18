import { describe, expect, it } from "vitest";
import {
  clampHierarchyCanvasZoom,
  pinchDistance,
  pinchMidpoint,
  scrollAfterCanvasZoom,
  zoomFromPinch,
} from "@/lib/directory/hierarchy-canvas-zoom";

describe("hierarchy canvas zoom", () => {
  it("clamps pinch zoom to the allowed range", () => {
    expect(clampHierarchyCanvasZoom(0.1)).toBe(0.5);
    expect(clampHierarchyCanvasZoom(4)).toBe(2.75);
    expect(clampHierarchyCanvasZoom(1.25)).toBe(1.25);
  });

  it("scales zoom by the pinch distance ratio", () => {
    expect(zoomFromPinch(1, 100, 200)).toBe(2);
    expect(zoomFromPinch(1, 100, 50)).toBe(0.5);
    expect(zoomFromPinch(1, 100, 400)).toBe(2.75);
  });

  it("keeps the pinched point in place after zoom", () => {
    expect(
      scrollAfterCanvasZoom({
        prevZoom: 1,
        nextZoom: 2,
        scrollLeft: 40,
        scrollTop: 10,
        viewportX: 60,
        viewportY: 90,
      }),
    ).toEqual({ scrollLeft: 140, scrollTop: 110 });
  });

  it("measures the pinch span and midpoint", () => {
    expect(pinchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(
      5,
    );
    expect(
      pinchMidpoint({ clientX: 10, clientY: 20 }, { clientX: 30, clientY: 40 }),
    ).toEqual({ clientX: 20, clientY: 30 });
  });
});
