import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { getMobilePageContext } from "@/lib/mobile/page-context";
import { canAccessSettings } from "@/lib/mobile/permissions";

export default async function MobileSettingsPage() {
  const { venue, permissions } = await getMobilePageContext();

  if (!canAccessSettings(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>Mobile App Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Configuration for the Mobile App at {venue.name} will live here.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
    </div>
  );
}
