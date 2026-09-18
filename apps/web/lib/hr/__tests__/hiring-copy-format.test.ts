import { describe, expect, it } from "vitest";
import {
  hiringCopyIsEmpty,
  sanitizeHiringCopyHtml,
} from "@/lib/hr/hiring/copy-format";
import { fillHiringCopyTokens } from "@/lib/hr/hiring/types";

describe("sanitizeHiringCopyHtml", () => {
  it("keeps plain text and converts line breaks", () => {
    expect(sanitizeHiringCopyHtml("Join Orilla.\nApply now.")).toBe(
      "Join Orilla.<br>Apply now.",
    );
  });

  it("keeps allowed formatting and links", () => {
    const html = '<p style="text-align:center"><b>Hello</b> <a href="https://orilla.example">site</a></p>';
    expect(sanitizeHiringCopyHtml(html)).toContain("<b>Hello</b>");
    expect(sanitizeHiringCopyHtml(html)).toContain(
      'href="https://orilla.example"',
    );
    expect(sanitizeHiringCopyHtml(html)).toContain('rel="noopener noreferrer"');
  });

  it("strips scripts and unsafe urls", () => {
    const dirty =
      '<p>Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>';
    const clean = sanitizeHiringCopyHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/javascript/i);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toMatch(/<img/i);
  });

  it("treats empty markup as empty copy", () => {
    expect(hiringCopyIsEmpty("<p><br></p>")).toBe(true);
    expect(hiringCopyIsEmpty("<b>Live</b>")).toBe(false);
  });

  it("does not double-escape nbsp entities", () => {
    expect(sanitizeHiringCopyHtml("Chef&nbsp;Saradhi")).toBe("Chef\u00A0Saradhi");
    expect(sanitizeHiringCopyHtml("<p>Chef&amp;nbsp;Saradhi</p>")).toBe(
      "<p>Chef\u00A0Saradhi</p>",
    );
  });
});

describe("fillHiringCopyTokens", () => {
  it("replaces {positions} with a comma-separated list", () => {
    expect(
      fillHiringCopyTokens(
        "Hiring for {positions} and more!",
        { positions: "Chefs, Line Cooks, Commis" },
      ),
    ).toBe("Hiring for Chefs, Line Cooks, Commis and more!");
  });

  it("clears the token when no positions are selected", () => {
    expect(fillHiringCopyTokens("Roles: {positions}.", { positions: "" })).toBe(
      "Roles: .",
    );
  });
});
