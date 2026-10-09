import type { ConnectPerson } from "./types";

export type ChatKind = "direct" | "group";
export type ChatRole = "admin" | "member";

export const CHAT_MESSAGES_PAGE_SIZE = 50;
export const CHAT_MAX_MESSAGE_CHARS = 4000;

/** Notification `entity` for chat messages; `entity_id` is the conversation id. */
export const CHAT_NOTIFICATION_ENTITY = "chat_conversation";

export type ChatAttachment = {
  url: string;
  name: string;
  type: string;
  size: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string | null;
  body: string;
  kind: "message" | "system";
  attachment: ChatAttachment | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

/** Row shape of public.chat_messages (also what Realtime delivers). */
export type ChatMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  kind: "message" | "system";
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export function mapChatMessageRow(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    kind: row.kind,
    attachment: row.attachment_url
      ? {
          url: row.attachment_url,
          name: row.attachment_name ?? "file",
          type: row.attachment_type ?? "application/octet-stream",
          size: Number(row.attachment_size) || 0,
        }
      : null,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
  };
}

export type ChatSummary = {
  id: string;
  kind: ChatKind;
  /** Group name, or the other person's name for a direct chat. */
  title: string;
  photoUrl: string | null;
  color: string;
  /** Direct chats: the other person. */
  otherUserId: string | null;
  memberCount: number;
  lastMessage: {
    body: string;
    kind: "message" | "system";
    senderId: string | null;
    senderName: string | null;
    hasAttachment: boolean;
    deleted: boolean;
    createdAt: string;
  } | null;
  /** Sort key: last message or creation time. */
  activityAt: string;
  unreadCount: number;
};

export type ChatMember = {
  userId: string;
  role: ChatRole;
  person: ConnectPerson;
};

/** Extra details about the other person in a 1:1 chat. */
export type ChatContact = {
  email: string | null;
  joiningDate: string | null;
  positionName: string | null;
  departmentName: string | null;
};

export type SharedItem = {
  messageId: string;
  senderId: string | null;
  createdAt: string;
  url: string;
  name: string;
  type: string;
  size: number;
};

export type ChatShared = {
  images: SharedItem[];
  documents: SharedItem[];
  links: SharedItem[];
};

export type ChatDetail = ChatSummary & {
  contact: ChatContact | null;
  description: string;
  onlyAdminsCanPost: boolean;
  membersCanAdd: boolean;
  myRole: ChatRole;
  members: ChatMember[];
  canPost: boolean;
  canManage: boolean;
  canAddMembers: boolean;
};

export function chatPreviewText(summary: ChatSummary, meId: string): string {
  const last = summary.lastMessage;
  if (!last) return summary.kind === "group" ? "Group created" : "Say hello 👋";
  if (last.deleted) return "Message deleted";
  const text = last.body.trim() || (last.hasAttachment ? "📎 Attachment" : "");
  if (last.kind === "system") return text;
  if (last.senderId === meId) return `You: ${text}`;
  if (summary.kind === "group" && last.senderName) {
    return `${last.senderName.split(/\s+/)[0]}: ${text}`;
  }
  return text;
}
