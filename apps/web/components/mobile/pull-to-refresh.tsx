"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { RefreshSpinner } from "@/components/mobile/refresh-spinner";
import { cn } from "@/lib/utils";

const THRESHOLD = 64;
const MAX_PULL = 112;
const REST_OFFSET = 56;
const RESISTANCE = 0.42;
const MIN_REFRESH_MS = 720;
const ACTIVATE_PX = 10;

type PullToRefreshProps = {
  children: ReactNode;
  onRefresh: () => void;
  refreshing?: boolean;
  className?: string;
  contentClassName?: string;
  indicatorInsetTop?: number;
};

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

  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);

  const busy = localBusy || refreshing;
  const progress = Math.min(1, pull / THRESHOLD);
  const armed = progress >= 1;

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

  function beginRefresh() {
    busyStartedAtRef.current = Date.now();
    localBusyRef.current = true;
    setLocalBusy(true);
    setPullBoth(REST_OFFSET);
    onRefresh();
    window.setTimeout(() => {
      localBusyRef.current = false;
      setLocalBusy(false);
    }, MIN_REFRESH_MS);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (busy || event.button !== 0) return;
    const content = contentRef.current;
    if (!content) return;
    const scroller = nearestScroller(event.target, content);
    if (scroller.scrollTop > 1) return;
    trackingRef.current = true;
    pullingRef.current = false;
    startYRef.current = event.clientY;
    startXRef.current = event.clientX;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!trackingRef.current || busy) return;
    const root = rootRef.current;
    if (!root) return;
    const scale = visualScale(root) || 1;
    const dy = (event.clientY - startYRef.current) / scale;
    const dx = (event.clientX - startXRef.current) / scale;

    if (!pullingRef.current) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > ACTIVATE_PX) {
        trackingRef.current = false;
        return;
      }
      if (dy < ACTIVATE_PX) return;
      pullingRef.current = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    if (dy <= 0) {
      setPullBoth(0);
      return;
    }

    event.preventDefault();
    setPullBoth(Math.min(MAX_PULL, dy * RESISTANCE));
  }

  function onPointerUp() {
    trackingRef.current = false;
    if (!dragging && !pullingRef.current) return;
    setDragging(false);
    pullingRef.current = false;
    if (busy) return;
    if (pullRef.current >= THRESHOLD) {
      beginRefresh();
      return;
    }
    setPullBoth(0);
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative h-full min-h-0 overflow-hidden overscroll-none", className)}
      style={{ touchAction: pullingRef.current || dragging ? "none" : "pan-y" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="pointer-events-none absolute z-20"
        style={{
          top: indicatorInsetTop,
          left: "50%",
          opacity: busy ? 1 : Math.min(1, pull / 28),
          transform: `translateX(-50%) scale(${busy || armed ? 1 : 0.55 + progress * 0.45})`,
          transition: dragging ? "none" : "opacity 180ms ease, transform 180ms ease",
        }}
      >
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#3D421F] shadow-[0_4px_16px_rgba(61,66,31,0.18)] backdrop-blur-md",
            armed && !busy && "ss-refresh-armed",
          )}
        >
          <RefreshSpinner
            size={20}
            progress={busy ? 0.32 : Math.max(0.12, progress)}
            spinning={busy}
          />
        </div>
      </div>

      <div
        ref={contentRef}
        className={cn("h-full min-h-0", contentClassName)}
        style={{
          transform: `translateY(${pull}px)`,
          transition: dragging ? "none" : "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
