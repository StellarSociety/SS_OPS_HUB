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
  const totalFoodDiscountGs = record.food_discount_gs;
  const totalBeveragesDiscountGs = record.beverages_discount_gs;
  const totalWineDiscountGs = record.wine_discount_gs;
  const totalShishaDiscountGs = record.shisha_discount_gs;
  const totalOthersDiscountGs = record.others_discount_gs;

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
