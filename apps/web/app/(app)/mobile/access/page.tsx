import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { MobileUsersAccessMatrixClient } from "@/components/mobile/mobile-users-access-matrix-client";
import { listMobileAccessMatrix } from "@/lib/actions/mobile-user-access";
import { getMobilePageContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";

export default async function MobileUsersAccessMatrixPage() {
  const { permissions, venue } = await getMobilePageContext();

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const data = await listMobileAccessMatrix();

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <ModulePageTitle>Users Access</ModulePageTitle>
        <hr className="mt-4 border-black/10" />
      </div>
      <MobileUsersAccessMatrixClient data={data} />
    </div>
  );
}
