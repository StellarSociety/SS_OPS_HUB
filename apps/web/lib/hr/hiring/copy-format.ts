/**
 * Sanitized HTML subset for hiring intro / end / description copy.
 * Plain text is preserved and line breaks become <br>.
 */

const ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "strike",
  "br",
  "p",
  "div",
  "ul",
  "ol",
  "li",
  "a",
  "span",
  "blockquote",
  "h3",
  "sup",
  "sub",
  "hr",
  "font",
]);

const VOID_TAGS = new Set(["br", "hr"]);

const FONT_SIZE_MAP: Record<string, string> = {
  "1": "12px",
  "2": "14px",
  "3": "16px",
  "4": "18px",
  "5": "22px",
  "6": "28px",
  "7": "36px",
};

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, "\u00A0")
    .replace(/&#160;/g, "\u00A0")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function escapeText(text: string): string {
  return decodeBasicEntities(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function isSafeHref(href: string): boolean {
  const value = href.trim();
  if (!value) return false;
  if (/^\s*(javascript|vbscript|data):/i.test(value)) return false;
  return /^(https?:|mailto:|\/|#)/i.test(value);
}

function isSafeStyleValue(prop: string, value: string): boolean {
  if (/expression|javascript:|url\s*\(/i.test(value)) return false;
  if (prop === "text-align") return /^(left|right|center|justify)$/i.test(value);
  if (prop === "color" || prop === "background-color") {
    return /^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)$/i.test(value);
  }
  if (prop === "font-size") return /^\d+(\.\d+)?(px|pt|em|rem)$/i.test(value);
  if (prop === "font-weight") return /^(normal|bold|bolder|[1-9]00)$/i.test(value);
  if (prop === "font-style") return /^(normal|italic)$/i.test(value);
  if (prop === "text-decoration" || prop === "text-decoration-line") {
    return /^(none|underline|line-through|underline line-through)$/i.test(value);
  }
  if (prop === "font-family") {
    return /^[a-z0-9\s,"'-]+$/i.test(value);
  }
  return false;
}

function sanitizeStyle(raw: string): string {
  const kept: string[] = [];
  for (const part of raw.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!value) continue;
    if (
      prop !== "text-align" &&
      prop !== "color" &&
      prop !== "background-color" &&
      prop !== "font-size" &&
      prop !== "font-weight" &&
      prop !== "font-style" &&
      prop !== "text-decoration" &&
      prop !== "text-decoration-line" &&
      prop !== "font-family"
    ) {
      continue;
    }
    if (!isSafeStyleValue(prop, value)) continue;
    kept.push(`${prop}: ${value}`);
  }
  return kept.join("; ");
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re =
    /([a-zA-Z:_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    out[match[1]!.toLowerCase()] = unescapeAttr(
      match[2] ?? match[3] ?? match[4] ?? "",
    );
  }
  return out;
}

function serializeOpen(
  tag: string,
  attrs: Record<string, string>,
): { tag: string; html: string } {
  if (tag === "font") {
    const styleBits: string[] = [];
    if (attrs.color) styleBits.push(`color: ${attrs.color}`);
    if (attrs.face) styleBits.push(`font-family: ${attrs.face}`);
    const mapped = attrs.size ? FONT_SIZE_MAP[attrs.size] : null;
    if (mapped) styleBits.push(`font-size: ${mapped}`);
    const style = sanitizeStyle(styleBits.join("; "));
    if (!style) return { tag: "span", html: "<span>" };
    return { tag: "span", html: `<span style="${escapeAttr(style)}">` };
  }

  const allowed: string[] = [];
  if (tag === "a") {
    const href = attrs.href ?? "";
    if (!isSafeHref(href)) return { tag: "span", html: "<span>" };
    allowed.push(`href="${escapeAttr(href.trim())}"`);
    if (href.startsWith("http")) {
      allowed.push('target="_blank"', 'rel="noopener noreferrer"');
    }
  }

  if (
    tag === "p" ||
    tag === "div" ||
    tag === "span" ||
    tag === "h3" ||
    tag === "blockquote" ||
    tag === "li"
  ) {
    const style = attrs.style ? sanitizeStyle(attrs.style) : "";
    if (style) allowed.push(`style="${escapeAttr(style)}"`);
  }

  const attrHtml = allowed.length > 0 ? ` ${allowed.join(" ")}` : "";
  if (VOID_TAGS.has(tag)) return { tag, html: `<${tag}>` };
  return { tag, html: `<${tag}${attrHtml}>` };
}

export function sanitizeHiringCopyHtml(raw: string): string {
  const input = String(raw ?? "").replace(/\0/g, "");
  if (!input.trim()) return "";

  const stripped = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(?:script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(
      /<(?:script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\/(?:script|style|iframe|object|embed|link|meta)>/gi,
      "",
    )
    .replace(/<(?:script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "");

  if (!/<[a-z]/i.test(stripped)) {
    return escapeText(stripped.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>");
  }

  let out = "";
  const stack: string[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\s*\/)?\s*>|[^<]+/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(stripped))) {
    const full = match[0];
    if (!full.startsWith("<")) {
      out += escapeText(full);
      continue;
    }

    const tag = match[1]!.toLowerCase();
    const closing = full.startsWith("</");
    const selfClosing = Boolean(match[3]) || VOID_TAGS.has(tag);

    if (!ALLOWED_TAGS.has(tag)) continue;

    if (closing) {
      const index = stack.lastIndexOf(tag === "font" ? "span" : tag);
      if (index < 0) continue;
      while (stack.length > index) {
        const open = stack.pop();
        if (open) out += `</${open}>`;
      }
      continue;
    }

    const parsed = serializeOpen(tag, parseAttrs(match[2] ?? ""));
    out += parsed.html;
    if (!selfClosing && !VOID_TAGS.has(parsed.tag)) stack.push(parsed.tag);
  }

  while (stack.length > 0) {
    const open = stack.pop();
    if (open) out += `</${open}>`;
  }

  return out;
}

export function hiringCopyIsEmpty(html: string): boolean {
  return sanitizeHiringCopyHtml(html)
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim()
    .length === 0;
}
