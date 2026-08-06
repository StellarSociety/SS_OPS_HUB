export type VenueCashExpenseLineRecord = {
  id: string;
  venue_id: string;
  sale_date: string;
  description: string;
  gross_gs: number;
  vat_gs: number;
  net_gs: number;
  pchase_portal: boolean;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueCashExpenseLineInput = {
  description: string;
  gross_gs: number;
  vat_gs: number;
  net_gs: number;
  pchase_portal: boolean;
  sort_order: number;
};
