/**
 * @mentions in chat messages, posts and comments.
 *
 * While typing, the text shows a readable "@Full Name". On send, each
 * "@Full Name" that matches a person is stored as a token `@[Full Name](userId)`
 * so it can notify that person and render as a tag. Older text without tokens
 * renders as before.
 */

const TOKEN_RE = /@\[([^\]\n]{1,80})\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export type MentionPerson = { userId: string; name: string };

export type TextSegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; name: string; userId: string };

/** Split stored text into plain runs and mention tags. */
export function splitMentions(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const at = match.index ?? 0;
    if (at > last) segments.push({ kind: "text", text: text.slice(last, at) });
    segments.push({ kind: "mention", name: match[1]!, userId: match[2]!.toLowerCase() });
    last = at + match[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

/** Stored text → readable text ("@Full Name"), for previews, notifications and editing. */
export function decodeMentions(text: string): string {
  return text.replace(TOKEN_RE, (_, name: string) => `@${name}`);
}

/** User ids mentioned in stored text (deduplicated). */
export function mentionedUserIds(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN_RE)].map((m) => m[2]!.toLowerCase()))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Readable text → stored text: "@Full Name" becomes a token for the matching
 * person. Longer names are matched first so "@Ana Maria" beats "@Ana".
 */
export function encodeMentions(text: string, people: MentionPerson[]): string {
  if (!text.includes("@") || people.length === 0) return text;
  // Leave existing tokens alone.
  const segments = splitMentions(text);
  const sorted = [...people]
    .filter((p) => p.name.trim())
    .sort((a, b) => b.name.length - a.name.length);
  return segments
    .map((segment) => {
      if (segment.kind === "mention") return `@[${segment.name}](${segment.userId})`;
      let out = segment.text;
      for (const person of sorted) {
        const name = person.name.trim();
        const re = new RegExp(`(^|[^\\p{L}\\p{N}_])@${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, "gu");
        out = out.replace(re, (_, lead: string) => `${lead}@[${name}](${person.userId})`);
      }
      return out;
    })
    .join("");
}

/**
 * Cut text to about `max` characters for a collapsed preview without slicing a
 * mention token in half.
 */
export function cutPreservingMentions(text: string, max: number): string {
  if (text.length <= max) return text;
  for (const match of text.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (start < max && end > max) return text.slice(0, end);
  }
  return text.slice(0, max);
}
