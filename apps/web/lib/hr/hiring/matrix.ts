import {
  hiringFieldChoiceOptions,
  normalizeHiringOptions,
} from "@/lib/hr/hiring/types";

export function splitHiringMatrixLabel(
  label: string,
): { group: string; row: string } | null {
  const match = label.match(/^(.*?)\s+[—–-]\s+(.+)$/u);
  if (!match?.[1] || !match[2]) return null;
  return { group: match[1].trim(), row: match[2].trim() };
}

export function hiringMatrixFieldLabel(group: string, row: string): string {
  const groupName = group.trim();
  const rowName = row.trim();
  if (groupName && rowName) return `${groupName} — ${rowName}`;
  return groupName || rowName;
}

export function hiringMatrixCopy<
  T extends {
    field_label?: string | null;
    instructions?: string | null;
    config?: { instructions?: string };
  },
>(blocks: T[]): { title: string; rows: string[]; instructions: string } {
  const labels = blocks.map((block) => (block.field_label || "Field").trim());
  const split = labels.map(splitHiringMatrixLabel);
  const sameGroup = split.every(
    (part, _, all) => part && part.group === all[0]?.group,
  );
  const title = sameGroup ? split[0]!.group : "";
  const rows = sameGroup ? split.map((part) => part!.row) : labels;
  const stripped = blocks.map((block, index) => {
    const row = rows[index] ?? "";
    const instructions = (
      block.config?.instructions ??
      block.instructions ??
      ""
    ).trim();
    if (!row) return instructions;
    return instructions
      .replace(new RegExp(`\\s*[—–-]\\s*${escapeRegExp(row)}(?=\\.?\\s*$)`, "i"), "")
      .trim();
  });
  const allSame = stripped.every((text) => text === stripped[0]);
  return {
    title,
    rows,
    instructions: allSame ? (stripped[0] ?? "") : (stripped.find(Boolean) ?? ""),
  };
}

export type HiringRadioCluster<T> =
  | { type: "item"; item: T }
  | { type: "matrix"; items: T[] };

function optionsKey(options: string[]): string {
  return options.map((option) => option.trim()).filter(Boolean).join("\0");
}

function radioOptionsFromItem<
  T extends {
    kind: string;
    field_type?: string | null;
    options?: string[];
    config?: { options?: string[] };
  },
>(item: T): string[] {
  if (item.kind !== "field" || item.field_type !== "radio") return [];
  if (item.options) return normalizeHiringOptions(item.options);
  return hiringFieldChoiceOptions("radio", item.config?.options);
}

/** Consecutive radios with the same 3+ choices become one grid on the form. */
export function clusterHiringRadioFields<
  T extends {
    kind: string;
    field_type?: string | null;
    options?: string[];
    config?: { options?: string[] };
  },
>(items: T[]): HiringRadioCluster<T>[] {
  const clusters: HiringRadioCluster<T>[] = [];
  let index = 0;
  while (index < items.length) {
    const item = items[index]!;
    const options = radioOptionsFromItem(item);
    if (options.length >= 3) {
      const group = [item];
      const key = optionsKey(options);
      while (index + group.length < items.length) {
        const next = items[index + group.length]!;
        if (optionsKey(radioOptionsFromItem(next)) !== key) break;
        group.push(next);
      }
      if (group.length >= 2) {
        clusters.push({ type: "matrix", items: group });
        index += group.length;
        continue;
      }
    }
    clusters.push({ type: "item", item });
    index += 1;
  }
  return clusters;
}

export function flattenHiringRadioClusters<T>(
  clusters: HiringRadioCluster<T>[],
): T[] {
  return clusters.flatMap((cluster) =>
    cluster.type === "matrix" ? cluster.items : [cluster.item],
  );
}

export function hiringRadioClusterIds<T extends { id: string }>(
  cluster: HiringRadioCluster<T>,
): string[] {
  return cluster.type === "matrix"
    ? cluster.items.map((item) => item.id)
    : [cluster.item.id];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
