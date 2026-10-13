/** Emoji reactions on chat messages. Keys match the database check constraint. */
export const CHAT_REACTIONS = [
  { key: "like", emoji: "👍", label: "Thumbs up" },
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "laugh", emoji: "😂", label: "Laughing" },
  { key: "wow", emoji: "😮", label: "Wow" },
  { key: "sad", emoji: "😢", label: "Sad" },
  { key: "star", emoji: "⭐", label: "Star" },
  { key: "pray", emoji: "🙏", label: "Thank you" },
  { key: "fire", emoji: "🔥", label: "Fire" },
] as const;

export type ChatReactionKey = (typeof CHAT_REACTIONS)[number]["key"];

export function isChatReactionKey(value: unknown): value is ChatReactionKey {
  return CHAT_REACTIONS.some((r) => r.key === value);
}

export function reactionEmoji(key: ChatReactionKey): string {
  return CHAT_REACTIONS.find((r) => r.key === key)?.emoji ?? "👍";
}

export type ChatReactionRow = {
  message_id: string;
  conversation_id: string;
  user_id: string;
  reaction: string;
  created_at: string;
};

/** messageId → userId → reaction */
export type ChatReactionMap = Map<string, Map<string, ChatReactionKey>>;

export function buildReactionMap(rows: ChatReactionRow[]): ChatReactionMap {
  const map: ChatReactionMap = new Map();
  for (const row of rows) {
    if (!isChatReactionKey(row.reaction)) continue;
    const users = map.get(row.message_id) ?? new Map<string, ChatReactionKey>();
    users.set(row.user_id, row.reaction);
    map.set(row.message_id, users);
  }
  return map;
}

/** Counts per emoji for one message, most used first, in picker order on ties. */
export function summarizeReactions(
  users: Map<string, ChatReactionKey> | undefined,
): { key: ChatReactionKey; count: number; userIds: string[] }[] {
  if (!users) return [];
  const byKey = new Map<ChatReactionKey, string[]>();
  for (const [userId, key] of users) byKey.set(key, [...(byKey.get(key) ?? []), userId]);
  const order = CHAT_REACTIONS.map((r) => r.key as ChatReactionKey);
  return [...byKey.entries()]
    .map(([key, userIds]) => ({ key, count: userIds.length, userIds }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));
}
