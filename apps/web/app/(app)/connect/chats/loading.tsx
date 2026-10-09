import { RouteLoadingSkeleton } from "@/components/layout/route-loading-skeleton";

/** Switching chats / feeds keeps the list and shows a matching placeholder. */
export default function ConnectChatsLoading() {
  return <RouteLoadingSkeleton paneOnly />;
}
