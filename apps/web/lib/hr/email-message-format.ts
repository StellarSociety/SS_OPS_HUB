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

/** Safe HTML fragment for in-app preview (no outer wrapper). */
export function emailTemplateBodyToSafeFragment(body: string): string {
  return restoreAllowedFormatTags(escapeEmailText(body)).replace(
    /\n/g,
    "<br>",
  );
}

/** Stored value → HTML for a contentEditable surface. */
export function storedMessageToEditorHtml(stored: string): string {
  if (!stored) return "";
  return emailTemplateBodyToSafeFragment(stored);
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
  if (tag === "span") {
    const tags: string[] = [];
    pushStyleFormats(el, tags);
    return tags;
  }
  return [];
}

/** Serialize a contentEditable root back to the stored string format. */
export function editorHtmlToStoredMessage(root: HTMLElement): string {
  let out = "";

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "br") {
      out += "\n";
      return;
    }

    const formatTags = formatTagsForElement(el);
    for (const t of formatTags) out += `<${t}>`;

    if (tag === "div" || tag === "p") {
      if (out.length > 0 && !out.endsWith("\n")) out += "\n";
    }

    for (const child of Array.from(el.childNodes)) walk(child);

    for (let i = formatTags.length - 1; i >= 0; i -= 1) {
      out += `</${formatTags[i]}>`;
    }
  }

  for (const child of Array.from(root.childNodes)) walk(child);
  // Browsers often leave a trailing newline from a final empty block.
  return out.replace(/\n$/, "");
}
