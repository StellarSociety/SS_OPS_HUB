"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  tabBarHref,
  tabBarItems,
  type MobileTabBarApp,
  type MobileTabItem,
} from "@/lib/mobile/tab-bars";
import { useMobilePressMotion } from "@/components/mobile/mobile-press";
import { useMobileNavBusy } from "@/components/mobile/mobile-nav-busy";
import { useMobileChromeHost } from "@/components/mobile/mobile-chrome-host";

const COMPACT_RANGE = 80;
const MIN_SCALE = 0.76;

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
  const items = tabBarItems(app);
  const rootRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef(0);
  const lastTopRef = useRef(0);
  const rafRef = useRef(0);
  const [compact, setCompact] = useState(0);

  useEffect(() => {
    const scroller = findPageScroller();
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
  }, [activeId, app]);

  const scale = 1 - compact * (1 - MIN_SCALE);

  const bar = (
    <div
      ref={rootRef}
      className={cn(
        "pointer-events-none bg-transparent",
        host ? null : "absolute inset-x-0 bottom-0 z-50",
      )}
    >
      <div className="pointer-events-none relative mx-auto flex w-full max-w-md justify-center bg-transparent px-4 pb-[max(10px,var(--mobile-safe-bottom,0px))] pt-1">
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
            {items.map((tab) => (
              <TabBarItem
                key={tab.id}
                tab={tab}
                active={tab.id === activeId}
                href={tab.pageId ? tabBarHref(venueSlug, tab.path) : null}
                onSelectTab={onSelectTab}
                beginNav={beginNav}
              />
            ))}
          </div>
        </nav>
      </div>
    </div>
  );

  if (host) return createPortal(bar, host);
  if (host === null) return null;
  return bar;
}

function TabBarItem({
  tab,
  active,
  href,
  onSelectTab,
  beginNav,
}: {
  tab: MobileTabItem;
  active: boolean;
  href: string | null;
  onSelectTab?: (tab: MobileTabItem) => void;
  beginNav: () => void;
}) {
  const available = Boolean(href) || active;
  const { motionProps } = useMobilePressMotion(available);
  const className = cn(
    "mobile-ig-tab flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1",
    "transition-[background-color,color] duration-200",
    active && "mobile-ig-tab-active",
    !available && "opacity-40",
  );
  const inner = (
    <>
      <tab.icon
        aria-hidden
        className="h-5 w-5"
        strokeWidth={active ? 2.25 : 1.85}
      />
      <span className="max-w-full truncate text-[10px] font-medium leading-none tracking-wide">
        {tab.label}
      </span>
    </>
  );

  if (onSelectTab) {
    return (
      <motion.button
        type="button"
        aria-current={active ? "page" : undefined}
        aria-label={tab.label}
        disabled={!available}
        onClick={() => {
          if (!tab.pageId || active) return;
          beginNav();
          onSelectTab(tab);
        }}
        className={className}
        {...motionProps}
      >
        {inner}
      </motion.button>
    );
  }

  if (href && !active) {
    return (
      <motion.div className="min-w-0" {...motionProps}>
        <Link
          href={href}
          aria-label={tab.label}
          className={className}
          onClick={() => beginNav()}
        >
          {inner}
        </Link>
      </motion.div>
    );
  }

  return (
    <span
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {inner}
    </span>
  );
}
