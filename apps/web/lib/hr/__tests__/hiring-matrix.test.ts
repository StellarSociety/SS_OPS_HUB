import { describe, expect, it } from "vitest";
import {
  clusterHiringRadioFields,
  hiringMatrixCopy,
  hiringMatrixFieldLabel,
  splitHiringMatrixLabel,
} from "@/lib/hr/hiring/matrix";

const englishOptions = [
  "Fluent",
  "Very Good",
  "Good",
  "Need Improvement",
  "Mediocre",
];

function radio(id: string, label: string, options = englishOptions) {
  return {
    id,
    kind: "field" as const,
    field_type: "radio" as const,
    field_label: label,
    options,
    config: { instructions: "Describe your level in English Language.", options },
  };
}

describe("splitHiringMatrixLabel", () => {
  it("splits an em-dash group/row label", () => {
    expect(splitHiringMatrixLabel("English — Dialogue")).toEqual({
      group: "English",
      row: "Dialogue",
    });
  });
});

describe("hiringMatrixFieldLabel", () => {
  it("joins group and row with an em dash", () => {
    expect(hiringMatrixFieldLabel("English", "Reading")).toBe(
      "English — Reading",
    );
  });
});

describe("clusterHiringRadioFields", () => {
  it("combines consecutive radios that share 3+ choices", () => {
    const clustered = clusterHiringRadioFields([
      radio("a", "English — Dialogue"),
      radio("b", "English — Reading"),
      radio("c", "English — Writing"),
      {
        id: "d",
        kind: "field" as const,
        field_type: "short_text" as const,
        field_label: "Other",
        options: [],
      },
    ]);
    expect(clustered).toHaveLength(2);
    expect(clustered[0]).toMatchObject({ type: "matrix" });
    if (clustered[0]?.type !== "matrix") throw new Error("expected matrix");
    expect(clustered[0].items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(clustered[1]).toMatchObject({ type: "item", item: { id: "d" } });
  });

  it("leaves a single radio as its own field", () => {
    const clustered = clusterHiringRadioFields([
      radio("a", "English — Dialogue"),
    ]);
    expect(clustered).toEqual([
      { type: "item", item: expect.objectContaining({ id: "a" }) },
    ]);
  });
});

describe("hiringMatrixCopy", () => {
  it("uses the shared group name as the grid title", () => {
    expect(
      hiringMatrixCopy([
        radio("a", "English — Dialogue"),
        radio("b", "English — Reading"),
        radio("c", "English — Writing"),
      ]),
    ).toEqual({
      title: "English",
      rows: ["Dialogue", "Reading", "Writing"],
      instructions: "Describe your level in English Language.",
    });
  });
});
