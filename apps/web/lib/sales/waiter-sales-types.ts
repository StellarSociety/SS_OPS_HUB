export type VenueTenderStatus = "active" | "inactive";

export type VenueTender = {
  id: string;
  venue_id: string;
  name: string;
  status: VenueTenderStatus;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export const VENUE_TENDER_STATUS_LABELS: Record<VenueTenderStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export type VenueWaiterDailySalesRecord = {
  id: string;
  venue_id: string;
  waiter_id: string;
  sale_date: string;
  total_sales_gs: number;
  total_payments_gs: number;
  gratuity_cc_gs: number;
  gratuity_cash_gs: number;
  groups_service_charge_gs: number;
  total_covers: number;
  voucher_comments: string;
  deposit_comments: string;
  on_accounts_comments: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueWaiterDailyTenderLine = {
  id: string;
  sales_id: string;
  tender_id: string;
  amount_gs: number;
};

export type VenueWaiterDailySalesEntry = VenueWaiterDailySalesRecord & {
  tender_amounts: Record<string, number>;
};

export type WaiterSalesScalarField =
  | "total_sales_gs"
  | "total_payments_gs"
  | "gratuity_cc_gs"
  | "gratuity_cash_gs"
  | "groups_service_charge_gs"
  | "total_covers";

export type ComputedWaiterSales = {
  asph: number | null;
};

export type WaiterSalesTableComputed = ComputedWaiterSales & {
  weekNumber: number;
  weekDay: string;
  tendersTotalGs: number;
  tendersTotalNet: number;
  expectedPaymentsGs: number;
  paymentsDifferenceGs: number;
  tendersDifferenceGs: number;
  isBalanced: boolean;
};

export type WaiterSalesReconciliation = {
  expectedPaymentsGs: number;
  paymentsDifferenceGs: number;
  tendersDifferenceGs: number;
  isBalanced: boolean;
};

export type VenueWaiterDailySalesRow = VenueWaiterDailySalesEntry &
  WaiterSalesTableComputed;
