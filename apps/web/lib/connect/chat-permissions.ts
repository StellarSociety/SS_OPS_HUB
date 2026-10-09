import type { ConnectGroup } from "./types";

/**
 * Group chats are created by Connecteam admins and by anyone who is a Group
 * Admin or Group Moderator of at least one feed group.
 */
export function canCreateChatGroups(groups: ConnectGroup[], isConnectAdmin: boolean): boolean {
  if (isConnectAdmin) return true;
  return groups.some((g) => g.myRole === "admin" || g.myRole === "moderator");
}
