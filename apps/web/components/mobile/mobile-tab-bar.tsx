"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  tabBarHref,
  tabBarItems,
  type MobileTabBarApp,
  type MobileTabItem,
} from "@/lib/mobile/tab-bars";

type MobileTabBarProps = {
  app: MobileTabBarApp;
  activeId: string;
  venueSlug: string;
  /** Device preview: stay on /mobile and switch the in-phone page. */
  onSelectTab?: (tab: MobileTabItem) => void;
};

export function MobileTabBar({
  app,
  activeId,
  venueSlug,
  onSelectTab,
}: MobileTabBarProps) {
  const items = tabBarItems(app);
  const [pressedId, setPressedId] = useState<string | null>(null);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[10px] z-50 bg-transparent">
      <div className="pointer-events-none relative mx-auto flex w-full max-w-md justify-center bg-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <nav
          aria-label="App"
          className="pointer-events-auto relative z-10 w-full bg-transparent"
        >
          <div
            className="liquid-gel-bar grid gap-0.5 px-1.5 py-1.5"
            style={{
              gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
            }}
          >
            {items.map((tab) => {
              const active = tab.id === activeId;
              const href = tab.pageId ? tabBarHref(venueSlug, tab.path) : null;
              const available = Boolean(href) || active;
              const className = cn(
                "liquid-gel-tab flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-[1.85rem] px-1 py-1",
                "transition-transform duration-200",
                active && "liquid-gel-tab-active",
                pressedId === tab.id && available && "scale-90",
                !available && "opacity-40",
              );
              const inner = (
                <>
                  <tab.icon
                    aria-hidden
                    className="h-5 w-5"
                    strokeWidth={active ? 2.25 : 2}
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
