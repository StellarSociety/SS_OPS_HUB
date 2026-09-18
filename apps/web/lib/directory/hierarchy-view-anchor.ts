export type HierarchyViewOffset = {
  offsetX: number;
  offsetY: number;
};

function centerX(box: { left: number; width: number }) {
  return box.left + box.width / 2;
}

function centerY(box: { top: number; height: number }) {
  return box.top + box.height / 2;
}

/** How far an element's center sits from the scroller viewport center. */
export function captureElementViewOffset(
  viewport: { left: number; top: number; width: number; height: number },
  element: { left: number; top: number; width: number; height: number },
): HierarchyViewOffset {
  return {
    offsetX: centerX(element) - centerX(viewport),
    offsetY: centerY(element) - centerY(viewport),
  };
}

/** Scroll delta that puts the element back at the captured viewport offset. */
export function scrollDeltaToRestoreOffset(
  viewport: { left: number; top: number; width: number; height: number },
  element: { left: number; top: number; width: number; height: number },
  offset: HierarchyViewOffset,
): { dx: number; dy: number } {
  return {
    dx: centerX(element) - centerX(viewport) - offset.offsetX,
    dy: centerY(element) - centerY(viewport) - offset.offsetY,
  };
}
