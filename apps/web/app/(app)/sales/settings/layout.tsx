import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessSalesWaitersSettings, canAccessVenueDaily } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSalesPageContext();

  if (
    !canAccessVenueDaily(permissions, venue.id) &&
    !canAccessSalesWaitersSettings(permissions, venue.id)
  ) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Sales & Revenue settings for this venue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>Sales & Revenue Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Configuration for {venue.name} — tax rates, waiters, and sales defaults.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      {children}
    </div>
  );
}
