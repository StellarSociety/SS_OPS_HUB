import "server-only";

import sanitizeHtml from "sanitize-html";
import {
  emailTemplateBodyToSafeFragment,
  escapeEmailText,
} from "@/lib/hr/email-message-format";

/**
 * Policy text is rich HTML from the policy editor. It is sanitized on save
 * (and again before sending), then given inline styles for email clients.
 */

const ALIGN = { "text-align": [/^(left|center|right|justify)$/] };

const STRICT: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "h2",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
    "hr",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    ol: ["start"],
    p: ["style"],
    h2: ["style"],
    h3: ["style"],
    h4: ["style"],
  },
  allowedStyles: { p: ALIGN, h2: ALIGN, h3: ALIGN, h4: ALIGN },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer",
    }),
  },
};

export function sanitizePolicyHtml(html: string): string {
  return sanitizeHtml(html, STRICT).trim();
}

/** True when sanitized HTML has no visible text. */
export function policyHtmlIsEmpty(html: string): boolean {
  return policyHtmlToText(html).trim().length === 0;
}

const EMAIL_STYLES: Record<string, string> = {
  p: "margin:0 0 10px;",
  h2: "margin:18px 0 8px;font-size:18px;line-height:1.35;font-weight:700;color:#3D421F;",
  h3: "margin:16px 0 6px;font-size:16px;line-height:1.4;font-weight:700;color:#3D421F;",
  h4: "margin:14px 0 6px;font-size:14px;line-height:1.4;font-weight:700;color:#3D421F;",
  ul: "margin:0 0 10px;padding-left:22px;",
  ol: "margin:0 0 10px;padding-left:22px;",
  li: "margin:0 0 4px;",
  blockquote:
    "margin:0 0 10px;padding:4px 0 4px 12px;border-left:3px solid #C9CDB0;color:#5b6038;",
  a: "color:#5f6a2a;text-decoration:underline;",
  hr: "border:0;border-top:1px solid #E2E4D6;margin:16px 0;",
};

/** Sanitized policy HTML with inline styles that email clients respect. */
export function policyHtmlToEmailHtml(html: string): string {
  const clean = sanitizePolicyHtml(html);
  const styled = sanitizeHtml(clean, {
    allowedTags: false,
    allowedAttributes: false,
    transformTags: Object.fromEntries(
      Object.entries(EMAIL_STYLES).map(([tag, base]) => [
        tag,
        (tagName: string, attribs: sanitizeHtml.Attributes) => ({
          tagName,
          attribs: { ...attribs, style: `${base}${attribs.style ?? ""}` },
        }),
      ]),
    ),
  });
  // Paragraphs inside list items should not add extra gaps.
  const tidy = styled.replace(
    /(<li[^>]*>)\s*<p style="margin:0 0 10px;/g,
    '$1<p style="margin:0;',
  );
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#3D421F;">${tidy}</div>`;
}

/** Readable plain text, used as the text part and acknowledgement record. */
export function policyHtmlToText(html: string): string {
  return sanitizeHtml(
    html
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|h2|h3|h4|blockquote|ul|ol)>/gi, "\n"),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Older policies were saved in the plain email format; turn them into HTML. */
export function legacyPolicyMessageToHtml(message: string): string {
  return message
    .split(/\n{2,}/)
    .map((block) => `<p>${emailTemplateBodyToSafeFragment(block)}</p>`)
    .join("");
}

/** Fill {{CODES}} in policy HTML, escaping each value. */
export function applyPolicyHtmlPlaceholders(
  html: string,
  vars: Record<string, string>,
): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    escapeEmailText(vars[key.toUpperCase()] ?? ""),
  );
}
