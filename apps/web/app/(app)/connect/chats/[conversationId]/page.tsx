import { ChatConversation } from "@/components/connect/chat/chat-conversation";
import { getChatDetail, listChatMessages } from "@/lib/connect/chat-store";
import { getConnectPageContext } from "@/lib/connect/page-context";
import { listVenueAppUsers } from "@/lib/connect/store";

export default async function ConnectChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const { service, venue, user, me } = await getConnectPageContext();

  const detail = await getChatDetail(service, venue.id, conversationId, user.id);
  if (!detail) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#F7F8F2] p-8 text-center text-sm text-black/55">
        This chat isn&apos;t available — it may have been deleted, or you&apos;re no longer a member.
      </div>
    );
  }

  const [{ messages, hasMore }, venuePeople] = await Promise.all([
    listChatMessages(service, conversationId),
    listVenueAppUsers(service, venue.id),
  ]);

  return (
    <ChatConversation
      key={detail.id}
      detail={detail}
      initialMessages={messages}
      initialHasMore={hasMore}
      me={me}
      venuePeople={venuePeople}
    />
  );
}
