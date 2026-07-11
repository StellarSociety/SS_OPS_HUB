export type VenueSalesTaxSettings = {
  venue_id: string;
  municipality_fee_pct: number;
  vat_pct: number;
  service_charge_pct: number;
  vat_on_service_charge_pct: number;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_TAX_SETTINGS = {
  municipality_fee_pct: 7,
  vat_pct: 5,
  service_charge_pct: 10,
  vat_on_service_charge_pct: 5,
} as const;

export type VenueDailySalesRecord = {
  id: string;
  venue_id: string;
  sale_date: string;
  lunch_food_gs: number;
  lunch_beverages_gs: number;
  lunch_wine_gs: number;
  lunch_shisha_gs: number;
  lunch_tobacco_gs: number;
  lunch_others_gs: number;
  lunch_service_fees_gs: number;
  lunch_covers: number;
  lunch_bookings: number;
  lunch_walkin_tables: number;
  lunch_walkin_covers: number;
  dinner_food_gs: number;
  dinner_beverages_gs: number;
  dinner_wine_gs: number;
  dinner_shisha_gs: number;
  dinner_tobacco_gs: number;
  dinner_others_gs: number;
  dinner_service_fees_gs: number;
  dinner_covers: number;
  dinner_bookings: number;
  dinner_walkin_tables: number;
  dinner_walkin_covers: number;
  all_day_discount_gs: number;
  vat_collected_gs: number;
  municipality_fee_collected_gs: number;
  service_charge_collected_gs: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueDailySalesInputField =
  | "lunch_food_gs"
  | "lunch_beverages_gs"
  | "lunch_wine_gs"
  | "lunch_shisha_gs"
  | "lunch_tobacco_gs"
  | "lunch_others_gs"
  | "lunch_service_fees_gs"
  | "lunch_covers"
  | "lunch_bookings"
  | "lunch_walkin_tables"
  | "lunch_walkin_covers"
  | "dinner_food_gs"
  | "dinner_beverages_gs"
  | "dinner_wine_gs"
  | "dinner_shisha_gs"
  | "dinner_tobacco_gs"
  | "dinner_others_gs"
  | "dinner_service_fees_gs"
  | "dinner_covers"
  | "dinner_bookings"
  | "dinner_walkin_tables"
  | "dinner_walkin_covers"
  | "all_day_discount_gs"
  | "vat_collected_gs"
  | "municipality_fee_collected_gs"
  | "service_charge_collected_gs";

export type ComputedDailySales = {
  weekNumber: number;
  weekDay: string;
  lunchTotalGs: number;
  lunchTotalNet: number;
  dinnerTotalGs: number;
  dinnerTotalNet: number;
  totalFoodGs: number;
  totalFoodNet: number;
  totalBeveragesGs: number;
  totalBeveragesNet: number;
  totalWineGs: number;
  totalWineNet: number;
  totalShishaGs: number;
  totalShishaNet: number;
  totalTobaccoGs: number;
  totalTobaccoNet: number;
  totalOthersGs: number;
  totalOthersNet: number;
  totalServiceFeesGs: number;
  totalServiceFeesNet: number;
  totalVenueGs: number;
  totalVenueNet: number;
  totalCovers: number;
  totalBookings: number;
  totalWalkinTables: number;
  totalWalkinCovers: number;
  foodLunchAsph: number | null;
  foodDinnerAsph: number | null;
  beveragesLunchAsph: number | null;
  beveragesDinnerAsph: number | null;
  wineLunchAsph: number | null;
  wineDinnerAsph: number | null;
  shishaLunchAsph: number | null;
  shishaDinnerAsph: number | null;
  totalVenueAllDayAsph: number | null;
  totalVenueLunchAsph: number | null;
  totalVenueDinnerAsph: number | null;
  apsAllDay: number | null;
  apsLunch: number | null;
  apsDinner: number | null;
};

export type VenueDailySalesRow = VenueDailySalesRecord & ComputedDailySales;

export type TaxSettingsInput = {
  municipality_fee_pct: number;
  vat_pct: number;
  service_charge_pct: number;
  vat_on_service_charge_pct: number;
};
