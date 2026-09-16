"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ScopedLink } from "@/components/layout/scoped-link";
import { useMobileNavBusy } from "@/components/mobile/mobile-nav-busy";

type SentimentNavValue = {
  /** `/m/{slug}/sentiment` when inside the phone app. */
  base: string | null;
  preview: boolean;
  onNavigate?: (pageId: string) => void;
};

const SentimentNavContext = createContext<SentimentNavValue>({
  base: null,
  preview: false,
});

export function SentimentNavProvider({
  base,
  preview = false,
  onNavigate,
  children,
}: SentimentNavValue & { children: ReactNode }) {
  return (
    <SentimentNavContext.Provider value={{ base, preview, onNavigate }}>
      {children}
    </SentimentNavContext.Provider>
  );
}

export function useSentimentNav() {
  return useContext(SentimentNavContext);
}

export function mobileSentimentPageId(href: string): string | null {
  const path = href.split("?")[0] ?? "";
  if (path === "/sentiment/reviews" || path.startsWith("/sentiment/reviews/")) {
    return "sentiment-reviews";
  }
  if (
    path === "/sentiment/calendar" ||
    path.startsWith("/sentiment/calendar/")
  ) {
    return "sentiment-calendar";
  }
  if (path === "/sentiment/actions" || path.startsWith("/sentiment/actions/")) {
    return "sentiment-actions";
  }
  if (path === "/sentiment") return "sentiment";
  return null;
}

function rewriteHref(href: string, base: string) {
  const [path, query] = href.split("?");
  const suffix = query ? `?${query}` : "";
  return `${path.replace(/^\/sentiment/, base)}${suffix}`;
}

type SentimentLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

export function SentimentLink({
  href,
  onClick,
  children,
  ...props
}: SentimentLinkProps) {
  const nav = useSentimentNav();
  const { beginNav } = useMobileNavBusy();
  const pageId = mobileSentimentPageId(href);
  const mobile = Boolean(nav.base || nav.preview);

  if (mobile && !pageId) return null;

  if (nav.preview) {
    return (
      <button
        type="button"
        className={props.className}
        aria-label={props["aria-label"]}
        aria-current={props["aria-current"]}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          onClick?.(event as unknown as MouseEvent<HTMLAnchorElement>);
          if (!pageId || !nav.onNavigate) return;
          beginNav();
          nav.onNavigate(pageId);
        }}
      >
        {children}
      </button>
    );
  }

  if (nav.base && pageId) {
    return (
      <Link
        href={rewriteHref(href, nav.base)}
        onClick={(event) => {
          beginNav();
          onClick?.(event);
        }}
        {...props}
      >
        {children}
      </Link>
    );
  }

  return (
    <ScopedLink href={href} onClick={onClick} {...props}>
      {children}
    </ScopedLink>
  );
}
