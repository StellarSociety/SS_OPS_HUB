import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DashboardModuleTabs } from "@/components/dashboard/dashboard-module-tabs";
import { DashboardWelcome } from "@/components/dashboard/dashboard-welcome";
import { DashboardsPanel } from "@/components/dashboard/dashboards-panel";
import { SalesTrendCharts } from "@/components/sales/sales-trend-charts";
import { loadModulesHubContext } from "@/lib/modules-hub-data";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { canAccessSalesModule } from "@/lib/sales/permissions";
import {
  canAccessHrOverview,
  maskSensitiveStaffFields,
} from "@/lib/hr/permissions";
import { listOffBoardingItems } from "@/lib/hr/offboarding";
import { buildHrOverviewStats } from "@/lib/hr/overview";
import { listStaffForVenue } from "@/lib/hr/store";
import { HrOverview } from "@/components/hr/hr-overview";
import type { UserPermission } from "@/lib/role-permissions";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
export default async function DashboardPage() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect("/login");

  const venue = await getRenderVenue();
  if (!venue) redirect("/select-venue");

  const [{ sections }, { data: permissions }, { data: profile }] =
    await Promise.all([
      loadModulesHubContext(),
      supabase.from("user_permissions").select("*").eq("user_id", user.id),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single(),
    ]);

  const perms = (permissions ?? []) as UserPermission[];
  const userName = (profile?.full_name as string | null)?.trim() || null;

  let revenueSlot: ReactNode = null;
  if (canAccessSalesModule(perms, venue.id)) {
    try {
      const [records, taxSettings] = await Promise.all([
        listVenueDailySales(supabase, venue.id),
        getVenueSalesTaxSettings(supabase, venue.id),
      ]);
      const totalTaxPct = totalTaxRateFromSettings(taxSettings);
      revenueSlot = (
        <SalesTrendCharts records={records} totalTaxPct={totalTaxPct} />
      );
    } catch (error) {
      console.error("[dashboard/revenue-charts]", error);
    }
  }

  let hrSlot: ReactNode = null;
  if (canAccessHrOverview(perms, venue.id)) {
    try {
      const staff = await listStaffForVenue(supabase, venue.id);
      const visibleStaff = staff.map((member) =>
        maskSensitiveStaffFields(member, perms, venue.id),
      );
      hrSlot = (
        <HrOverview
          stats={buildHrOverviewStats(visibleStaff, [])}
          offBoarding={listOffBoardingItems(visibleStaff)}
        />
      );
    } catch (error) {
      console.error("[dashboard/hr-overview]", error);
    }
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <DashboardWelcome venue={venue} userName={userName} />

      <DashboardModuleTabs
        sections={sections}
        dashboardsPanel={
          <DashboardsPanel slots={{ revenue: revenueSlot, hr: hrSlot }} />
        }
      />
    </div>
  );
}
