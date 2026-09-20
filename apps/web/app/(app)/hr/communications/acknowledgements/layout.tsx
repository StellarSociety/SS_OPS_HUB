import { AcknowledgementsReminderInfo } from "@/components/hr/acknowledgements-reminder-info";
import { AcknowledgementsSection } from "@/components/hr/acknowledgements-sub-nav";
import { getAcknowledgementReminderSettings } from "@/lib/actions/hr-acknowledgements";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";

export default async function HrAcknowledgementsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();
  const settings = await getAcknowledgementReminderSettings();
  const canEdit =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  return (
    <AcknowledgementsSection
      reminder={
        <AcknowledgementsReminderInfo settings={settings} canEdit={canEdit} />
      }
    >
      {children}
    </AcknowledgementsSection>
  );
}
