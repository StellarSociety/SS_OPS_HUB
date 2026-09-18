import { describe, expect, it } from "vitest";
import {
  hiringBodyPageLabel,
  hiringBodyPageNumberAt,
  splitHiringBodyPages,
} from "@/lib/hr/hiring/types";

describe("splitHiringBodyPages", () => {
  it("keeps a single page when there are no divisions", () => {
    expect(
      splitHiringBodyPages([
        { kind: "field", id: "a" },
        { kind: "title", id: "b" },
      ]),
    ).toEqual([
      [
        { kind: "field", id: "a" },
        { kind: "title", id: "b" },
      ],
    ]);
  });

  it("splits on page division blocks and skips empty pages", () => {
    expect(
      splitHiringBodyPages([
        { kind: "field", id: "a" },
        { kind: "page", id: "p1" },
        { kind: "title", id: "b" },
        { kind: "page", id: "p2" },
        { kind: "page", id: "p3" },
        { kind: "field", id: "c" },
      ]),
    ).toEqual([
      [{ kind: "field", id: "a" }],
      [{ kind: "title", id: "b" }],
      [{ kind: "field", id: "c" }],
    ]);
  });

  it("returns one empty page when there are no content blocks", () => {
    expect(splitHiringBodyPages([{ kind: "page", id: "p1" }])).toEqual([[]]);
    expect(splitHiringBodyPages([])).toEqual([[]]);
  });
});

describe("hiringBodyPageNumberAt", () => {
  it("starts at 1 and increments after each page division", () => {
    const blocks = [
      { kind: "field" },
      { kind: "page" },
      { kind: "field" },
    ];
    expect(hiringBodyPageNumberAt(blocks, 0)).toBe(1);
    expect(hiringBodyPageNumberAt(blocks, 1)).toBe(2);
    expect(hiringBodyPageNumberAt(blocks, 2)).toBe(2);
    expect(hiringBodyPageLabel(2)).toBe("BODY PAGE 2");
  });
});
