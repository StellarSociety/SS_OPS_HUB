import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { CollectSubNav } from "@/components/guests-intel/collect-sub-nav";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessCollect } from "@/lib/guests-intel/permissions";
import { getGuestsIntelPageContext } from "@/lib/guests-intel/page-context";

export default async function CollectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getGuestsIntelPageContext();

  if (!canAccessCollect(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full flex-col gap-6">
      <div className="shrink-0 space-y-6">
        <div>
          <ModulePageTitle>Collect</ModulePageTitle>
          <p className="mt-1 text-sm text-black/60">
            Fill the form on a phone, or share a QR and link so guests can complete
            it themselves.
          </p>
          <hr className="mt-4 border-black/10" />
        </div>
        <CollectSubNav />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
