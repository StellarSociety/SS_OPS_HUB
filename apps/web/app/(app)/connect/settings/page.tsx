import { ArrowLeft } from "lucide-react";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ConnectGroupsAdmin } from "@/components/connect/connect-groups-admin";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ScopedLink } from "@/components/layout/scoped-link";
import { getConnectPageContext } from "@/lib/connect/page-context";
import { listConnectGroups } from "@/lib/connect/store";

export default async function ConnectSettingsPage() {
  const { service, venue, user, seesAllGroups, isConnectAdmin } =
    await getConnectPageContext();

  if (!seesAllGroups) return <AccessDeniedBounce />;

  const groups = await listConnectGroups(
    service,
    venue.id,
    { userId: user.id, seesAllGroups: true, isConnectAdmin },
    { includeArchived: true },
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <ScopedLink
          href="/connect/chats"
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-black/55 hover:text-black/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Connecteam
        </ScopedLink>
        <ModulePageTitle>Connecteam Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Groups for {venue.name}. Open a group to set each employee&apos;s rights.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>
      <ConnectGroupsAdmin groups={groups} canEdit={isConnectAdmin} />
    </div>
  );
}
