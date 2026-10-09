import { ChatShell } from "@/components/connect/chat/chat-shell";
import { canCreateChatGroups } from "@/lib/connect/chat-permissions";
import { listMyChats } from "@/lib/connect/chat-store";
import { getConnectPageContext } from "@/lib/connect/page-context";
import { listVenueAppUsers } from "@/lib/connect/store";

export default async function ConnectChatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { service, venue, user, groups, isConnectAdmin } = await getConnectPageContext();
  const [chats, people] = await Promise.all([
    listMyChats(service, venue.id, user.id),
    listVenueAppUsers(service, venue.id),
  ]);

  return (
    <ChatShell
      chats={chats}
      meId={user.id}
      people={people}
      canCreateGroups={canCreateChatGroups(groups, isConnectAdmin)}
    >
      {children}
    </ChatShell>
  );
}
