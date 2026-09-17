"use client";

import { useEffect, useRef, type RefObject } from "react";

const EDGE_PX = 28;
const ACTIVATE_PX = 10;
const THRESHOLD_PX = 56;
const STATE_KEY = "ssMobileInAppBack";

type BackState = {
  [STATE_KEY]?: number;
};

let nextToken = 1;
let ignoreNextPop = 0;

function historyState(): BackState {
  const state = window.history.state;
  return state && typeof state === "object" ? (state as BackState) : {};
}

/**
 * Makes OS / browser swipe-back (and a left-edge slide) close an in-app
 * window the same way the overlay’s Back control does — instead of leaving
 * the current mobile route.
 */
export function useMobileInAppBack<T extends HTMLElement>(
  onBack: () => void,
  active = true,
): RefObject<T | null> {
  const rootRef = useRef<T | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const token = nextToken++;
    window.history.pushState({ ...historyState(), [STATE_KEY]: token }, "");

    const onPop = () => {
      if (ignoreNextPop > 0) {
        ignoreNextPop -= 1;
        return;
      }
      onBackRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (historyState()[STATE_KEY] === token) {
        ignoreNextPop += 1;
        window.history.back();
      }
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const node = rootRef.current;
    if (!node) return;

    let tracking = false;
    let startX = 0;
    let startY = 0;
    let pointerId: number | null = null;

    function onDown(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const rect = node.getBoundingClientRect();
      if (event.clientX - rect.left > EDGE_PX) return;
      tracking = true;
      startX = event.clientX;
      startY = event.clientY;
      pointerId = event.pointerId;
    }

    function onMove(event: PointerEvent) {
      if (!tracking || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > ACTIVATE_PX) {
        tracking = false;
        return;
      }
      if (dx < -ACTIVATE_PX) {
        tracking = false;
        return;
      }
      if (dx >= THRESHOLD_PX && dx > Math.abs(dy)) {
        tracking = false;
        onBackRef.current();
      }
    }

    function onUp(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      tracking = false;
      pointerId = null;
    }

    node.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      node.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [active]);

  return rootRef;
}
