"use client";

import { Loader2, Newspaper } from "lucide-react";
import { PostCard, PostRefreshContext } from "@/components/connect/post-card";
import type { WidgetFeedData } from "@/lib/actions/connect-chat-widget";

/** Feed posts inside the floating chat widget, newest first. */
export function ChatWidgetFeed({
  feed,
  loading,
  loadingMore,
  error,
  showGroup,
  onRefresh,
  onLoadMore,
}: {
  feed: WidgetFeedData | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  showGroup: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
}) {
  if (loading && !feed) {
    return (
      <div className="flex flex-1 items-center justify-center text-black/40">
        <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading feed" />
      </div>
    );
  }
  if (error) {
    return <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-black/55">{error}</p>;
  }
  if (!feed || feed.posts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-black/50">
        <Newspaper className="h-8 w-8 text-black/25" aria-hidden />
        No posts yet.
      </div>
    );
  }

  return (
    <PostRefreshContext.Provider value={onRefresh}>
      <div className="feed-backdrop min-h-0 flex-1 overflow-y-auto">
        {/* Post cards are sized for the full feed; scale them to the popup. */}
        <div className="space-y-3 p-3" style={{ zoom: 0.85 }}>
          {feed.posts.map((post) => (
            <PostCard key={post.id} post={post} me={feed.me} showGroup={showGroup} />
          ))}
          {feed.nextBefore ? (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-4 py-1.5 text-sm font-medium text-[#3D421F] shadow-sm hover:bg-[#F0F3DD] disabled:opacity-60"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Older posts
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </PostRefreshContext.Provider>
  );
}
