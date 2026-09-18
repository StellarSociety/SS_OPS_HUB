export const HIERARCHY_CANVAS_ZOOM_MIN = 0.5;
export const HIERARCHY_CANVAS_ZOOM_MAX = 2.75;
export const HIERARCHY_CANVAS_ZOOM_DEFAULT = 1;

export function clampHierarchyCanvasZoom(
  zoom: number,
  min = HIERARCHY_CANVAS_ZOOM_MIN,
  max = HIERARCHY_CANVAS_ZOOM_MAX,
) {
  if (!Number.isFinite(zoom)) return HIERARCHY_CANVAS_ZOOM_DEFAULT;
  return Math.min(max, Math.max(min, zoom));
}

export function zoomFromPinch(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
) {
  if (!(startDistance > 0) || !(currentDistance > 0)) {
    return clampHierarchyCanvasZoom(startZoom);
  }
  return clampHierarchyCanvasZoom(startZoom * (currentDistance / startDistance));
}

/** Keep a viewport point stuck to the same content coordinate after zoom. */
export function scrollAfterCanvasZoom(input: {
  prevZoom: number;
  nextZoom: number;
  scrollLeft: number;
  scrollTop: number;
  viewportX: number;
  viewportY: number;
}): { scrollLeft: number; scrollTop: number } {
  const prev = input.prevZoom || 1;
  const next = input.nextZoom || 1;
  return {
    scrollLeft: ((input.scrollLeft + input.viewportX) / prev) * next - input.viewportX,
    scrollTop: ((input.scrollTop + input.viewportY) / prev) * next - input.viewportY,
  };
}

export function pinchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function pinchMidpoint(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
) {
  return {
    clientX: (a.clientX + b.clientX) / 2,
    clientY: (a.clientY + b.clientY) / 2,
  };
}
