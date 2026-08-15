import { Card } from "@/components/ui/card";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";

export default async function HrEmailsOnboardingSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <Card className="space-y-6 p-5">
          <div>
            <h2 className="font-serif text-lg text-[#3D421F]">On-Boarding</h2>
            <p className="mt-1 text-sm text-black/55">
              Templates grouped by onboarding checklist stage. Delivery uses
              Venue Settings → Email config.
            </p>
          </div>
        </Card>
      ) : (
        <p className="text-sm text-black/55">
          You need staff edit access to change these settings.
        </p>
      )}
    </div>
  );
}
