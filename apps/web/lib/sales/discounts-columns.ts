import type {
  ComputedDailyDiscounts,
  VenueDailyDiscountsInputField,
} from "./discounts-types";

export type ColumnKind = "date" | "meta" | "input" | "money";

export type DiscountsColumn = {
  key: string;
  label: string;
  kind: ColumnKind;
  field?: VenueDailyDiscountsInputField;
  computedKey?: keyof ComputedDailyDiscounts;
  group: string;
  section: "fixed" | "lunch" | "dinner" | "total";
};

export const DISCOUNTS_SECTION_LABELS = {
  fixed: "",
  lunch: "Lunch",
  dinner: "Dinner",
  total: "Totals",
} as const;

export const DISCOUNTS_COLUMNS: DiscountsColumn[] = [
  { key: "sale_date", label: "Date", kind: "date", group: "Date", section: "fixed" },
  {
    key: "weekNumber",
    label: "Week #",
    kind: "meta",
    computedKey: "weekNumber",
    group: "Week",
    section: "fixed",
  },
  {
    key: "weekDay",
    label: "Week Day",
    kind: "meta",
    computedKey: "weekDay",
    group: "Day",
    section: "fixed",
  },
  {
    key: "lunch_food_discount_gs",
    label: "Food Discounts",
    kind: "input",
    field: "lunch_food_discount_gs",
    group: "Food",
    section: "lunch",
  },
  {
    key: "lunch_beverages_discount_gs",
    label: "Beverages Discounts",
    kind: "input",
    field: "lunch_beverages_discount_gs",
    group: "Beverages",
    section: "lunch",
  },
  {
    key: "lunch_wine_discount_gs",
    label: "Wine Discounts",
    kind: "input",
    field: "lunch_wine_discount_gs",
    group: "Wine",
    section: "lunch",
  },
  {
    key: "lunch_shisha_discount_gs",
    label: "Shisha Discounts",
    kind: "input",
    field: "lunch_shisha_discount_gs",
    group: "Shisha",
    section: "lunch",
  },
  {
    key: "lunch_others_discount_gs",
    label: "Other Discounts",
    kind: "input",
    field: "lunch_others_discount_gs",
    group: "Others",
    section: "lunch",
  },
  {
    key: "dinner_food_discount_gs",
    label: "Food Discounts",
    kind: "input",
    field: "dinner_food_discount_gs",
    group: "Food",
    section: "dinner",
  },
  {
    key: "dinner_beverages_discount_gs",
    label: "Beverages Discounts",
    kind: "input",
    field: "dinner_beverages_discount_gs",
    group: "Beverages",
    section: "dinner",
  },
  {
    key: "dinner_wine_discount_gs",
    label: "Wine Discounts",
    kind: "input",
    field: "dinner_wine_discount_gs",
    group: "Wine",
    section: "dinner",
  },
  {
    key: "dinner_shisha_discount_gs",
    label: "Shisha Discounts",
    kind: "input",
    field: "dinner_shisha_discount_gs",
    group: "Shisha",
    section: "dinner",
  },
  {
    key: "dinner_others_discount_gs",
    label: "Other Discounts",
    kind: "input",
    field: "dinner_others_discount_gs",
    group: "Others",
    section: "dinner",
  },
  {
    key: "totalFoodDiscountGs",
    label: "Total Food Discounts Gross",
    kind: "money",
    computedKey: "totalFoodDiscountGs",
    group: "Food",
    section: "total",
  },
  {
    key: "totalFoodDiscountNet",
    label: "Total Food Discounts Net",
    kind: "money",
    computedKey: "totalFoodDiscountNet",
    group: "Food",
    section: "total",
  },
  {
    key: "totalBeveragesDiscountGs",
    label: "Total Beverages Discounts Gross",
    kind: "money",
    computedKey: "totalBeveragesDiscountGs",
    group: "Beverages",
    section: "total",
  },
  {
    key: "totalBeveragesDiscountNet",
    label: "Total Beverages Discounts Net",
    kind: "money",
    computedKey: "totalBeveragesDiscountNet",
    group: "Beverages",
    section: "total",
  },
  {
    key: "totalWineDiscountGs",
    label: "Total Wine Discounts Gross",
    kind: "money",
    computedKey: "totalWineDiscountGs",
    group: "Wine",
    section: "total",
  },
  {
    key: "totalWineDiscountNet",
    label: "Total Wine Discounts Net",
    kind: "money",
    computedKey: "totalWineDiscountNet",
    group: "Wine",
    section: "total",
  },
  {
    key: "totalShishaDiscountGs",
    label: "Total Shisha Discounts Gross",
    kind: "money",
    computedKey: "totalShishaDiscountGs",
    group: "Shisha",
    section: "total",
  },
  {
    key: "totalShishaDiscountNet",
    label: "Total Shisha Discounts Net",
    kind: "money",
    computedKey: "totalShishaDiscountNet",
    group: "Shisha",
    section: "total",
  },
  {
    key: "totalOthersDiscountGs",
    label: "Total Other Discounts Gross",
    kind: "money",
    computedKey: "totalOthersDiscountGs",
    group: "Others",
    section: "total",
  },
  {
    key: "totalOthersDiscountNet",
    label: "Total Other Discounts Net",
    kind: "money",
    computedKey: "totalOthersDiscountNet",
    group: "Others",
    section: "total",
  },
];

export function columnsForSection(
  section: DiscountsColumn["section"],
): DiscountsColumn[] {
  return DISCOUNTS_COLUMNS.filter((col) => col.section === section);
}

export function sectionColSpan(section: DiscountsColumn["section"]): number {
  return columnsForSection(section).length;
}
