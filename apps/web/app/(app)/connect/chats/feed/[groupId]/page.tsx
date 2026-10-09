import { FeedPane, type FeedPaneParams } from "@/components/connect/feed-pane";

export default async function ConnectChatsGroupFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<FeedPaneParams>;
}) {
  const { groupId } = await params;
  return <FeedPane groupId={groupId} params={await searchParams} />;
}
