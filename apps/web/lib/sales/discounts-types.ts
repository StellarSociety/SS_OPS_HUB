export type VenueDailyDiscountsRecord = {
  id: string;
  venue_id: string;
  sale_date: string;
  food_discount_gs: number;
  beverages_discount_gs: number;
  wine_discount_gs: number;
  shisha_discount_gs: number;
  others_discount_gs: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueDailyDiscountsInputField =
  | "food_discount_gs"
  | "beverages_discount_gs"
  | "wine_discount_gs"
  | "shisha_discount_gs"
  | "others_discount_gs";

export type ComputedDailyDiscounts = {
  weekNumber: number;
  weekDay: string;
  totalFoodDiscountGs: number;
  totalFoodDiscountNet: number;
  totalBeveragesDiscountGs: number;
  totalBeveragesDiscountNet: number;
  totalWineDiscountGs: number;
  totalWineDiscountNet: number;
  totalShishaDiscountGs: number;
  totalShishaDiscountNet: number;
  totalOthersDiscountGs: number;
  totalOthersDiscountNet: number;
};

export type VenueDailyDiscountsRow = VenueDailyDiscountsRecord &
  ComputedDailyDiscounts;
