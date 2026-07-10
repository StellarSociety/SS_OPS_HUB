import {
  getIsoWeekNumber,
  getWeekDayLabel,
  grossToNet,
} from "./daily-sales-calculations";
import type {
  ComputedDailyDiscounts,
  VenueDailyDiscountsRecord,
} from "./discounts-types";

export function computeDailyDiscounts(
  record: VenueDailyDiscountsRecord,
  totalTaxPct: number,
): ComputedDailyDiscounts {
  const totalFoodDiscountGs =
    record.lunch_food_discount_gs + record.dinner_food_discount_gs;
  const totalBeveragesDiscountGs =
    record.lunch_beverages_discount_gs + record.dinner_beverages_discount_gs;
  const totalWineDiscountGs =
    record.lunch_wine_discount_gs + record.dinner_wine_discount_gs;
  const totalShishaDiscountGs =
    record.lunch_shisha_discount_gs + record.dinner_shisha_discount_gs;
  const totalOthersDiscountGs =
    record.lunch_others_discount_gs + record.dinner_others_discount_gs;

  return {
    weekNumber: getIsoWeekNumber(record.sale_date),
    weekDay: getWeekDayLabel(record.sale_date),
    totalFoodDiscountGs,
    totalFoodDiscountNet: grossToNet(totalFoodDiscountGs, totalTaxPct),
    totalBeveragesDiscountGs,
    totalBeveragesDiscountNet: grossToNet(totalBeveragesDiscountGs, totalTaxPct),
    totalWineDiscountGs,
    totalWineDiscountNet: grossToNet(totalWineDiscountGs, totalTaxPct),
    totalShishaDiscountGs,
    totalShishaDiscountNet: grossToNet(totalShishaDiscountGs, totalTaxPct),
    totalOthersDiscountGs,
    totalOthersDiscountNet: grossToNet(totalOthersDiscountGs, totalTaxPct),
  };
}
