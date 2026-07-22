export const VOUCHER_STATUSES = [
  "draft",
  "issued",
  "redeemed",
  "cancelled",
  "expired",
] as const;

export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  redeemed: "Redeemed",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const VOUCHER_SOURCES = ["manual", "waiter_comment", "import"] as const;

export type VoucherSource = (typeof VOUCHER_SOURCES)[number];

export type VenueVoucher = {
  id: string;
  venue_id: string;
  voucher_number: string;
  voucher_name: string;
  face_value_gs: number;
  status: VoucherStatus;
  issued_date: string;
  redeemed_date: string | null;
  expires_date: string | null;
  /** Tender used to pay for the voucher when issued (Cash, Visa, …). */
  payment_form_tender_id: string | null;
  purchaser_name: string;
  recipient_name: string;
  notes: string;
  source: VoucherSource;
  source_waiter_sales_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueVoucherInput = {
  id?: string;
  voucher_number: string;
  voucher_name: string;
  face_value_gs: number;
  status: VoucherStatus;
  issued_date: string;
  redeemed_date: string | null;
  expires_date: string | null;
  payment_form_tender_id: string | null;
  purchaser_name: string;
  recipient_name: string;
  notes: string;
  source?: VoucherSource;
  source_waiter_sales_id?: string | null;
};

export type VoucherTenderDay = {
  sale_date: string;
  issue_gs: number;
  redeem_gs: number;
};

export type VoucherTenderTotals = {
  issue_gs: number;
  redeem_gs: number;
  days: VoucherTenderDay[];
};

/** Per-day allocation of ledger vouchers against a POS tender total. */
export type VoucherDayAllocation = {
  sale_date: string;
  /** @deprecated Prefer issue_gs / redeem_gs for display; kept for redeem/issue builders. */
  tender_gs: number;
  /** Daily / waiter Voucher Issue tender total for this date (issue workspace). */
  issue_gs?: number;
  /** Daily / waiter Voucher Redeem tender total for this date (redeem workspace). */
  redeem_gs?: number;
  allocated_gs: number;
  remaining_gs: number;
  voucher_count: number;
  vouchers: VenueVoucher[];
  balanced: boolean;
};

export type VoucherLedgerSummary = {
  outstanding_gs: number;
  outstanding_count: number;
  draft_gs: number;
  draft_count: number;
  issued_all_time_gs: number;
  issued_all_time_count: number;
  redeemed_gs: number;
  redeemed_count: number;
  cancelled_gs: number;
  cancelled_count: number;
  expired_gs: number;
  expired_count: number;
};

export type VoucherReconciliation = {
  tender_issue_gs: number;
  tender_redeem_gs: number;
  ledger_issued_gs: number;
  ledger_redeemed_gs: number;
  issue_variance_gs: number;
  redeem_variance_gs: number;
};

export type ParsedWaiterVoucherComment = {
  voucher_name: string;
  voucher_number: string;
  face_value_gs: number;
  sale_date: string;
  waiter_sales_id: string;
  raw: string;
};
