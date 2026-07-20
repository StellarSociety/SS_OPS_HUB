import { formatPct } from "@/lib/sales/daily-sales-calculations";
import type { VenueTender } from "./tenders-types";
import type {
  WaiterSalesScalarField,
  WaiterSalesTableComputed,
} from "./waiter-sales-types";

export type WaiterSalesColumnKind =
  | "date"
  | "meta"
  | "input"
  | "money"
  | "count"
  | "text"
  | "difference"
  | "status";

export type WaiterSalesSection =
  | "fixed"
  | "summary"
  | "gratuity"
  | "tenders"
  | "totals"
  | "balance"
  | "comments";

export type WaiterSalesColumn = {
  key: string;
  label: string;
  kind: WaiterSalesColumnKind;
  field?: WaiterSalesScalarField | "voucher_comments" | "deposit_comments" | "on_accounts_comments";
  tenderId?: string;
  computedKey?: keyof WaiterSalesTableComputed;
  section: WaiterSalesSection;
};

export const WAITER_SALES_SECTION_LABELS: Record<WaiterSalesSection, string> = {
  fixed: "",
  summary: "Summary",
  gratuity: "Gratuity",
  tenders: "Tenders Total",
  totals: "Totals",
  balance: "Balance check",
  comments: "Comments",
};

export const WAITER_SALES_SECTIONS: WaiterSalesSection[] = [
  "fixed",
  "summary",
  "gratuity",
  "tenders",
  "totals",
  "balance",
  "comments",
];

const BASE_COLUMNS: WaiterSalesColumn[] = [
  { key: "sale_date", label: "Date", kind: "date", section: "fixed" },
  {
    key: "weekNumber",
    label: "Week #",
    kind: "meta",
    computedKey: "weekNumber",
    section: "fixed",
  },
  {
    key: "weekDay",
    label: "Week Day",
    kind: "meta",
    computedKey: "weekDay",
    section: "fixed",
  },
  {
    key: "total_sales_gs",
    label: "Sales Total",
    kind: "input",
    field: "total_sales_gs",
    section: "summary",
  },
  {
    key: "total_payments_gs",
    label: "Payment Total",
    kind: "input",
    field: "total_payments_gs",
    section: "summary",
  },
  {
    key: "total_covers",
    label: "Total Covers",
    kind: "count",
    field: "total_covers",
    section: "summary",
  },
  {
    key: "total_discounts_gs",
    label: "Total Discounts",
    kind: "input",
    field: "total_discounts_gs",
    section: "summary",
  },
  {
    key: "asph",
    label: "ASPH",
    kind: "money",
    computedKey: "asph",
    section: "summary",
  },
  {
    key: "gratuity_cc_gs",
    label: "Credit Card Gratuity",
    kind: "input",
    field: "gratuity_cc_gs",
    section: "gratuity",
  },
  {
    key: "gratuity_cash_gs",
    label: "Cash Gratuity",
    kind: "input",
    field: "gratuity_cash_gs",
    section: "gratuity",
  },
];

function groupsServiceChargeColumn(
  groupsAddedServiceChargePct: number,
): WaiterSalesColumn {
  return {
    key: "groups_service_charge_gs",
    label: `Groups SC ${formatPct(groupsAddedServiceChargePct)}%`,
    kind: "input",
    field: "groups_service_charge_gs",
    section: "gratuity",
  };
}

const AFTER_GRATUITY_COLUMNS: WaiterSalesColumn[] = [
  {
    key: "tendersTotalGs",
    label: "Tenders Total Gross",
    kind: "money",
    computedKey: "tendersTotalGs",
    section: "totals",
  },
  {
    key: "tendersTotalNet",
    label: "Tenders Total Net",
    kind: "money",
    computedKey: "tendersTotalNet",
    section: "totals",
  },
  {
    key: "expectedPaymentsGs",
    label: "Expected Total",
    kind: "money",
    computedKey: "expectedPaymentsGs",
    section: "balance",
  },
  {
    key: "paymentsDifferenceGs",
    label: "Payment Diff",
    kind: "difference",
    computedKey: "paymentsDifferenceGs",
    section: "balance",
  },
  {
    key: "tendersDifferenceGs",
    label: "Tenders Diff",
    kind: "difference",
    computedKey: "tendersDifferenceGs",
    section: "balance",
  },
  {
    key: "isBalanced",
    label: "Status",
    kind: "status",
    computedKey: "isBalanced",
    section: "balance",
  },
  {
    key: "voucher_comments",
    label: "Voucher Issue Comments",
    kind: "text",
    field: "voucher_comments",
    section: "comments",
  },
  {
    key: "deposit_comments",
    label: "Deposit Comments",
    kind: "text",
    field: "deposit_comments",
    section: "comments",
  },
  {
    key: "on_accounts_comments",
    label: "On Accounts Comments",
    kind: "text",
    field: "on_accounts_comments",
    section: "comments",
  },
];

export function buildWaiterSalesColumns(
  tenders: VenueTender[],
  groupsAddedServiceChargePct: number,
): WaiterSalesColumn[] {
  const tenderColumns: WaiterSalesColumn[] = tenders.map((tender) => ({
    key: `tender_${tender.id}`,
    label: tender.name,
    kind: "money",
    tenderId: tender.id,
    section: "tenders",
  }));

  const beforeTenders = BASE_COLUMNS.filter((col) =>
    ["fixed", "summary"].includes(col.section),
  );
  const gratuityColumns = [
    ...BASE_COLUMNS.filter((col) => col.section === "gratuity"),
    groupsServiceChargeColumn(groupsAddedServiceChargePct),
  ];

  return [
    ...beforeTenders,
    ...gratuityColumns,
    ...tenderColumns,
    ...AFTER_GRATUITY_COLUMNS,
  ];
}

export function columnsForSection(
  columns: WaiterSalesColumn[],
  section: WaiterSalesSection,
): WaiterSalesColumn[] {
  return columns.filter((col) => col.section === section);
}

export function sectionColSpan(
  columns: WaiterSalesColumn[],
  section: WaiterSalesSection,
): number {
  return columnsForSection(columns, section).length;
}
