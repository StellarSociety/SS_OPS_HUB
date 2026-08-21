"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  tabBarHref,
  tabBarItems,
  type MobileTabBarApp,
  type MobileTabItem,
} from "@/lib/mobile/tab-bars";

const COMPACT_RANGE = 80;
const MIN_SCALE = 0.84;

type MobileTabBarProps = {
  app: MobileTabBarApp;
  activeId: string;
  venueSlug: string;
  /** Device preview: stay on /mobile and switch the in-phone page. */
  onSelectTab?: (tab: MobileTabItem) => void;
};

function findNearbyScroller(host: HTMLElement): HTMLElement | null {
  const parent = host.parentElement;
  if (!parent) return null;
  for (const child of Array.from(parent.children)) {
    if (!(child instanceof HTMLElement) || child === host) continue;
    const overflowY = getComputedStyle(child).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return child;
  }
  return null;
}

export function MobileTabBar({
  app,
  activeId,
  venueSlug,
  onSelectTab,
}: MobileTabBarProps) {
  const items = tabBarItems(app);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef(0);
  const lastTopRef = useRef(0);
  const rafRef = useRef(0);
  const [compact, setCompact] = useState(0);

  useEffect(() => {
    const host = rootRef.current;
    if (!host) return;
    const scroller = findNearbyScroller(host);
    if (!scroller) return;

    const apply = () => {
      rafRef.current = 0;
      const top = scroller.scrollTop;
      const dy = top - lastTopRef.current;
      lastTopRef.current = top;
      if (top <= 0) {
        compactRef.current = 0;
        setCompact(0);
        return;
      }
      const next = Math.min(1, Math.max(0, compactRef.current + dy / COMPACT_RANGE));
      if (Math.abs(next - compactRef.current) < 0.002 && next !== 0 && next !== 1) {
        return;
      }
      compactRef.current = next;
      setCompact(next);
    };

    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(apply);
    };

    lastTopRef.current = scroller.scrollTop;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const scale = 1 - compact * (1 - MIN_SCALE);

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-50 bg-transparent"
    >
      <div className="pointer-events-none relative mx-auto flex w-full max-w-md justify-center bg-transparent px-4 pb-[10px] pt-1">
        <nav
          aria-label="App"
          className="pointer-events-auto relative z-10 w-full bg-transparent"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "50% 100%",
            transition: compact === 0 || compact === 1 ? "transform 180ms ease-out" : undefined,
          }}
        >
          <div
            className="mobile-ig-bar grid gap-0.5 px-1.5 py-1.5"
            style={{
              gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
            }}
          >
            {items.map((tab) => {
              const active = tab.id === activeId;
              const href = tab.pageId ? tabBarHref(venueSlug, tab.path) : null;
              const available = Boolean(href) || active;
              const className = cn(
                "mobile-ig-tab flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1",
                "transition-[transform,background-color,color] duration-200",
                active && "mobile-ig-tab-active",
                pressedId === tab.id && available && "scale-90",
                !available && "opacity-40",
              );
              const inner = (
                <>
                  <tab.icon
                    aria-hidden
                    className="h-5 w-5"
                    strokeWidth={active ? 2.25 : 1.85}
                  />
                  <span className="max-w-full truncate text-[10px] font-semibold leading-none tracking-wide">
                    {tab.label}
                  </span>
                </>
              );
              const press = available
                ? {
                    onPointerDown: () => setPressedId(tab.id),
                    onPointerUp: () => setPressedId(null),
                    onPointerLeave: () => setPressedId(null),
                  }
                : {};

              if (onSelectTab) {
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    aria-label={tab.label}
                    disabled={!available}
                    onClick={() => {
                      if (tab.pageId) onSelectTab(tab);
                    }}
                    className={className}
                    {...press}
                  >
                    {inner}
                  </button>
                );
              }

              if (href && !active) {
                return (
                  <Link
                    key={tab.id}
                    href={href}
                    aria-label={tab.label}
                    className={className}
                    {...press}
                  >
                    {inner}
                  </Link>
                );
              }

              return (
                <span
                  key={tab.id}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  {inner}
                </span>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
