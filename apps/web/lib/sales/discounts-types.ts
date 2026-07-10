export type VenueDailyDiscountsRecord = {
  id: string;
  venue_id: string;
  sale_date: string;
  lunch_food_discount_gs: number;
  lunch_beverages_discount_gs: number;
  lunch_wine_discount_gs: number;
  lunch_shisha_discount_gs: number;
  lunch_others_discount_gs: number;
  dinner_food_discount_gs: number;
  dinner_beverages_discount_gs: number;
  dinner_wine_discount_gs: number;
  dinner_shisha_discount_gs: number;
  dinner_others_discount_gs: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VenueDailyDiscountsInputField =
  | "lunch_food_discount_gs"
  | "lunch_beverages_discount_gs"
  | "lunch_wine_discount_gs"
  | "lunch_shisha_discount_gs"
  | "lunch_others_discount_gs"
  | "dinner_food_discount_gs"
  | "dinner_beverages_discount_gs"
  | "dinner_wine_discount_gs"
  | "dinner_shisha_discount_gs"
  | "dinner_others_discount_gs";

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
