/**
 * Canonical payslip earnings order:
 * Basic → Accommodation → Transportation → other fixed → variables → deductions.
 */

const FIXED_CODE_RANK: Record<string, number> = {
  BASIC: 1,
  ACCOM: 2,
  ACCOM_WITHHELD: 2,
  TRANSP: 3,
  TRANSP_WITHHELD: 3,
};

function categoryRank(category: string | null | undefined): number {
  const c = String(category ?? "")
    .trim()
    .toLowerCase();
  if (c === "fixed") return 1;
  if (c === "variable" || c === "addon") return 2;
  if (c === "deduction") return 3;
  return 9;
}

function fixedRank(line: {
  code?: string | null;
  label?: string | null;
}): number {
  const code = String(line.code ?? "")
    .trim()
    .toUpperCase();
  if (code && FIXED_CODE_RANK[code] != null) return FIXED_CODE_RANK[code]!;

  const label = String(line.label ?? "")
    .trim()
    .toLowerCase();
  if (label.startsWith("basic")) return 1;
  if (label.includes("accommodation")) return 2;
  if (label.includes("transport")) return 3;
  return 50;
}

export function comparePayslipLines(
  a: {
    category?: string | null;
    code?: string | null;
    label?: string | null;
    sortOrder?: number | null;
  },
  b: {
    category?: string | null;
    code?: string | null;
    label?: string | null;
    sortOrder?: number | null;
  },
): number {
  const catA = categoryRank(a.category);
  const catB = categoryRank(b.category);
  if (catA !== catB) return catA - catB;

  if (catA === 1) {
    const fixedA = fixedRank(a);
    const fixedB = fixedRank(b);
    if (fixedA !== fixedB) return fixedA - fixedB;
  }

  const sortA = Number(a.sortOrder);
  const sortB = Number(b.sortOrder);
  if (Number.isFinite(sortA) && Number.isFinite(sortB) && sortA !== sortB) {
    return sortA - sortB;
  }

  return String(a.label ?? "").localeCompare(String(b.label ?? ""));
}

export function sortPayslipLines<
  T extends {
    category?: string | null;
    code?: string | null;
    label?: string | null;
    sortOrder?: number | null;
  },
>(lines: T[]): T[] {
  return [...lines].sort(comparePayslipLines);
}
