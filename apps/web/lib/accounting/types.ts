export const ACCOUNTING_MODULE_KEY = "accounting" as const;

/** Feature keys — module_key is always `accounting`. */
export const ACCOUNTING_FEATURES = {
  overview: "overview",
  gl: "gl",
  ap: "ap",
  ar: "ar",
  banking: "banking",
  sales: "sales",
  inventory: "inventory",
  payroll: "payroll",
  fixedAssets: "fixed-assets",
  tax: "tax",
  reports: "reports",
  settings: "settings",
} as const;

export type AccountingFeatureKey =
  (typeof ACCOUNTING_FEATURES)[keyof typeof ACCOUNTING_FEATURES];

export type AccEmirate =
  | "abu_dhabi"
  | "dubai"
  | "sharjah"
  | "ajman"
  | "umm_al_quwain"
  | "ras_al_khaimah"
  | "fujairah";

export type AccVatFilingFrequency = "monthly" | "quarterly";
export type AccFiscalPeriodStatus = "open" | "closed";
export type AccAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "cost_of_sales"
  | "expense"
  | "other"
  | "depr_tax";
export type AccNodeType = "header" | "group" | "ledger" | "system";
export type AccNormalBalance = "debit" | "credit";
export type AccDimensionStatus = "off" | "optional" | "required";
export type AccSequenceReset = "never" | "yearly" | "monthly";

export type LegalEntity = {
  id: string;
  entity_code: string;
  name: string;
  trn: string | null;
  trade_licence_no: string | null;
  licensing_authority: string | null;
  emirate: AccEmirate;
  functional_currency: string;
  vat_filing_frequency: AccVatFilingFrequency;
  first_open_period: string;
  fiscal_year_start_month: number;
  created_at: string;
  updated_at: string;
};

export type VenueEntity = {
  id: string;
  venue_id: string;
  entity_id: string;
  emirate_of_supply: AccEmirate;
  notes: string | null;
  created_at: string;
  updated_at: string;
  legal_entities?: Pick<LegalEntity, "id" | "entity_code" | "name" | "trn"> | null;
  venues?: { id: string; slug: string; name: string } | null;
};

export type FiscalPeriod = {
  id: string;
  entity_id: string;
  period: string;
  status: AccFiscalPeriodStatus;
  closed_by: string | null;
  closed_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
  created_at: string;
};

export type Account = {
  id: string;
  code: string;
  name: string;
  account_type: AccAccountType;
  node_type: AccNodeType;
  parent_id: string | null;
  normal_balance: AccNormalBalance;
  is_control: boolean;
  is_postable: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Dimension = {
  id: string;
  key: string;
  label: string;
  status: AccDimensionStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DimensionRequirement = {
  id: string;
  dimension_id: string;
  account_range_from: string;
  account_range_to: string;
};

export type DimensionValue = {
  id: string;
  dimension_id: string;
  value_code: string;
  label: string;
  meta: Record<string, unknown>;
  active: boolean;
  sort_order: number;
  created_at: string;
};

export type SystemDefaultAccount = {
  key: string;
  account_id: string;
  label: string;
  updated_at: string;
  accounts?: Pick<Account, "id" | "code" | "name"> | null;
};

export type DocumentSequence = {
  id: string;
  entity_id: string;
  doc_type: string;
  prefix: string;
  padding: number;
  reset_rule: AccSequenceReset;
  current_value: number;
  last_reset_period: string | null;
  created_at: string;
  updated_at: string;
};

export const EMIRATE_OPTIONS: { value: AccEmirate; label: string }[] = [
  { value: "abu_dhabi", label: "Abu Dhabi" },
  { value: "dubai", label: "Dubai" },
  { value: "sharjah", label: "Sharjah" },
  { value: "ajman", label: "Ajman" },
  { value: "umm_al_quwain", label: "Umm Al Quwain" },
  { value: "ras_al_khaimah", label: "Ras Al Khaimah" },
  { value: "fujairah", label: "Fujairah" },
];
