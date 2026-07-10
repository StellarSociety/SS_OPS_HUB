export type VenueWaiterSalesSettings = {
  venue_id: string;
  groups_added_service_charge_pct: number;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_WAITER_SALES_SETTINGS = {
  groups_added_service_charge_pct: 10,
} as const;

export type WaiterSalesSettingsInput = {
  groups_added_service_charge_pct: number;
};
