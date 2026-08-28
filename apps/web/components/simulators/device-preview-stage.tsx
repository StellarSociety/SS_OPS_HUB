"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";

const PATH_MIN = 18 * 16;
const GAP = 24;

/** CSS scale makes browsers scroll to the unscaled field box — keep the preview still. */
function keepPreviewScrollStill(event: FocusEvent<HTMLDivElement>) {
  const ancestors: HTMLElement[] = [];
  let node: HTMLElement | null = event.currentTarget.parentElement;
  while (node) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowX) || /(auto|scroll)/.test(overflowY)) {
      ancestors.push(node);
    }
    node = node.parentElement;
  }
  const saved = ancestors.map((el) => ({
    el,
    top: el.scrollTop,
    left: el.scrollLeft,
  }));
  const winX = window.scrollX;
  const winY = window.scrollY;
  requestAnimationFrame(() => {
    for (const item of saved) {
      item.el.scrollTop = item.top;
      item.el.scrollLeft = item.left;
    }
    window.scrollTo(winX, winY);
  });
}

/** Phone/tablet on the left, path panel full-width on the right. */
export function DevicePreviewStage({
  frameWidth,
  frameHeight,
  panel,
  children,
}: {
  frameWidth: number;
  frameHeight: number;
  panel: ReactNode;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const availableWidth = stage.clientWidth;
      const availableHeight = stage.clientHeight;
      if (availableWidth <= 0 || availableHeight <= 0) return;
      const next = Math.min(
        1,
        availableHeight / frameHeight,
        Math.max(0.2, (availableWidth - PATH_MIN - GAP) / frameWidth),
      );
      setScale((prev) => (Math.abs(prev - next) < 0.004 ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [frameWidth, frameHeight]);

  return (
    <div
      ref={stageRef}
      className="flex min-h-0 flex-1 items-stretch gap-6 overflow-hidden"
    >
      <div
        className="relative shrink-0 self-start overflow-hidden"
        style={{
          width: frameWidth * scale,
          height: frameHeight * scale,
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: frameWidth,
            height: frameHeight,
            transform: `scale(${scale})`,
          }}
          onFocusCapture={keepPreviewScrollStill}
        >
          {children}
        </div>
      </div>
      {panel}
    </div>
  );
}
