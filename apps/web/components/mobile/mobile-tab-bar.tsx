"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  animate,
  motion,
  MotionConfig,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "framer-motion";
import { cn } from "@/lib/utils";
import {
  tabBarHref,
  tabBarItems,
  tabBarShowsLabels,
  type MobileTabBarApp,
  type MobileTabItem,
} from "@/lib/mobile/tab-bars";
import { useMobileNavBusy } from "@/components/mobile/mobile-nav-busy";
import { useMobileChromeHost } from "@/components/mobile/mobile-chrome-host";

/*
 * Motion follows the apple-motion skill (WWDC 2018 "Designing Fluid Interfaces"):
 * - Scroll-to-minimise tracks the scroll 1:1, then settles by the direction of
 *   travel with a critically damped spring that inherits the current velocity.
 * - Scrolling again grabs the bar mid-settle and continues from its live value.
 * - Press feedback lands on pointer-down; no bounce, a tap carries no momentum.
 * - The selection pill moves on tap, before the next page has loaded.
 */

/** Scroll distance (px) that takes the bar from full size to minimised. */
const COMPACT_RANGE = 80;
const MIN_SCALE = 0.76;
/** No scroll events for this long = the gesture (or its momentum) has ended. */
const SCROLL_IDLE_MS = 110;
/** Only show the page-loading overlay when a tab switch is actually slow. */
const SLOW_NAV_MS = 300;

/** Damping 1.0, response ≈ 0.35s: Apple's default for repositioning UI. */
const SETTLE_SPRING = { type: "spring", bounce: 0, duration: 0.35 } as const;
const PILL_SPRING = { type: "spring", bounce: 0, duration: 0.32 } as const;
const PRESS_SPRING = { type: "spring", bounce: 0, duration: 0.18 } as const;
const PRESS_SCALE = 0.9;

type MobileTabBarProps = {
  app: MobileTabBarApp;
  activeId: string;
  venueSlug: string;
  /** Device preview: stay on /mobile and switch the in-phone page. */
  onSelectTab?: (tab: MobileTabItem) => void;
};

function isScrollableY(el: HTMLElement) {
  const overflowY = getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll";
}

function findOverflowScroller(root: HTMLElement): HTMLElement | null {
  if (isScrollableY(root) && root.scrollHeight > root.clientHeight + 1) {
    return root;
  }
  const walk = (node: HTMLElement): HTMLElement | null => {
    for (const child of Array.from(node.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (isScrollableY(child)) return child;
      const nested = walk(child);
      if (nested) return nested;
    }
    return null;
  };
  return walk(root);
}

function findPageScroller(): HTMLElement | null {
  const ptrContent = document.querySelector<HTMLElement>("[data-ptr-content]");
  if (ptrContent) {
    const inner = findOverflowScroller(ptrContent);
    if (inner) return inner;
  }
  return null;
}

export function MobileTabBar({
  app,
  activeId,
  venueSlug,
  onSelectTab,
}: MobileTabBarProps) {
  const host = useMobileChromeHost();
  const { beginNav } = useMobileNavBusy();
  const reduceMotion = useReducedMotion();
  const items = tabBarItems(app);

  // 0 = full size, 1 = minimised. A motion value, so scrolling never re-renders.
  const compact = useMotionValue(0);
  const scale = useTransform(compact, [0, 1], [1, MIN_SCALE]);

  // Optimistic selection: the pill moves on tap, keyed to the page it left from
  // so it falls back to the real tab once the route changes (or never does).
  const [pending, setPending] = useState<{ id: string; from: string } | null>(null);
  const selectedId = pending && pending.from === activeId ? pending.id : activeId;

  // Cleared when the page arrives: by unmount, or by `activeId` changing for
  // screens that keep one bar across tabs (e.g. Directory).
  const slowNavTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (slowNavTimerRef.current != null) window.clearTimeout(slowNavTimerRef.current);
      slowNavTimerRef.current = null;
    },
    [activeId],
  );

  function select(tab: MobileTabItem) {
    setPending({ id: tab.id, from: activeId });
    // Fast switches stay instant; the overlay only appears if loading drags on.
    // Unmounting (the new page arriving) cancels it.
    if (slowNavTimerRef.current != null) window.clearTimeout(slowNavTimerRef.current);
    slowNavTimerRef.current = window.setTimeout(beginNav, SLOW_NAV_MS);
  }

  useEffect(() => {
    if (reduceMotion) {
      compact.set(0);
      return;
    }
    const scroller = findPageScroller();
    if (!scroller) return;

    let lastTop = scroller.scrollTop;
    let lastDy = 0;
    let settle: AnimationPlaybackControls | null = null;
    let idleTimer: number | null = null;

    const settleTo = (target: 0 | 1) => {
      settle?.stop();
      if (compact.get() === target) return;
      settle = animate(compact, target, {
        ...SETTLE_SPRING,
        velocity: compact.getVelocity(),
      });
    };

    const onScroll = () => {
      const top = scroller.scrollTop;
      const dy = top - lastTop;
      lastTop = top;
      if (idleTimer != null) window.clearTimeout(idleTimer);

      // At (or rubber-banding past) the top the bar is always full size.
      if (top <= 0) {
        settleTo(0);
        return;
      }

      // Grab the bar mid-settle: stop the spring and track from its live value.
      settle?.stop();
      settle = null;
      if (dy !== 0) lastDy = dy;
      compact.set(Math.min(1, Math.max(0, compact.get() + dy / COMPACT_RANGE)));

      // Never rest half-way: settle in the direction the content was moving.
      idleTimer = window.setTimeout(() => {
        const value = compact.get();
        if (value > 0 && value < 1) settleTo(lastDy > 0 ? 1 : 0);
      }, SCROLL_IDLE_MS);
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (idleTimer != null) window.clearTimeout(idleTimer);
      settle?.stop();
    };
  }, [activeId, app, compact, reduceMotion]);

  const bar = (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          "pointer-events-none bg-transparent",
          host ? null : "absolute inset-x-0 bottom-0 z-50",
        )}
      >
        <div className="pointer-events-none relative mx-auto flex w-full max-w-md justify-center bg-transparent px-4 pb-[max(10px,calc(var(--mobile-safe-bottom,0px)-22px))] pt-1">
          <motion.nav
            aria-label="App"
            className="pointer-events-auto relative z-10 w-full bg-transparent will-change-transform"
            style={{ scale, transformOrigin: "50% 100%" }}
          >
            <div
              className="mobile-ig-bar grid gap-0.5 px-1.5 py-1.5"
              style={{
                gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
              }}
            >
              {items.map((tab) => (
                <TabBarItem
                  key={tab.id}
                  app={app}
                  tab={tab}
                  current={tab.id === activeId}
                  selected={tab.id === selectedId}
                  showLabel={tabBarShowsLabels(app)}
                  href={tab.pageId ? tabBarHref(venueSlug, tab.path) : null}
                  onSelectTab={onSelectTab}
                  onSelect={select}
                />
              ))}
            </div>
          </motion.nav>
        </div>
      </div>
    </MotionConfig>
  );

  if (host) return createPortal(bar, host);
  if (host === null) return null;
  return bar;
}

function TabBarItem({
  app,
  tab,
  current,
  selected,
  showLabel,
  href,
  onSelectTab,
  onSelect,
}: {
  app: MobileTabBarApp;
  tab: MobileTabItem;
  /** The page on screen (for assistive tech). */
  current: boolean;
  /** Where the pill is: the tapped tab while its page loads. */
  selected: boolean;
  showLabel: boolean;
  href: string | null;
  onSelectTab?: (tab: MobileTabItem) => void;
  onSelect: (tab: MobileTabItem) => void;
}) {
  const available = Boolean(href) || current;
  const className = cn(
    "mobile-ig-tab relative flex flex-col items-center justify-center gap-0.5 rounded-full px-1",
    // Icon-only bars don't need room for a label line.
    showLabel ? "min-h-[3.25rem] py-1" : "min-h-11 py-0.5",
    "transition-colors duration-200",
    selected && "mobile-ig-tab-active",
    !available && "opacity-40",
  );
  const inner = (
    <>
      {selected ? (
        <motion.span
          aria-hidden
          layoutId={`mobile-tab-pill-${app}`}
          transition={PILL_SPRING}
          className="mobile-ig-pill absolute inset-0 rounded-full"
        />
      ) : null}
      {/* Press scales the glyph + label, not the pill: instant, no overshoot. */}
      <motion.span
        className="relative flex flex-col items-center gap-0.5"
        whileTap={available ? { scale: PRESS_SCALE } : undefined}
        transition={PRESS_SPRING}
      >
        <tab.icon
          aria-hidden
          className={showLabel ? "h-5 w-5" : "h-6 w-6"}
          strokeWidth={selected ? 2.25 : 1.85}
        />
        {showLabel ? (
          <span
            className={cn(
              "max-w-full truncate text-[10px] leading-none",
              selected ? "font-semibold" : "font-medium",
            )}
          >
            {tab.label}
          </span>
        ) : null}
      </motion.span>
    </>
  );

  if (onSelectTab) {
    return (
      <button
        type="button"
        aria-current={current ? "page" : undefined}
        aria-label={tab.label}
        title={showLabel ? undefined : tab.label}
        disabled={!available}
        onClick={() => {
          if (!tab.pageId || current) return;
          onSelect(tab);
          onSelectTab(tab);
        }}
        className={className}
      >
        {inner}
      </button>
    );
  }

  if (href && !current) {
    return (
      <Link
        href={href}
        aria-label={tab.label}
        title={showLabel ? undefined : tab.label}
        className={className}
        onClick={() => onSelect(tab)}
      >
        {inner}
      </Link>
    );
  }

  return (
    <span aria-current={current ? "page" : undefined} className={className}>
      {inner}
    </span>
  );
}
