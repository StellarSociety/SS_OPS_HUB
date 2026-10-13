import { describe, expect, it } from "vitest";
import { isOpenChatCall, mapChatCallRow, type ChatCallRow } from "@/lib/connect/chat-call-types";

const row: ChatCallRow = {
  id: "call-1",
  conversation_id: "conversation-1",
  venue_id: "venue-1",
  initiated_by: "user-1",
  mode: "video",
  status: "ringing",
  livekit_room: "chat-call-call-1",
  expires_at: "2026-10-12T12:00:45.000Z",
  answered_at: null,
  ended_at: null,
  created_at: "2026-10-12T12:00:00.000Z",
  updated_at: "2026-10-12T12:00:00.000Z",
};

describe("chat call types", () => {
  it("maps database rows without exposing the LiveKit room name", () => {
    expect(mapChatCallRow(row)).toEqual({
      id: "call-1",
      conversationId: "conversation-1",
      venueId: "venue-1",
      initiatedBy: "user-1",
      mode: "video",
      status: "ringing",
      expiresAt: "2026-10-12T12:00:45.000Z",
      answeredAt: null,
      endedAt: null,
      createdAt: "2026-10-12T12:00:00.000Z",
    });
    expect(mapChatCallRow(row)).not.toHaveProperty("livekitRoom");
  });

  it("treats only ringing and active calls as open", () => {
    expect(isOpenChatCall("ringing")).toBe(true);
    expect(isOpenChatCall("active")).toBe(true);
    expect(isOpenChatCall("ended")).toBe(false);
    expect(isOpenChatCall("declined")).toBe(false);
    expect(isOpenChatCall("missed")).toBe(false);
    expect(isOpenChatCall("cancelled")).toBe(false);
  });
});
