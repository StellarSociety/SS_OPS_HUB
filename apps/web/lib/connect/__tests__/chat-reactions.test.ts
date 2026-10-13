import { describe, expect, it } from "vitest";
import { buildReactionMap, summarizeReactions, type ChatReactionRow } from "@/lib/connect/chat-reactions";

const row = (message_id: string, user_id: string, reaction: string): ChatReactionRow => ({
  message_id,
  conversation_id: "c",
  user_id,
  reaction,
  created_at: "2026-10-13T12:00:00Z",
});

describe("chat reactions", () => {
  it("keeps one reaction per person and ignores unknown keys", () => {
    const map = buildReactionMap([row("m1", "a", "like"), row("m1", "b", "love"), row("m1", "c", "bogus")]);
    expect([...map.get("m1")!.entries()]).toEqual([
      ["a", "like"],
      ["b", "love"],
    ]);
  });

  it("orders by count, then picker order", () => {
    const map = buildReactionMap([
      row("m1", "a", "fire"),
      row("m1", "b", "laugh"),
      row("m1", "c", "laugh"),
      row("m1", "d", "like"),
    ]);
    expect(summarizeReactions(map.get("m1")).map((r) => [r.key, r.count])).toEqual([
      ["laugh", 2],
      ["like", 1],
      ["fire", 1],
    ]);
  });
});
