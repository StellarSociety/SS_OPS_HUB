import { ChatDirectory } from "@/components/connect/chat/chat-directory";
import { listChatDirectory } from "@/lib/connect/chat-store";
import { getConnectPageContext } from "@/lib/connect/page-context";

export default async function ConnectChatDirectoryPage() {
  const { service, venue, user } = await getConnectPageContext();
  const people = await listChatDirectory(service, venue.id, user.id);
  return <ChatDirectory people={people} />;
}
