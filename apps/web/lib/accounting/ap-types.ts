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

export type Supplier = {
  id: string;
  entity_id: string;
  venue_id: string;
  name: string;
  trn: string | null;
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

export type ApInvoice = {
  id: string;
  entity_id: string;
  venue_id: string;
  invoice_no: string;
  supplier_id: string;
  supplier_invoice_no: string;
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
