/**
 * Turn text pasted from a PDF or Word export into structured HTML: "•" lines
 * become bullets, "o" lines nested bullets, short title lines headings, and
 * hard-wrapped lines are joined back into sentences.
 */

type Block =
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "item"; level: 0 | 1; text: string };

const BULLET_RE = /^[•●▪■◆\-–*]\s+/;
const SUB_BULLET_RE = /^(?:o|◦|○|▫|□)\s+/;
const NUMBERED_RE = /^(\d+(?:\.\d+)*)[.)]?\s+(\S.*)$/;
const ENDS_SENTENCE_RE = /[.:;!?)]$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function looksLikeHeading(line: string, next: string | undefined): boolean {
  if (line.length > 70 || ENDS_SENTENCE_RE.test(line)) return false;
  if (!next) return false;
  // A short, unpunctuated line that introduces a list or a new paragraph.
  return BULLET_RE.test(next) || SUB_BULLET_RE.test(next) || /^[A-Z]/.test(next);
}

function parse(text: string): Block[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim());

  const blocks: Block[] = [];
  let canJoin = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line) {
      canJoin = false;
      continue;
    }
    const next = lines.slice(i + 1).find((l) => l.length > 0);

    if (BULLET_RE.test(line)) {
      blocks.push({ kind: "item", level: 0, text: line.replace(BULLET_RE, "") });
      canJoin = true;
      continue;
    }
    if (SUB_BULLET_RE.test(line)) {
      blocks.push({ kind: "item", level: 1, text: line.replace(SUB_BULLET_RE, "") });
      canJoin = true;
      continue;
    }

    const last = blocks[blocks.length - 1];
    const numbered = line.match(NUMBERED_RE);
    if (numbered && line.length <= 70 && !ENDS_SENTENCE_RE.test(line)) {
      blocks.push({ kind: "heading", text: `${numbered[1]}. ${numbered[2]}` });
      canJoin = false;
      continue;
    }

    // Hard-wrapped continuation of the previous sentence.
    if (
      canJoin &&
      last &&
      last.kind !== "heading" &&
      (!ENDS_SENTENCE_RE.test(last.text) || /^[a-z(]/.test(line))
    ) {
      last.text = `${last.text} ${line}`;
      continue;
    }

    if (looksLikeHeading(line, next)) {
      blocks.push({ kind: "heading", text: line });
      canJoin = false;
      continue;
    }

    blocks.push({ kind: "para", text: line });
    canJoin = true;
  }
  return blocks;
}

export function tidyPastedTextToHtml(text: string): string {
  const blocks = parse(text);
  let html = "";
  let depth = -1; // -1 = not in a list, 0 = top list open, 1 = nested open

  const closeTo = (target: number) => {
    while (depth > target) {
      html += depth === 1 ? "</li></ul>" : "</li></ul>";
      depth -= 1;
    }
  };

  for (const block of blocks) {
    if (block.kind !== "item") {
      closeTo(-1);
      const text = escapeHtml(block.text);
      html += block.kind === "heading" ? `<h3>${text}</h3>` : `<p>${text}</p>`;
      continue;
    }
    const text = escapeHtml(block.text);
    if (block.level === 0) {
      if (depth === -1) {
        html += `<ul><li><p>${text}</p>`;
      } else {
        closeTo(0);
        html += `</li><li><p>${text}</p>`;
      }
      depth = 0;
    } else {
      if (depth === -1) {
        // Sub-bullet without a parent: open an empty parent list item.
        html += `<ul><li><ul><li><p>${text}</p>`;
        depth = 1;
      } else if (depth === 0) {
        html += `<ul><li><p>${text}</p>`;
        depth = 1;
      } else {
        html += `</li><li><p>${text}</p>`;
      }
    }
  }
  closeTo(-1);
  return html;
}
