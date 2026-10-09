import { StaffPromotions } from "@/components/hr/staff-promotions";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";
import {
  canAdminLookups,
  canEditStaff,
  canViewSalary,
} from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  listLatestPositionSalaryEmails,
  processDueScheduledPositionSalaryEmails,
} from "@/lib/hr/process-position-salary-emails";
import { listPromotionItems } from "@/lib/hr/promotions";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function StaffPromotionsPage() {
  const { venue, permissions } = await getHrPageContext();

  const showSalary = canViewSalary(permissions, venue.id);
  // Letters quote salaries, so emailing needs staff edit and salary access.
  const canEmail =
    showSalary &&
    (canEditStaff(permissions, venue.id) ||
      canAdminLookups(permissions, venue.id));

  if (canEmail) {
    // The cron runs daily; also send anything due whenever the page loads.
    await processDueScheduledPositionSalaryEmails({ limit: 25 }).catch(
      (error) => console.error("[hr/promotions] scheduled letters", error),
    );
  }

  const [items, emailRecords] = await Promise.all([
    listPromotionItems(venue.id, { showSalary }),
    canEmail ? listLatestPositionSalaryEmails(venue.id) : null,
  ]);

  return (
    <StaffPromotions
      items={items}
      todayIso={dubaiTodayIso()}
      canViewSalary={showSalary}
      venueName={venue.name}
      logoUrl={getVenueLogoUrl(venue)}
      emailRecords={emailRecords}
    />
  );
}
