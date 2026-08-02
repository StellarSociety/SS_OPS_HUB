/**
 * Lightweight formatting for HR email template bodies.
 * Stored as plain text with optional <b>, <i>, <u> tags; newlines as \n.
 */

const FORMAT_TAG_RE = /&lt;(\/?)(b|strong|i|em|u)&gt;/gi;

export function escapeEmailText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Restore allowed formatting tags after HTML-escaping the body. */
export function restoreAllowedFormatTags(escaped: string): string {
  return escaped.replace(FORMAT_TAG_RE, (_, slash: string, tag: string) => {
    const t = tag.toLowerCase();
    const normalized = t === "strong" ? "b" : t === "em" ? "i" : t;
    return `<${slash}${normalized}>`;
  });
}

/** Convert a stored template/body string into safe email HTML. */
export function emailTemplateBodyToHtml(body: string): string {
  const withTags = restoreAllowedFormatTags(escapeEmailText(body));
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#3D421F;white-space:pre-wrap;">${withTags}</div>`;
}

/**
 * Safe HTML fragment for in-app preview surfaces that do not use
 * white-space:pre-wrap (newlines become <br>).
 */
export function emailTemplateBodyToSafeFragment(body: string): string {
  return restoreAllowedFormatTags(escapeEmailText(body)).replace(
    /\n/g,
    "<br>",
  );
}

/**
 * Stored value → HTML for a contentEditable surface that uses
 * white-space:pre-wrap. Keep real \n characters so line breaks round-trip
 * without fighting browser <br>/<div> insertion.
 */
export function storedMessageToEditorHtml(stored: string): string {
  if (!stored) return "";
  return restoreAllowedFormatTags(escapeEmailText(stored));
}

function pushStyleFormats(el: HTMLElement, tags: string[]): void {
  const weight = el.style.fontWeight;
  if (
    weight === "bold" ||
    weight === "bolder" ||
    (!Number.isNaN(Number(weight)) && Number(weight) >= 600)
  ) {
    tags.push("b");
  }
  if (el.style.fontStyle === "italic") tags.push("i");
  const deco = el.style.textDecorationLine || el.style.textDecoration;
  if (deco.includes("underline")) tags.push("u");
}

function formatTagsForElement(el: HTMLElement): string[] {
  const tag = el.tagName.toLowerCase();
  if (tag === "b" || tag === "strong") return ["b"];
  if (tag === "i" || tag === "em") return ["i"];
  if (tag === "u") return ["u"];
  if (tag === "span" || tag === "font") {
    const tags: string[] = [];
    pushStyleFormats(el, tags);
    return tags;
  }
  return [];
}

function isBlockTag(tag: string): boolean {
  return tag === "div" || tag === "p" || tag === "li" || tag === "h1" || tag === "h2" || tag === "h3";
}

function isBr(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    (node as HTMLElement).tagName.toLowerCase() === "br"
  );
}

/** Chrome often leaves a trailing <br> as a caret placeholder inside a block. */
function childNodesWithoutTrailingBogusBr(el: HTMLElement): Node[] {
  const kids = Array.from(el.childNodes);
  if (kids.length <= 1) return kids;
  const last = kids[kids.length - 1]!;
  if (isBr(last)) return kids.slice(0, -1);
  return kids;
}

function isBreakOnlyBlock(el: HTMLElement): boolean {
  const kids = Array.from(el.childNodes).filter((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent ?? "").length > 0;
    }
    return node.nodeType === Node.ELEMENT_NODE;
  });
  if (kids.length === 0) return true;
  if (kids.length !== 1) return false;
  return isBr(kids[0]!);
}

function normalizeText(text: string): string {
  return text.replace(/\u00A0/g, " ").replace(/\r\n?/g, "\n");
}

function serializeInline(nodes: Iterable<Node>): string {
  let out = "";
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += normalizeText(node.textContent ?? "");
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      out += "\n";
      continue;
    }

    if (isBlockTag(tag)) {
      if (out.length > 0 && !out.endsWith("\n")) out += "\n";
      if (!isBreakOnlyBlock(el)) {
        out += serializeInline(childNodesWithoutTrailingBogusBr(el));
      }
      continue;
    }

    const formatTags = formatTagsForElement(el);
    for (const t of formatTags) out += `<${t}>`;
    out += serializeInline(el.childNodes);
    for (let i = formatTags.length - 1; i >= 0; i -= 1) {
      out += `</${formatTags[i]}>`;
    }
  }
  return out;
}

/**
 * Serialize a contentEditable root back to the stored string format.
 * Preserves intentional blank lines and bold/italic/underline tags without
 * doubling newlines from Chrome's block wrappers + caret <br>.
 */
export function editorHtmlToStoredMessage(root: HTMLElement): string {
  const children = Array.from(root.childNodes);
  const hasTopLevelBlocks = children.some(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      isBlockTag((node as HTMLElement).tagName.toLowerCase()),
  );

  if (!hasTopLevelBlocks) {
    return serializeInline(children).replace(/\n$/, "");
  }

  const lines: string[] = [];

  function appendTextAsLines(text: string) {
    const normalized = normalizeText(text);
    if (!normalized) return;
    const parts = normalized.split("\n");
    if (lines.length === 0) {
      lines.push(...parts);
      return;
    }
    lines[lines.length - 1] = `${lines[lines.length - 1] ?? ""}${parts[0] ?? ""}`;
    lines.push(...parts.slice(1));
  }

  for (const node of children) {
    if (node.nodeType === Node.TEXT_NODE) {
      appendTextAsLines(node.textContent ?? "");
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      lines.push("");
      continue;
    }

    if (isBlockTag(tag)) {
      lines.push(
        isBreakOnlyBlock(el)
          ? ""
          : serializeInline(childNodesWithoutTrailingBogusBr(el)),
      );
      continue;
    }

    lines.push(serializeInline([node]));
  }

  return lines.join("\n").replace(/\n$/, "");
}
