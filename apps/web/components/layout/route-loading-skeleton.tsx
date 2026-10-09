"use client";

import {
  ChatPaneSkeleton,
  ChatShellSkeleton,
  FeedPaneSkeleton,
  FeedShellSkeleton,
} from "@/components/connect/chat/chat-loading";
import { PageLoadingSkeleton } from "@/components/layout/page-loading-skeleton";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";

/**
 * App-wide loading screen. Most pages get the generic skeleton; Connecteam
 * (messenger) pages get a chat-shaped one, since its layouts load data before
 * their own loading screens can show.
 */
export function RouteLoadingSkeleton({ paneOnly = false }: { paneOnly?: boolean }) {
  const pathname = useRelativePathname();
  const inConnect = pathname === "/connect" || pathname.startsWith("/connect/");
  const connectSettings =
    pathname.startsWith("/connect/settings") || /^\/connect\/groups\/[^/]+\/settings/.test(pathname);

  if (inConnect && !connectSettings) {
    // The feed keeps its own colours and layout while loading.
    if (pathname.startsWith("/connect/chats/feed")) {
      return paneOnly ? <FeedPaneSkeleton /> : <FeedShellSkeleton />;
    }
    return paneOnly ? <ChatPaneSkeleton /> : <ChatShellSkeleton />;
  }
  return <PageLoadingSkeleton />;
}
