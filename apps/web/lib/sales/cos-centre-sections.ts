import {
  BarChart3,
  ClipboardList,
  Receipt,
  ShoppingCart,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

/** Sub-pages of each cost centre (Food, Beverage, Wine, Other), left to right. */
export type CosCentreSection =
  | "cost-runs"
  | "insights"
  | "purchases"
  | "sales"
  | "adjustments";

export const COS_CENTRE_SECTIONS: {
  key: CosCentreSection;
  label: string;
  icon: LucideIcon;
}[] = [
  { key: "insights", label: "Insights", icon: BarChart3 },
  { key: "cost-runs", label: "Cost Runs", icon: ClipboardList },
  { key: "purchases", label: "Purchases", icon: ShoppingCart },
  { key: "sales", label: "Sales/Discounts", icon: Receipt },
  { key: "adjustments", label: "Adjustments", icon: SlidersHorizontal },
];
