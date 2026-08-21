import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileRevenueScreen } from "@/components/mobile/mobile-revenue-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { canAccessOverview } from "@/lib/sales/permissions";
import { loadSalesOverviewData } from "@/lib/sales/sales-overview-data";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileRevenuePage({ params }: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions, supabase } = await getMobileAppContext(venueSlug);

  if (
    !canAccessMobileApp(permissions, venue.id) ||
    !canAccessOverview(permissions, venue.id)
  ) {
    return <MobileAccessDenied />;
  }

  const overview = await loadSalesOverviewData(supabase, venue.id);

  return (
    <div className="h-dvh overflow-hidden mobile-app-canvas">
      <MobileRevenueScreen venue={venue} overview={overview} />
    </div>
  );
}
