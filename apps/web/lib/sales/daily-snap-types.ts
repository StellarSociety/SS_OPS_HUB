export type VenueDailySnapNotes = {
  id: string;
  venue_id: string;
  sale_date: string;
  eighty_six_lunch: string;
  eighty_six_dinner: string;
  service_comments_lunch: string;
  service_comments_dinner: string;
  cash_drawer_opening_gs: number;
  cash_drawer_closing_gs: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueDailySnapEvent = {
  id: string;
  venue_id: string;
  sale_date: string;
  event_name: string;
  guest_count: number;
  package_name: string;
  total_pay_gs: number;
  service_comments: string;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueDailySnapDiscountLine = {
  id: string;
  venue_id: string;
  sale_date: string;
  table_number: string;
  time_of_day: string;
  guest_name: string;
  reason: string;
  amount_gs: number;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueMonthlyForecast = {
  id: string;
  venue_id: string;
  month_key: string;
  forecast_revenue_gs: number;
  forecast_covers: number;
  forecast_venue_asph: number;
  forecast_food_asph: number;
  forecast_beverages_asph: number;
  forecast_wine_asph: number;
  forecast_shisha_asph: number;
  forecast_other_asph: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DailySnapRevenueCenterRow = {
  label: string;
  lunchGs: number;
  dinnerGs: number;
  totalGs: number;
};

export type DailySnapWaiterRow = {
  waiterId: string;
  waiterName: string;
  salesGs: number;
  covers: number;
  asph: number | null;
  gratuityCcGs: number;
  gratuityCashGs: number;
  salesSharePct: number | null;
  salesTrendPct: number | null;
  asphTrendPct: number | null;
};

export type DailySnapTenderRow = {
  tenderId: string;
  tenderName: string;
  amountGs: number;
};

export type DailySnapForecastCard = {
  /** Full-period target (day / week / month). */
  periodTargetGs: number;
  /** Sales achieved so far within the period. */
  toDateActualGs: number;
  /** Target that should have been achieved so far within the period. */
  toDateTargetGs: number;
  /** toDateActualGs - toDateTargetGs. */
  deviationGs: number;
  /** Deviation as a percentage of the to-date target. */
  deviationPct: number | null;
  hasForecast: boolean;
};

export type DailySnapPeriodComparison = {
  currentGs: number;
  previousGs: number;
  differenceGs: number;
  differencePct: number | null;
  hasPreviousData: boolean;
};

export type DailySnapVerification = {
  totalRevenueGs: number;
  totalTendersGs: number;
  gratuityCcGs: number;
  tendersNetOfCcGratuityGs: number;
  totalWaiterSalesGs: number;
  revenueVsWaiterDifferenceGs: number;
  revenueVsTendersNetDifferenceGs: number;
  waiterVsTendersNetDifferenceGs: number;
  isBalanced: boolean;
  hasData: boolean;
};

export type DailySnapSnapshot = {
  saleDate: string;
  hasDailySales: boolean;
  hasWaiterSales: boolean;
  hasDiscounts: boolean;
  totalRevenueGs: number;
  totalRevenueNetGs: number;
  totalCovers: number;
  totalBookings: number;
  totalWalkinTables: number;
  totalWalkinCovers: number;
  averageSpend: number | null;
  lunchRevenueGs: number;
  lunchRevenueNetGs: number;
  dinnerRevenueGs: number;
  dinnerRevenueNetGs: number;
  revenueCenters: DailySnapRevenueCenterRow[];
  totalDiscountGs: number;
  discountCategories: DailySnapRevenueCenterRow[];
  waiterRows: DailySnapWaiterRow[];
  waiterTotalSalesGs: number;
  waiterTotalCovers: number;
  gratuityCcGs: number;
  gratuityCashGs: number;
  gratuityTotalGs: number;
  tenderRows: DailySnapTenderRow[];
  cashTenderGs: number;
  verification: DailySnapVerification;
  dailyForecast: DailySnapForecastCard;
  weeklyForecast: DailySnapForecastCard;
  monthlyForecast: DailySnapForecastCard;
  weekToDateRevenue: DailySnapPeriodComparison;
  monthToDateRevenue: DailySnapPeriodComparison;
};
