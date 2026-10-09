import { FeedPane, type FeedPaneParams } from "@/components/connect/feed-pane";

export default async function ConnectChatsFeedPage({
  searchParams,
}: {
  searchParams: Promise<FeedPaneParams>;
}) {
  return <FeedPane params={await searchParams} />;
}
