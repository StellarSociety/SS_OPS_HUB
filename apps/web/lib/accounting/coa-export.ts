import type { Account, AccAccountType, AccNodeType, AccNormalBalance } from "./types";

const ACCOUNT_TYPE_LABELS: Record<AccAccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  cost_of_sales: "Cost of sales",
  expense: "Expense",
  other: "Other",
  depr_tax: "Depreciation & tax",
};

const NODE_TYPE_LABELS: Record<AccNodeType, string> = {
  header: "Header",
  group: "Group",
  ledger: "Ledger",
  system: "System",
};

const NORMAL_BALANCE_LABELS: Record<AccNormalBalance, string> = {
  debit: "Debit",
  credit: "Credit",
};

export const COA_EXPORT_HEADERS = [
  "Code",
  "Name",
  "Account type",
  "Node",
  "Level",
  "Parent code",
  "Parent name",
  "Hierarchy",
  "Normal balance",
  "Control account",
  "Postable",
  "Active",
] as const;

export const COA_EXPORT_COLUMN_WIDTHS = [
  12, 48, 20, 12, 10, 14, 36, 64, 16, 16, 12, 12,
];

function yesNo(value: boolean): string {
  return value ? "Yes" : "No";
}

function ancestry(account: Account, byId: Map<string, Account>): Account[] {
  const chain: Account[] = [];
  const seen = new Set<string>();
  let parentId = account.parent_id;

  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    chain.unshift(parent);
    parentId = parent.parent_id;
  }

  return chain;
}

export function coaExportRows(accounts: Account[]): (string | number)[][] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const ordered = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

  return ordered.map((account) => {
    const parents = ancestry(account, byId);
    const parent = parents.at(-1);
    const path = [...parents, account].map((row) => row.name).join(" › ");

    return [
      account.code,
      account.name,
      ACCOUNT_TYPE_LABELS[account.account_type] ?? account.account_type,
      NODE_TYPE_LABELS[account.node_type] ?? account.node_type,
      parents.length + 1,
      parent?.code ?? "",
      parent?.name ?? "",
      path,
      NORMAL_BALANCE_LABELS[account.normal_balance] ?? account.normal_balance,
      yesNo(account.is_control),
      yesNo(account.is_postable),
      yesNo(account.active),
    ];
  });
}

export function coaExportFilename(date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  return `chart-of-accounts-${iso}.xlsx`;
}
