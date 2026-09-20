import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { MobileUsersAccessClient } from "@/components/mobile/mobile-users-access-client";
import { listMobileUsersAccess } from "@/lib/actions/mobile-installs";
import { getMobilePageContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";

export default async function MobileUsersAccessPage() {
  const { permissions, venue } = await getMobilePageContext();

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const records = await listMobileUsersAccess();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>Users Device</ModulePageTitle>
        <hr className="mt-4 border-black/10" />
      </div>
      <MobileUsersAccessClient records={records} />
    </div>
  );
}
