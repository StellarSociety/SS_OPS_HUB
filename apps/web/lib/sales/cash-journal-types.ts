export type VenueCashJournalRecord = {
  id: string;
  venue_id: string;
  sale_date: string;
  /** Null means fall back to Daily Snap opening till. */
  open_till_gs: number | null;
  cash_withdraw_gs: number;
  cash_expenses_gs: number;
  cash_deposit_gs: number;
  /** Null means fall back to Daily Snap closing till. */
  closing_till_gs: number | null;
  comments: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};
