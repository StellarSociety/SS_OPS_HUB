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
  section: "fixed" | "input" | "total";
};

export const DISCOUNTS_SECTION_LABELS = {
  fixed: "",
  input: "Discounts",
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
    key: "food_discount_gs",
    label: "Food Discounts",
    kind: "input",
    field: "food_discount_gs",
    group: "Food",
    section: "input",
  },
  {
    key: "beverages_discount_gs",
    label: "Beverages Discounts",
    kind: "input",
    field: "beverages_discount_gs",
    group: "Beverages",
    section: "input",
  },
  {
    key: "wine_discount_gs",
    label: "Wine Discounts",
    kind: "input",
    field: "wine_discount_gs",
    group: "Wine",
    section: "input",
  },
  {
    key: "shisha_discount_gs",
    label: "Shisha Discounts",
    kind: "input",
    field: "shisha_discount_gs",
    group: "Shisha",
    section: "input",
  },
  {
    key: "others_discount_gs",
    label: "Other Discounts",
    kind: "input",
    field: "others_discount_gs",
    group: "Others",
    section: "input",
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
