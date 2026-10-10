import { describe, expect, it } from "vitest";
import {
  cutPreservingMentions,
  decodeMentions,
  encodeMentions,
  mentionedUserIds,
  splitMentions,
} from "@/lib/connect/mentions";

const LINA = { userId: "11111111-1111-1111-1111-111111111111", name: "Lina Daifi" };
const SHORT = { userId: "22222222-2222-2222-2222-222222222222", name: "Lina" };

describe("mentions", () => {
  it("encodes the longest matching name and skips emails", () => {
    const out = encodeMentions("hi @Lina Daifi and @Lina, mail a@Lina.com", [SHORT, LINA]);
    expect(out).toBe(
      `hi @[Lina Daifi](${LINA.userId}) and @[Lina](${SHORT.userId}), mail a@Lina.com`,
    );
    expect(mentionedUserIds(out)).toEqual([LINA.userId, SHORT.userId]);
  });

  it("is idempotent and decodes back to readable text", () => {
    const once = encodeMentions("@Lina Daifi thanks!", [LINA, SHORT]);
    expect(encodeMentions(once, [LINA, SHORT])).toBe(once);
    expect(decodeMentions(once)).toBe("@Lina Daifi thanks!");
  });

  it("splits text into runs and tags", () => {
    expect(splitMentions(`ok @[Lina Daifi](${LINA.userId})!`)).toEqual([
      { kind: "text", text: "ok " },
      { kind: "mention", name: "Lina Daifi", userId: LINA.userId },
      { kind: "text", text: "!" },
    ]);
  });

  it("never cuts a token in half", () => {
    const text = `abc @[Lina Daifi](${LINA.userId}) end`;
    expect(cutPreservingMentions(text, 8)).toBe(`abc @[Lina Daifi](${LINA.userId})`);
    expect(cutPreservingMentions("short", 10)).toBe("short");
  });
});
