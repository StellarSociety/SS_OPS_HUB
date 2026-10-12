import { Newspaper } from "lucide-react";
import { PostCard } from "@/components/connect/post-card";
import { ScopedLink } from "@/components/layout/scoped-link";
import type { ConnectPerson, ConnectPost } from "@/lib/connect/types";

export function FeedList({
  posts,
  me,
  showGroup,
  nextBefore,
  basePath,
  emptyMessage,
  groupBasePath = "/connect/chats/feed",
  compact = false,
}: {
  posts: ConnectPost[];
  me: ConnectPerson | null;
  showGroup: boolean;
  nextBefore: string | null;
  basePath: string;
  emptyMessage: string;
  groupBasePath?: string;
  /** Phone layout: tighter cards. */
  compact?: boolean;
}) {
  if (posts.length === 0) {
    return (
      <div className={`rounded-2xl border border-dashed border-black/10 bg-white/60 text-center ${compact ? "px-5 py-9" : "px-6 py-12"}`}>
        <Newspaper className="mx-auto h-8 w-8 text-black/25" aria-hidden />
        <p className="mt-2 text-sm text-black/55">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} me={me} showGroup={showGroup} groupBasePath={groupBasePath} compact={compact} />
      ))}
      {nextBefore ? (
        <div className="flex justify-center pt-2">
          <ScopedLink
            href={`${basePath}${basePath.includes("?") ? "&" : "?"}before=${encodeURIComponent(nextBefore)}`}
            className="rounded-full border border-black/10 bg-white px-5 py-2 text-sm font-medium text-[#3D421F] shadow-sm hover:bg-[#F0F3DD]"
          >
            Older posts
          </ScopedLink>
        </div>
      ) : null}
    </div>
  );
}
