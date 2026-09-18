"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  HIERARCHY_CANVAS_ZOOM_DEFAULT,
  pinchDistance,
  pinchMidpoint,
  scrollAfterCanvasZoom,
  zoomFromPinch,
} from "@/lib/directory/hierarchy-canvas-zoom";

type Size = { w: number; h: number };

function layoutScale(el: HTMLElement) {
  return el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1;
}

function viewportPoint(
  scroller: HTMLElement,
  clientX: number,
  clientY: number,
) {
  const rect = scroller.getBoundingClientRect();
  const scale = layoutScale(scroller);
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
  };
}

function applyBoxSize(box: HTMLElement, size: Size, zoom: number) {
  box.style.width = `${Math.max(1, size.w * zoom)}px`;
  box.style.height = `${Math.max(1, size.h * zoom)}px`;
}

export function useHierarchyCanvasZoom({
  scrollerRef,
  boxRef,
  contentRef,
  enabled,
  size,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  boxRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  size: Size;
}) {
  const [zoom, setZoom] = useState(HIERARCHY_CANVAS_ZOOM_DEFAULT);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const pinchRef = useRef<{
    startZoom: number;
    startDist: number;
  } | null>(null);

  const paintZoom = useCallback((next: number) => {
    zoomRef.current = next;
    const content = contentRef.current;
    const box = boxRef.current;
    if (content) content.style.transform = `scale(${next})`;
    if (box && sizeRef.current.w > 0) {
      applyBoxSize(box, sizeRef.current, next);
    }
  }, [boxRef, contentRef]);

  const zoomTo = useCallback(
    (next: number, clientX: number, clientY: number) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const prev = zoomRef.current;
      if (next === prev) return;
      const point = viewportPoint(scroller, clientX, clientY);
      const scroll = scrollAfterCanvasZoom({
        prevZoom: prev,
        nextZoom: next,
        scrollLeft: scroller.scrollLeft,
        scrollTop: scroller.scrollTop,
        viewportX: point.x,
        viewportY: point.y,
      });
      paintZoom(next);
      scroller.scrollLeft = scroll.scrollLeft;
      scroller.scrollTop = scroll.scrollTop;
      setZoom(next);
    },
    [paintZoom, scrollerRef],
  );

  useLayoutEffect(() => {
    paintZoom(zoomRef.current);
  }, [paintZoom, size.w, size.h]);

  useEffect(() => {
    if (!enabled) {
      pinchRef.current = null;
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 2) {
        if (event.touches.length < 2) pinchRef.current = null;
        return;
      }
      pinchRef.current = {
        startZoom: zoomRef.current,
        startDist: pinchDistance(event.touches[0], event.touches[1]),
      };
    }

    function onTouchMove(event: TouchEvent) {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const next = zoomFromPinch(
        pinch.startZoom,
        pinch.startDist,
        pinchDistance(event.touches[0], event.touches[1]),
      );
      const mid = pinchMidpoint(event.touches[0], event.touches[1]);
      zoomTo(next, mid.clientX, mid.clientY);
    }

    function onTouchEnd(event: TouchEvent) {
      if (event.touches.length >= 2) return;
      pinchRef.current = null;
    }

    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      let dy = event.deltaY;
      if (event.deltaMode === 1) dy *= 16;
      else if (event.deltaMode === 2) dy *= 40;
      const factor = Math.exp(-dy * 0.01);
      zoomTo(zoomFromPinch(zoomRef.current, 1, factor), event.clientX, event.clientY);
    }

    scroller.addEventListener("touchstart", onTouchStart, { capture: true });
    scroller.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: false,
    });
    scroller.addEventListener("touchend", onTouchEnd, { capture: true });
    scroller.addEventListener("touchcancel", onTouchEnd, { capture: true });
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      scroller.removeEventListener("touchstart", onTouchStart, true);
      scroller.removeEventListener("touchmove", onTouchMove, true);
      scroller.removeEventListener("touchend", onTouchEnd, true);
      scroller.removeEventListener("touchcancel", onTouchEnd, true);
      scroller.removeEventListener("wheel", onWheel);
    };
  }, [enabled, scrollerRef, zoomTo]);

  const sized = size.w > 0 && size.h > 0;
  const boxStyle: CSSProperties | undefined = sized
    ? {
        width: size.w * zoom,
        height: size.h * zoom,
        position: "relative",
      }
    : undefined;
  const contentStyle: CSSProperties = {
    transform: `scale(${zoom})`,
    transformOrigin: "top left",
    ...(sized ? { position: "absolute", left: 0, top: 0 } : {}),
  };

  return { zoom, boxStyle, contentStyle };
}
