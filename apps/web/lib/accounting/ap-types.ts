export type ApInvoiceStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "posted"
  | "reversed"
  | "void";

export type TaxCode = {
  id: string;
  code: string;
  label: string;
  treatment: "output" | "input" | "both" | "none";
  input_recoverable: boolean;
  output_account_id: string | null;
  input_account_id: string | null;
  vat201_box: string | null;
  active: boolean;
};

export type TaxRate = {
  id: string;
  tax_code_id: string;
  rate: number;
  valid_from: string;
  valid_to: string | null;
};

export type SupplierKind = "cos" | "opex_general" | "opex" | "uncategorized";

export const SUPPLIER_KIND_OPTIONS: {
  kind: SupplierKind;
  href: string;
  label: string;
  shortLabel: string;
  picker: string;
  empty: string;
  createLabel: string;
  editLabel: string;
}[] = [
  {
    kind: "cos",
    href: "/accounting/invoices/suppliers",
    label: "(COS) F&B Suppliers",
    shortLabel: "COS",
    picker: "COS",
    empty: "No F&B suppliers yet.",
    createLabel: "New supplier",
    editLabel: "Edit supplier",
  },
  {
    kind: "opex_general",
    href: "/accounting/invoices/suppliers/general",
    label: "(OPEX) General Suppliers",
    shortLabel: "General",
    picker: "OPEX General",
    empty: "No general suppliers yet.",
    createLabel: "New supplier",
    editLabel: "Edit supplier",
  },
  {
    kind: "opex",
    href: "/accounting/invoices/suppliers/opex",
    label: "(OPEX) Contractors",
    shortLabel: "Contractors",
    picker: "OPEX Contractor",
    empty: "No contractors yet.",
    createLabel: "New contractor",
    editLabel: "Edit contractor",
  },
  {
    kind: "uncategorized",
    href: "/accounting/invoices/suppliers/uncategorized",
    label: "Uncategorized",
    shortLabel: "Uncategorized",
    picker: "Uncategorized",
    empty: "No uncategorized suppliers.",
    createLabel: "New uncategorized supplier",
    editLabel: "Categorize supplier",
  },
];

export function supplierKindHref(kind: SupplierKind) {
  return (
    SUPPLIER_KIND_OPTIONS.find((option) => option.kind === kind)?.href ??
    "/accounting/invoices/suppliers"
  );
}

export function isSupplierKind(value: string): value is SupplierKind {
  return SUPPLIER_KIND_OPTIONS.some((option) => option.kind === value);
}

export function supplierKindPickerLabel(kind: string | null | undefined) {
  return (
    SUPPLIER_KIND_OPTIONS.find((option) => option.kind === kind)?.picker ??
    "COS"
  );
}

export type Supplier = {
  id: string;
  entity_id: string;
  venue_id: string;
  name: string;
  nickname: string | null;
  trn: string | null;
  kind: SupplierKind;
  default_expense_account_id: string | null;
  payment_terms_days: number;
  default_tax_code_id: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ApInvoiceLine = {
  id: string;
  ap_invoice_id: string;
  line_no: number;
  description: string;
  account_id: string;
  quantity: number;
  unit_price: number;
  net_amount: number;
  tax_code_id: string;
  tax_amount: number;
  gross_amount: number;
  dimensions: Record<string, string>;
  accounts?: { id: string; code: string; name: string } | null;
  tax_codes?: { id: string; code: string; label: string } | null;
};

/** What the supplier document is. Credit notes carry negative amounts. */
export type ApDocumentType = "invoice" | "delivery_note" | "credit_note";

export const AP_DOCUMENT_TYPE_LABELS: Record<ApDocumentType, string> = {
  invoice: "Invoice",
  delivery_note: "Delivery Note",
  credit_note: "Credit Note",
};

export type ApInvoice = {
  id: string;
  document_type: ApDocumentType;
  entity_id: string;
  venue_id: string;
  invoice_no: string;
  supplier_id: string;
  /** Null on a delivery note until the supplier's invoice number arrives. */
  supplier_invoice_no: string | null;
  /** Delivery notes only. */
  delivery_note_no: string | null;
  invoice_date: string;
  due_date: string;
  currency: string;
  fx_rate: number;
  memo: string | null;
  status: ApInvoiceStatus;
  subtotal_net: number;
  tax_total: number;
  total_gross: number;
  journal_entry_id: string | null;
  attachment_url: string | null;
  rejection_reason: string | null;
  created_by: string | null;
  submitted_by: string | null;
  approved_by: string | null;
  posted_by: string | null;
  posted_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  suppliers?: Pick<Supplier, "id" | "name" | "trn" | "payment_terms_days"> | null;
  venues?: { id: string; name: string; slug: string } | null;
  legal_entities?: { id: string; entity_code: string; name: string } | null;
  ap_invoice_lines?: ApInvoiceLine[];
  journal_entries?: {
    id: string;
    entry_no: string;
    status: string;
    entry_date: string;
  } | null;
};

export type ApInvoiceLineInput = {
  description: string;
  accountId: string;
  quantity: number;
  unitPrice: number;
  netAmount: number;
  taxCodeId: string;
  dimensions?: Record<string, string>;
};

export const AP_STATUS_LABELS: Record<ApInvoiceStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  posted: "Posted",
  reversed: "Reversed",
  void: "Void",
};

export const PURCHASE_TAX_CODES = ["SP", "ZP", "BL", "RC"] as const;
