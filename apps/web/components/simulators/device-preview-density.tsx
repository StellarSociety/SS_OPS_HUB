"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Real `/m` routes set `--ui-density: 1.22` on `html`, so rem (Tailwind
 * text/spacing) occupies more of the 440px canvas. The simulator lives on a
 * desktop page where rem stays 16px — fonts look undersized vs a Pro Max.
 * Inverse-size + scale makes the preview use the same size-to-screen ratio.
 */
export const MOBILE_PREVIEW_DENSITY = 1.22;
/** Login, venue select, and welcome use app-sized type; keep them close to 1×. */
export const COMPACT_PREVIEW_DENSITY = 1;

export function DevicePreviewDensity({
  children,
  fill = true,
  density = MOBILE_PREVIEW_DENSITY,
}: {
  children: ReactNode;
  fill?: boolean;
  density?: number;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [extra, setExtra] = useState(0);
  const inv = `${100 / density}%`;

  useLayoutEffect(() => {
    if (fill) {
      setExtra(0);
      return;
    }
    const el = innerRef.current;
    if (!el) return;
    const update = () => {
      setExtra(el.offsetHeight * (density - 1));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [density, fill]);

  return (
    <div className="relative h-full min-h-0 w-full">
      <div
        ref={innerRef}
        className="origin-top-left"
        style={{
          width: inv,
          height: fill ? inv : undefined,
          transform: `scale(${density})`,
        }}
      >
        {children}
      </div>
      {fill ? null : (
        <div aria-hidden className="pointer-events-none" style={{ height: extra }} />
      )}
    </div>
  );
}
