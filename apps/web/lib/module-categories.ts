export type ModuleCategoryKey =
  | "operational"
  | "revenue"
  | "people"
  | "management";

export type ModuleCategory = {
  key: ModuleCategoryKey;
  label: string;
};

export const moduleCategories: ModuleCategory[] = [
  { key: "operational", label: "Operational" },
  { key: "revenue", label: "Revenue" },
  { key: "people", label: "People" },
  { key: "management", label: "Management" },
];

export const moduleCategoryMeta: Record<
  ModuleCategoryKey,
  { pageTitle: string; description: string; href: string }
> = {
  operational: {
    pageTitle: "Operational Apps",
    href: "/modules/operational",
    description:
      "Day-to-day venue operations — checklists, team projects, maintenance, and guest sentiment tools to keep service running smoothly.",
  },
  revenue: {
    pageTitle: "Revenue Apps",
    href: "/modules/revenue",
    description:
      "Sales performance, gross profit, cost of sales, and accounting workflows to track financial health across the venue.",
  },
  people: {
    pageTitle: "People Apps",
    href: "/modules/people",
    description:
      "Human resources and learning & development — manage staffing, roles, records, and training in one place.",
  },
  management: {
    pageTitle: "Management Apps",
    href: "/modules/management",
    description:
      "Venue governance and approvals — oversight tools for leadership, policies, and compliance workflows.",
  },
};

export function isModuleCategoryKey(value: string): value is ModuleCategoryKey {
  return moduleCategories.some((category) => category.key === value);
}

export function getModuleCategoryMeta(key: ModuleCategoryKey) {
  return moduleCategoryMeta[key];
}
