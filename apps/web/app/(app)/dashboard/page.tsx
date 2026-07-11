import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardModuleTabs } from "@/components/dashboard/dashboard-module-tabs";
import { DashboardsPanel } from "@/components/dashboard/dashboards-panel";
import { SalesTrendCharts } from "@/components/sales/sales-trend-charts";
import { loadModulesHubContext } from "@/lib/modules-hub-data";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { canAccessSalesModule } from "@/lib/sales/permissions";
import type { UserPermission } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cookieStore = await cookies();
  const slug = cookieStore.get(ACTIVE_VENUE_COOKIE)?.value;
  if (!slug) redirect("/select-venue");

  const { data: venue } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!venue) redirect("/select-venue");

  const isGlobal = venue.is_global;

  const [{ sections }, { data: permissions }] = await Promise.all([
    loadModulesHubContext(),
    supabase.from("user_permissions").select("*").eq("user_id", user.id),
  ]);

  const perms = (permissions ?? []) as UserPermission[];

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

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <h1 className="pl-[21px] font-serif text-3xl text-[#3D421F]">
          {isGlobal ? "All Venues Apps" : `${venue.name} Apps`}
        </h1>
        <DashboardModuleTabs sections={sections} />
      </div>

      <DashboardsPanel slots={{ revenue: revenueSlot }} />
    </div>
  );
}
