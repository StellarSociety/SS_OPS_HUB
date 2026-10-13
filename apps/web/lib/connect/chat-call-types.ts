export type ChatCallMode = "audio" | "video";

export type ChatCallStatus =
  | "ringing"
  | "active"
  | "ended"
  | "declined"
  | "missed"
  | "cancelled";

export type ChatCallRow = {
  id: string;
  conversation_id: string;
  venue_id: string;
  initiated_by: string | null;
  mode: ChatCallMode;
  status: ChatCallStatus;
  livekit_room: string;
  expires_at: string;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatCall = {
  id: string;
  conversationId: string;
  venueId: string;
  initiatedBy: string | null;
  mode: ChatCallMode;
  status: ChatCallStatus;
  expiresAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

export function mapChatCallRow(row: ChatCallRow): ChatCall {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    venueId: row.venue_id,
    initiatedBy: row.initiated_by,
    mode: row.mode,
    status: row.status,
    expiresAt: row.expires_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

export function isOpenChatCall(status: ChatCallStatus): boolean {
  return status === "ringing" || status === "active";
}
