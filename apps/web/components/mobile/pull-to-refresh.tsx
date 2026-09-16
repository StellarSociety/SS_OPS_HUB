"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { RefreshSpinner } from "@/components/mobile/refresh-spinner";
import { cn } from "@/lib/utils";

const THRESHOLD = 72;
const MAX_PULL = 128;
const REST_OFFSET = 64;
const MIN_REFRESH_MS = 900;
const ACTIVATE_PX = 8;
const AT_TOP_PX = 8;

type PullToRefreshProps = {
  children: ReactNode;
  onRefresh: () => void;
  refreshing?: boolean;
  className?: string;
  contentClassName?: string;
  indicatorInsetTop?: number | string;
};

function resistedPull(dy: number) {
  if (dy <= 0) return 0;
  return MAX_PULL * (1 - Math.exp(-dy / 160));
}

function visualScale(el: HTMLElement) {
  const height = el.getBoundingClientRect().height;
  return height > 0 ? height / el.offsetHeight : 1;
}

function nearestScroller(start: EventTarget | null, root: HTMLElement): HTMLElement {
  let node = start instanceof HTMLElement ? start : null;
  while (node && node !== root) {
    const style = getComputedStyle(node);
    const scrollableY =
      /(auto|scroll)/.test(style.overflowY) || /(auto|scroll)/.test(style.overflow);
    if (scrollableY && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return root;
}

function isAtTop(scroller: HTMLElement) {
  return scroller.scrollTop <= AT_TOP_PX;
}

function touchPoint(event: TouchEvent) {
  const touch = event.touches[0] ?? event.changedTouches[0];
  if (!touch) return null;
  return { x: touch.clientX, y: touch.clientY, id: touch.identifier };
}

export function PullToRefresh({
  children,
  onRefresh,
  refreshing = false,
  className,
  contentClassName,
  indicatorInsetTop = 18,
}: PullToRefreshProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const trackingRef = useRef(false);
  const pullingRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const pullRef = useRef(0);
  const localBusyRef = useRef(false);
  const busyStartedAtRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const busyRef = useRef(false);

  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);

  const busy = localBusy || refreshing;
  busyRef.current = busy;
  onRefreshRef.current = onRefresh;

  const progress = Math.min(1, pull / THRESHOLD);
  const armed = progress >= 1;
  const reveal = busy ? REST_OFFSET : pull;

  const setPullBoth = useCallback((next: number) => {
    pullRef.current = next;
    setPull(next);
  }, []);

  const finishIfIdle = useCallback(() => {
    if (refreshing || localBusyRef.current) return;
    const elapsed = Date.now() - busyStartedAtRef.current;
    const wait = Math.max(0, MIN_REFRESH_MS - elapsed);
    window.setTimeout(() => {
      if (refreshing || localBusyRef.current) return;
      setLocalBusy(false);
      localBusyRef.current = false;
      setPullBoth(0);
    }, wait);
  }, [refreshing, setPullBoth]);

  useEffect(() => {
    if (!busy) finishIfIdle();
  }, [busy, finishIfIdle]);

  const beginRefresh = useCallback(() => {
    busyStartedAtRef.current = Date.now();
    localBusyRef.current = true;
    setLocalBusy(true);
    setPullBoth(REST_OFFSET);
    onRefreshRef.current();
    window.setTimeout(() => {
      localBusyRef.current = false;
      setLocalBusy(false);
    }, MIN_REFRESH_MS);
  }, [setPullBoth]);

  useEffect(() => {
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return;

    function releaseCapture() {
      const id = pointerIdRef.current;
      pointerIdRef.current = null;
      if (id == null) return;
      if (root.hasPointerCapture(id)) {
        root.releasePointerCapture(id);
      }
    }

    function beginTrack(target: EventTarget | null, x: number, y: number) {
      if (busyRef.current) return false;
      const scroller = nearestScroller(target, content);
      if (!isAtTop(scroller)) return false;
      trackingRef.current = true;
      pullingRef.current = false;
      startYRef.current = y;
      startXRef.current = x;
      return true;
    }

    function moveTrack(
      x: number,
      y: number,
      event: { preventDefault(): void },
      capturePointer?: number,
    ) {
      if (!trackingRef.current || busyRef.current) return;
      const scale = visualScale(root) || 1;
      const dy = (y - startYRef.current) / scale;
      const dx = (x - startXRef.current) / scale;

      if (!pullingRef.current) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > ACTIVATE_PX) {
          trackingRef.current = false;
          return;
        }
        if (dy < -ACTIVATE_PX) {
          trackingRef.current = false;
          return;
        }
        if (dy <= 0) return;
        // Win the gesture from iOS before native overscroll starts.
        event.preventDefault();
        if (dy < ACTIVATE_PX) return;
        pullingRef.current = true;
        setDragging(true);
        if (capturePointer != null) {
          try {
            root.setPointerCapture(capturePointer);
            pointerIdRef.current = capturePointer;
          } catch {
            /* capture can fail on a disappearing target */
          }
        }
      }

      event.preventDefault();
      if (dy <= 0) {
        setPullBoth(0);
        return;
      }
      setPullBoth(resistedPull(dy));
    }

    function endTrack() {
      const wasPulling = pullingRef.current;
      trackingRef.current = false;
      pullingRef.current = false;
      releaseCapture();
      setDragging(false);
      if (!wasPulling || busyRef.current) return;
      if (pullRef.current >= THRESHOLD) {
        beginRefresh();
        return;
      }
      setPullBoth(0);
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      if (event.button !== 0) return;
      if (!beginTrack(event.target, event.clientX, event.clientY)) return;
      pointerIdRef.current = event.pointerId;
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      if (
        pointerIdRef.current != null &&
        event.pointerId !== pointerIdRef.current
      ) {
        return;
      }
      moveTrack(event.clientX, event.clientY, event, event.pointerId);
    }

    function onPointerUp(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      if (
        pointerIdRef.current != null &&
        event.pointerId !== pointerIdRef.current
      ) {
        return;
      }
      endTrack();
    }

    function onTouchStart(event: TouchEvent) {
      const point = touchPoint(event);
      if (!point) return;
      beginTrack(event.target, point.x, point.y);
    }

    function onTouchMove(event: TouchEvent) {
      const point = touchPoint(event);
      if (!point) return;
      moveTrack(point.x, point.y, event);
    }

    function onTouchEnd(event: TouchEvent) {
      if (event.touches.length > 0) return;
      endTrack();
    }

    const touchMoveOpts: AddEventListenerOptions = {
      passive: false,
      capture: true,
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove, { passive: false });
    root.addEventListener("pointerup", onPointerUp);
    root.addEventListener("pointercancel", onPointerUp);
    root.addEventListener("touchstart", onTouchStart, { capture: true });
    root.addEventListener("touchmove", onTouchMove, touchMoveOpts);
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchEnd);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointercancel", onPointerUp);
      root.removeEventListener("touchstart", onTouchStart, true);
      root.removeEventListener("touchmove", onTouchMove, true);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [beginRefresh, setPullBoth]);

  return (
    <div
      ref={rootRef}
      data-pull-to-refresh=""
      aria-busy={busy}
      className={cn(
        "relative h-full min-h-0 overflow-hidden overscroll-none select-none",
        className,
      )}
      style={
        {
          touchAction: "manipulation",
          WebkitUserSelect: "none",
          userSelect: "none",
        } as CSSProperties
      }
    >
      <div
        className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
        style={{
          top: indicatorInsetTop,
          opacity: busy ? 1 : Math.min(1, reveal / 22),
          transform: `translateY(${busy ? 0 : Math.max(0, reveal * 0.12)}px) scale(${
            busy || armed ? 1 : 0.46 + progress * 0.54
          })`,
          transition: dragging
            ? "none"
            : "opacity 220ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          className={cn(
            "ss-ptr-disc flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-[#3D421F] shadow-[0_4px_16px_rgba(61,66,31,0.18)] backdrop-blur-md",
            armed && !busy && "ss-ptr-pop",
            busy && "ss-ptr-busy",
          )}
        >
          <RefreshSpinner
            size={22}
            progress={busy ? 0.32 : Math.max(0.1, progress)}
            spinning={busy}
          />
        </div>
      </div>

      <div
        ref={contentRef}
        className={cn("h-full min-h-0 overscroll-none", contentClassName)}
        style={{
          transform: `translate3d(0, ${reveal}px, 0)`,
          transition: dragging
            ? "none"
            : "transform 520ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: dragging || busy ? "transform" : undefined,
          overscrollBehaviorY: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
