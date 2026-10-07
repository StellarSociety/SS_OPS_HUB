import { StaffPromotions } from "@/components/hr/staff-promotions";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";
import { canViewSalary } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { listPromotionItems } from "@/lib/hr/promotions";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function StaffPromotionsPage() {
  const { venue, permissions } = await getHrPageContext();

  const showSalary = canViewSalary(permissions, venue.id);
  const items = await listPromotionItems(venue.id, { showSalary });

  return (
    <StaffPromotions
      items={items}
      todayIso={dubaiTodayIso()}
      canViewSalary={showSalary}
      venueName={venue.name}
      logoUrl={getVenueLogoUrl(venue)}
    />
  );
}
