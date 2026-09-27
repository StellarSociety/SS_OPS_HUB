export type JournalStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "posted"
  | "reversed";

export type JournalSourceType =
  | "manual"
  | "sales"
  | "ap"
  | "ar"
  | "payroll"
  | "inventory"
  | "fa"
  | "bank"
  | "fx"
  | "accrual";

export type JournalLine = {
  id: string;
  journal_entry_id: string;
  line_no: number;
  account_id: string;
  debit: number;
  credit: number;
  tax_code_id: string | null;
  description: string | null;
  dimensions: Record<string, string>;
  accounts?: { id: string; code: string; name: string } | null;
  tax_codes?: { id: string; code: string; label: string } | null;
};

export type JournalEntry = {
  id: string;
  entity_id: string;
  venue_id: string;
  entry_no: string;
  entry_date: string;
  period_id: string;
  memo: string | null;
  status: JournalStatus;
  source_type: JournalSourceType;
  source_ref: string | null;
  created_by: string | null;
  approved_by: string | null;
  posted_by: string | null;
  posted_at: string | null;
  reversal_of: string | null;
  reversed_by: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
  total_debit: number;
  total_credit: number;
  journal_lines?: JournalLine[];
  legal_entities?: {
    id: string;
    entity_code: string;
    name: string;
  } | null;
  venues?: { id: string; name: string; slug: string } | null;
  /** Populated when reverse links are loaded. */
  reversal_of_entry?: { id: string; entry_no: string } | null;
  reversed_by_entry?: { id: string; entry_no: string } | null;
};

export const JOURNAL_STATUS_LABELS: Record<JournalStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  posted: "Posted",
  reversed: "Reversed",
};

export const JOURNAL_SOURCE_LABELS: Record<JournalSourceType, string> = {
  manual: "Manual",
  sales: "Sales",
  ap: "Accounts payable",
  ar: "Accounts receivable",
  payroll: "Payroll",
  inventory: "Inventory",
  fa: "Fixed assets",
  bank: "Bank",
  fx: "FX",
  accrual: "Accrual",
};
