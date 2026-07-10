import type { AccessLevel } from "@/lib/role-permissions";

export type DashboardWidgetProps = {
  venueId: string;
  isGlobalVenue: boolean;
  leadDays?: number;
};

export type DashboardWidgetDef = {
  key: string;
  moduleKey: string;
  title: string;
  scope: "venue" | "global" | "both";
  requiredFeature: { moduleKey: string; featureKey: string; minLevel?: AccessLevel };
  load: () => Promise<React.ComponentType<DashboardWidgetProps>>;
};

const dashboardWidgets: DashboardWidgetDef[] = [
  {
    key: "hr-expiry",
    moduleKey: "hr",
    title: "HR expiries",
    scope: "both",
    requiredFeature: { moduleKey: "hr", featureKey: "staff", minLevel: "view" },
    load: async () => {
      const mod = await import("@/components/hr/hr-expiry-dashboard-widget");
      return mod.HrExpiryDashboardWidget;
    },
  },
];

export function getDashboardWidgets(): DashboardWidgetDef[] {
  return dashboardWidgets;
}
